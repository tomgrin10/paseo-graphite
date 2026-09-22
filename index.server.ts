import type { PluginServerContext } from "@getpaseo/plugin/server";
import { inspectWorkspaceStack } from "./server/inspect";
import { terminateAllCommands } from "./server/process";
import { getStack } from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  server.handle(getStack, ({ workspaceId, refresh }, { paseo }) =>
    inspectWorkspaceStack(paseo, workspaceId, refresh ?? false),
  );
  return terminateAllCommands;
}
