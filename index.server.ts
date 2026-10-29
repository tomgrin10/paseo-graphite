import { contributeAgentTools } from "./server/native-tools.ts";
import { displayPreferences } from "./shared/display";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { inspectWorkspaceStack } from "./server/inspect";
import { terminateAllCommands } from "./server/process";
import { getStack } from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const removeTools = contributeAgentTools(server);
  server.registerSettings(displayPreferences);
  server.handle(getStack, ({ workspaceId, refresh }, { paseo }) =>
    inspectWorkspaceStack(paseo, workspaceId, refresh ?? false),
  );
  return async () => { removeTools(); await terminateAllCommands(); };
}
