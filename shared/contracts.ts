import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const attentionLevelSchema = z.enum(["action", "ready", "waiting", "done"]);
export type AttentionLevel = z.infer<typeof attentionLevelSchema>;

export const attentionReasonSchema = z.enum([
  "merge-conflict",
  "review-comments",
  "changes-requested",
  "checks-failed",
  "needs-restack",
  "remote-newer",
  "submit-required",
  "publish-required",
  "request-review",
  "ready-to-merge",
  "merge-queued",
  "checks-running",
  "waiting-for-review",
  "merged",
  "closed",
]);
export type AttentionReason = z.infer<typeof attentionReasonSchema>;

const checkSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  requiredTotal: z.number().int().nonnegative(),
  requiredPassed: z.number().int().nonnegative(),
  requiredPending: z.number().int().nonnegative(),
  requiredFailed: z.number().int().nonnegative(),
  failingNames: z.array(z.string()),
  requiredFailingNames: z.array(z.string()),
});

export const stackBranchSchema = z.object({
  branch: z.string(),
  parent: z.string().nullable(),
  current: z.boolean(),
  localStatus: z.string().nullable(),
  submittedVersion: z.string().nullable(),
  remoteStatus: z.string().nullable(),
  graphitePrStatus: z.string().nullable(),
  graphiteUrl: z.string().url().nullable(),
  pr: z
    .object({
      number: z.number().int().positive(),
      title: z.string(),
      url: z.string().url(),
      state: z.string(),
      isDraft: z.boolean(),
      author: z.string().nullable(),
      viewerIsAuthor: z.boolean(),
      baseBranch: z.string(),
      headBranch: z.string(),
      mergeable: z.string(),
      mergeStateStatus: z.string(),
      reviewDecision: z.string(),
      reviewRequests: z.array(z.string()),
      totalThreads: z.number().int().nonnegative(),
      resolvedThreads: z.number().int().nonnegative(),
      unresolvedThreads: z.number().int().nonnegative(),
      checks: checkSummarySchema,
      updatedAt: z.string(),
    })
    .nullable(),
  attention: z.object({
    level: attentionLevelSchema,
    reasons: z.array(attentionReasonSchema),
    label: z.string(),
    command: z.string().nullable(),
  }),
});
export type StackBranch = z.infer<typeof stackBranchSchema>;

export const stackSnapshotSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  directory: z.string(),
  currentBranch: z.string().nullable(),
  trunk: z.string().nullable(),
  repository: z
    .object({
      owner: z.string(),
      name: z.string(),
    })
    .nullable(),
  viewer: z.string().nullable(),
  inspectedAt: z.string(),
  available: z.boolean(),
  unavailable: z
    .object({
      kind: z.enum(["not-git", "not-graphite", "untracked", "missing-cli", "github", "unknown"]),
      message: z.string(),
      hint: z.string().nullable(),
    })
    .nullable(),
  summary: z.object({
    total: z.number().int().nonnegative(),
    action: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    waiting: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
    label: z.string(),
  }),
  branches: z.array(stackBranchSchema),
});
export type StackSnapshot = z.infer<typeof stackSnapshotSchema>;

export const getStack = defineRpc({
  name: "graphite.stack.get",
  input: z.object({
    workspaceId: z.string().min(1),
    refresh: z.boolean().optional(),
  }),
  output: stackSnapshotSchema,
});
