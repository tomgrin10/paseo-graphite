import { defineAgentTool, type PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { inspectWorkspaceStack } from "./inspect";
import { registerAgentTools } from "./agent-tools.ts";
export function contributeAgentTools(server: PluginServerContext) {
  return registerAgentTools(server, [defineAgentTool({
    name: "graphite_workspace_stack", description: "Read this workspace's Graphite stack, pull requests, failed checks and review action items. Does not submit, merge or change a PR.",
    input: z.object({ refresh: z.boolean().default(false) }).strict(),
    async execute({ refresh }, { agent, paseo, signal }) {
      if (signal.aborted) throw new Error("Tool call cancelled.");
      if (!agent.workspaceId) throw new Error("This agent has no workspace.");
      const result = await inspectWorkspaceStack(paseo, agent.workspaceId, refresh);
      return { text: JSON.stringify(result), structuredContent: result };
    },
  })], true);
}
