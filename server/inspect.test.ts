import assert from "node:assert/strict";
import { test } from "node:test";
import type { PaseoApi } from "@getpaseo/client";

import { inspectWorkspaceStack } from "./inspect.ts";

test("concurrent cache misses share one stack inspection", async () => {
  let refreshes = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const paseo = {
    workspaces: {
      ref: () => ({
        refresh: async () => {
          refreshes += 1;
          await gate;
          return {
            id: "workspace-concurrent",
            name: "Concurrent",
            title: null,
            workspaceDirectory: null,
          };
        },
      }),
    },
  } as unknown as PaseoApi;

  const requests = Array.from({ length: 20 }, () =>
    inspectWorkspaceStack(paseo, "workspace-concurrent", true),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshes, 1);
  release();
  const results = await Promise.all(requests);
  assert.equal(results.length, 20);
  assert.ok(results.every((result) => result.workspaceId === "workspace-concurrent"));
});

test("different workspaces are inspected serially", async () => {
  const releases: Array<() => void> = [];
  let active = 0;
  let peak = 0;
  const paseo = {
    workspaces: {
      ref: (workspaceId: string) => ({
        refresh: async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise<void>((resolve) => releases.push(resolve));
          active -= 1;
          return {
            id: workspaceId,
            name: workspaceId,
            title: null,
            workspaceDirectory: null,
          };
        },
      }),
    },
  } as unknown as PaseoApi;

  const first = inspectWorkspaceStack(paseo, "serialized-a", true);
  const second = inspectWorkspaceStack(paseo, "serialized-b", true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 1);
  releases.shift()?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 1);
  releases.shift()?.();
  await Promise.all([first, second]);
  assert.equal(peak, 1);
});
