import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { runCommand } from "./process.ts";

async function waitForPid(path: string): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await readFile(path, "utf8").catch(() => "");
    if (/^\d+$/.test(value)) return Number(value);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("descendant did not publish its PID");
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function createLauncher(): Promise<{
  directory: string;
  launcher: string;
  pidFile: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "paseo-graphite-process-"));
  const child = join(directory, "child.mjs");
  const launcher = join(directory, "launcher.mjs");
  const pidFile = join(directory, "child.pid");
  await writeFile(
    child,
    `import { writeFileSync } from "node:fs";
writeFileSync(process.argv[2], String(process.pid));
process.on("SIGTERM", () => {});
setInterval(() => {}, 1_000);`,
  );
  await writeFile(
    launcher,
    `import { execFileSync } from "node:child_process";
execFileSync(process.execPath, [${JSON.stringify(child)}, process.argv[2]], { stdio: "inherit" });`,
  );
  return { directory, launcher, pidFile };
}

test(
  "a timed-out launcher kills its descendant process group and waits for cleanup",
  { skip: process.platform === "win32" },
  async () => {
    const fixture = await createLauncher();
    let descendantPid: number | null = null;
    try {
      const startedAt = Date.now();
      const command = runCommand(process.execPath, [fixture.launcher, fixture.pidFile], {
        cwd: fixture.directory,
        timeoutMs: 150,
        killGraceMs: 50,
      });
      descendantPid = await waitForPid(fixture.pidFile);
      const result = await command;

      assert.equal(result.ok, false);
      assert.ok(Date.now() - startedAt >= 150);
      assert.equal(isAlive(descendantPid), false);
    } finally {
      if (descendantPid !== null && isAlive(descendantPid)) process.kill(descendantPid, "SIGKILL");
      await rm(fixture.directory, { recursive: true });
    }
  },
);

test(
  "an aborted launcher kills its descendant process group",
  { skip: process.platform === "win32" },
  async () => {
    const fixture = await createLauncher();
    const controller = new AbortController();
    let descendantPid: number | null = null;
    try {
      const command = runCommand(process.execPath, [fixture.launcher, fixture.pidFile], {
        cwd: fixture.directory,
        timeoutMs: 10_000,
        killGraceMs: 50,
        signal: controller.signal,
      });
      descendantPid = await waitForPid(fixture.pidFile);
      controller.abort();
      const result = await command;

      assert.equal(result.ok, false);
      assert.equal(isAlive(descendantPid), false);
    } finally {
      if (descendantPid !== null && isAlive(descendantPid)) process.kill(descendantPid, "SIGKILL");
      await rm(fixture.directory, { recursive: true });
    }
  },
);
