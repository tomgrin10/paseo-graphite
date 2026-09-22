import type { PaseoApi, PaseoAgent } from "@getpaseo/client";
import type { StackSnapshot } from "../shared/contracts";

function providerSelection(agent: PaseoAgent): string {
  if (!agent.model || agent.provider.includes("/")) return agent.provider;
  return `${agent.provider}/${agent.model}`;
}

export function buildFixAllPrompt(snapshot: StackSnapshot): string {
  const actionable = snapshot.branches.filter((branch) => branch.attention.level === "action");
  const hasReviewFeedback = actionable.some((branch) =>
    branch.attention.reasons.some(
      (reason) => reason === "review-comments" || reason === "changes-requested",
    ),
  );
  const lines = hasReviewFeedback
    ? [
        "/fix-pr",
        "",
        "Use the existing /fix-pr workflow first for the code-review feedback, then continue with the remaining stack issues below.",
      ]
    : ["Fix every actionable issue in this Graphite PR stack."];

  lines.push(
    "",
    `Workspace: ${snapshot.workspaceName}`,
    `Repository: ${snapshot.repository ? `${snapshot.repository.owner}/${snapshot.repository.name}` : snapshot.directory}`,
    "",
    "Actionable PRs:",
  );
  for (const branch of actionable) {
    const identity = branch.pr ? `PR #${branch.pr.number}: ${branch.pr.title}` : branch.branch;
    lines.push(`- ${identity}`);
    lines.push(`  Graphite branch: ${branch.branch}`);
    lines.push(`  Graphite parent: ${branch.parent ?? snapshot.trunk ?? "unknown"}`);
    lines.push(`  Issues: ${branch.attention.reasons.join(", ") || branch.attention.label}`);
    if (branch.pr?.checks.requiredFailingNames.length) {
      lines.push(`  Failing required checks: ${branch.pr.checks.requiredFailingNames.join(", ")}`);
    }
    if (branch.graphiteUrl) lines.push(`  Graphite: ${branch.graphiteUrl}`);
  }
  lines.push(
    "",
    "Treat `gt log short --stack` and `gt info` as authoritative for stack membership and parentage; do not infer the Graphite stack from GitHub base branches.",
    "Resolve review feedback, failing checks, and merge conflicts; run focused verification; then update the affected PRs through the normal Graphite workflow.",
    "Do not merge any PR. Report what changed, what was submitted, and anything still blocked.",
  );
  return lines.join("\n");
}

export async function dispatchFixAll(
  paseo: PaseoApi,
  workspaceId: string,
  snapshot: StackSnapshot,
) {
  if (snapshot.summary.action === 0) throw new Error("This stack has no actionable issues.");

  const listed = await paseo.agents.list({
    filter: { includeArchived: false },
    page: { limit: 200 },
  });
  const source = listed.entries
    .map(({ agent }) => agent)
    .filter((agent) => agent.workspaceId === workspaceId && !agent.archivedAt)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!source) {
    throw new Error("Open an agent in this workspace once so Fix All can reuse its provider configuration.");
  }

  const config: {
    provider: string;
    modeId?: string;
    thinkingOptionId?: string;
  } = { provider: providerSelection(source) };
  if (source.currentModeId) config.modeId = source.currentModeId;
  const thinkingOptionId = source.effectiveThinkingOptionId ?? source.thinkingOptionId;
  if (thinkingOptionId) config.thinkingOptionId = thinkingOptionId;

  const agent = await paseo.workspaces.ref(workspaceId).agents.create({
    config,
    title: `Fix Graphite stack (${snapshot.summary.action})`,
    labels: {
      "paseo-graphite": "fix-all",
      "paseo-graphite-workspace": workspaceId,
    },
    prompt: buildFixAllPrompt(snapshot),
  });
  return agent.id;
}
