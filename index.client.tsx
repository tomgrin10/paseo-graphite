import type {
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { GraphitePrCenter } from "./client/center";
import { GraphiteStackPanel } from "./client/panel";
import {
  buttonLabel,
  buttonTitle,
  StackStatusIcon,
  subscribeStack,
} from "./client/status";

export default function contribute(client: PluginClientContext) {
  client.addSurface("graphite-prs", GraphitePrCenter);
  client.addSidebarItem({
    id: "graphite-prs",
    title: "Graphite PRs",
    icon: "GitPullRequest",
    surface: "graphite-prs",
  });

  client.addCommandCenterItem({
    id: "open-graphite-prs",
    title: "Open Graphite PRs",
    icon: "GitPullRequest",
    keywords: ["graphite", "pull request", "inbox", "review", "stacks"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("graphite-prs");
    },
  });

  client.addWorkspacePanel({
    id: "graphite-stack",
    title: "Graphite stack",
    icon: "GitPullRequest",
    context: "workspace",
    locations: ["explorer"],
    Component: GraphiteStackPanel,
  });

  client.addCommandCenterItem({
    id: "open-graphite-stack",
    title: "Open Graphite PR stack",
    icon: "GitPullRequest",
    keywords: ["pull request", "review", "checks", "comments", "stack"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("graphite-stack", { location: "explorer" });
    },
  });

  client.addSlashCommand({
    name: "pr-stack",
    description: "Open this workspace's Graphite PR stack",
    argumentHint: "",
    context: "agent",
    onSubmit({ openPanel }) {
      openPanel("graphite-stack", { location: "explorer" });
    },
  });

  type RegisteredButton = {
    workspaceId: string;
    button: PluginButtonRegistration;
    unsubscribeStatus: () => void;
  };
  const headers = new Map<string, RegisteredButton>();
  const pills = new Map<string, RegisteredButton>();
  let stopped = false;

  function descriptor(workspaceId: string) {
    return {
      title: "Open Graphite PR stack",
      icon: StackStatusIcon,
      label: "PR stack",
      behavior: {
        kind: "action" as const,
        onPress() {
          client.openPanel("graphite-stack", { workspaceId, location: "explorer" });
        },
      },
    };
  }

  function registerHeader(workspaceId: string) {
    if (headers.has(workspaceId)) return;
    const button = client.addHeaderButton({ id: "graphite-stack", workspaceId, button: descriptor(workspaceId) });
    const unsubscribeStatus = subscribeStack(workspaceId, (snapshot) =>
      button.update({ label: buttonLabel(snapshot), title: buttonTitle(snapshot) }),
    );
    headers.set(workspaceId, { workspaceId, button, unsubscribeStatus });
  }

  function removeHeader(workspaceId: string) {
    const entry = headers.get(workspaceId);
    entry?.button.remove();
    entry?.unsubscribeStatus();
    headers.delete(workspaceId);
  }

  function registerPill(agent: { id: string; workspaceId?: string | null; status?: string }) {
    if (!agent.workspaceId || agent.status === "closed") return;
    const agentId = agent.id;
    const workspaceId = agent.workspaceId;
    const existing = pills.get(agentId);
    if (existing?.workspaceId === workspaceId) return;
    existing?.button.remove();
    existing?.unsubscribeStatus();
    const button = client.addComposerPill({
      id: "graphite-stack",
      workspaceId,
      agentId,
      button: descriptor(workspaceId),
    });
    const unsubscribeStatus = subscribeStack(workspaceId, (snapshot) =>
      button.update({ label: buttonLabel(snapshot), title: buttonTitle(snapshot) }),
    );
    pills.set(agentId, { workspaceId, button, unsubscribeStatus });
  }

  function removePill(agentId: string) {
    const entry = pills.get(agentId);
    entry?.button.remove();
    entry?.unsubscribeStatus();
    pills.delete(agentId);
  }

  const unsubscribeWorkspaces = client.paseo.workspaces.subscribe((update) => {
    if (stopped) return;
    if (update.kind === "remove") removeHeader(update.id);
    else registerHeader(update.workspace.id);
  });
  void client.paseo.workspaces
    .list()
    .then(({ entries }) => {
      if (stopped) return;
      for (const workspace of entries) registerHeader(workspace.id);
    })
    .catch((error) => {
      if (!stopped) console.error("[paseo-graphite] workspace observation failed", error);
    });

  const unsubscribeAgents = client.paseo.agents.subscribe((update) => {
    if (stopped) return;
    if (update.kind === "remove") removePill(update.agentId);
    else registerPill(update.agent);
  });
  void client.paseo.agents
    .list()
    .then(({ entries }) => {
      if (stopped) return;
      for (const { agent } of entries) registerPill(agent);
    })
    .catch((error) => {
      if (!stopped) console.error("[paseo-graphite] agent observation failed", error);
    });

  return () => {
    stopped = true;
    unsubscribeWorkspaces();
    unsubscribeAgents();
    for (const id of [...headers.keys()]) removeHeader(id);
    for (const id of [...pills.keys()]) removePill(id);
  };
}
