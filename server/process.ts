import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { constants } from "node:fs";

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

interface ActiveCommand {
  closed: Promise<void>;
  stop(): void;
  forceKill(): void;
}

const KNOWN_BIN_DIRS = [
  "/usr/bin",
  "/bin",
  "/usr/local/bin",
  "/opt/homebrew/bin",
  "/home/linuxbrew/.linuxbrew/bin",
  "/snap/bin",
];
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_KILL_GRACE_MS = 1_000;
const DESCENDANT_REAP_WAIT_MS = 2_000;
const USE_PROCESS_GROUPS = process.platform !== "win32";
const resolved = new Map<string, Promise<string | null>>();
const activeCommands = new Map<number, ActiveCommand>();

function signalCommand(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (pid === undefined) return;
  try {
    if (USE_PROCESS_GROUPS) process.kill(-pid, signal);
    else child.kill(signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function signalPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

// A forced plugin-worker exit cannot await cleanup. This synchronous fallback
// prevents its command groups from becoming PID-1-owned processes.
process.once("exit", () => {
  for (const command of activeCommands.values()) command.forceKill();
});

function linuxDescendants(rootPid: number): number[] {
  if (process.platform !== "linux") return [];
  const children = new Map<number, number[]>();
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const fields = readFileSync(`/proc/${name}/stat`, "utf8").split(") ", 2)[1]?.split(" ");
      const parent = Number(fields?.[1]);
      if (!Number.isInteger(parent)) continue;
      const siblings = children.get(parent) ?? [];
      siblings.push(Number(name));
      children.set(parent, siblings);
    } catch {
      // The process exited while /proc was being inspected.
    }
  }
  const descendants: number[] = [];
  const pending = [...(children.get(rootPid) ?? [])];
  while (pending.length > 0) {
    const pid = pending.pop()!;
    descendants.push(pid);
    pending.push(...(children.get(pid) ?? []));
  }
  return descendants;
}

async function waitForReaping(pids: Iterable<number>): Promise<void> {
  if (process.platform !== "linux") return;
  const pending = new Set(pids);
  const deadline = Date.now() + DESCENDANT_REAP_WAIT_MS;
  while (pending.size > 0 && Date.now() < deadline) {
    for (const pid of pending) {
      try {
        readFileSync(`/proc/${pid}/stat`);
      } catch {
        pending.delete(pid);
      }
    }
    if (pending.size > 0) await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function resolveExecutable(name: string, candidate: string): Promise<string> {
  if (name !== "gt") return candidate;
  const packageName: Record<string, string> = {
    "darwin-arm64": "@withgraphite/graphite-cli-darwin-arm64",
    "darwin-x64": "@withgraphite/graphite-cli-darwin-x64",
    "linux-arm64": "@withgraphite/graphite-cli-linux-arm64",
    "linux-x64": "@withgraphite/graphite-cli-linux-x64",
  };
  const platformPackage = packageName[`${process.platform}-${process.arch}`];
  if (!platformPackage) return candidate;
  const wrapper = await realpath(candidate).catch(() => candidate);
  if (!wrapper.endsWith(join("@withgraphite", "graphite-cli", "bin", "gt.js"))) return candidate;
  const native = join(dirname(dirname(wrapper)), "node_modules", platformPackage, "bin", "gt");
  try {
    await access(native, constants.X_OK);
    return native;
  } catch {
    return candidate;
  }
}

export function findBinary(name: string): Promise<string | null> {
  const cached = resolved.get(name);
  if (cached) return cached;
  const lookup = (async () => {
    const candidates = [
      ...(process.env.PATH ?? "").split(delimiter).filter(Boolean),
      ...KNOWN_BIN_DIRS,
    ];
    for (const directory of [...new Set(candidates)]) {
      const candidate = join(directory, name);
      try {
        await access(candidate, constants.X_OK);
        return resolveExecutable(name, candidate);
      } catch {
        // Keep looking.
      }
    }
    return null;
  })();
  resolved.set(name, lookup);
  return lookup;
}

export function runCommand(
  file: string,
  args: readonly string[],
  options: {
    cwd: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    killGraceMs?: number;
  },
): Promise<CommandResult> {
  if (options.signal?.aborted) {
    return Promise.resolve({ ok: false, stdout: "", stderr: "", code: null });
  }

  return new Promise((resolve) => {
    const child = spawn(file, [...args], {
      cwd: options.cwd,
      detached: USE_PROCESS_GROUPS,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1", TERM: "dumb", GH_PAGER: "cat", PAGER: "cat" },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stopped = false;
    let spawnError = false;
    let hardKillTimer: ReturnType<typeof setTimeout> | null = null;
    const descendantPids = new Set<number>();
    let resolveClosed: () => void = () => undefined;
    const closed = new Promise<void>((done) => {
      resolveClosed = done;
    });

    const forceKill = () => {
      if (child.pid !== undefined) {
        for (const pid of linuxDescendants(child.pid)) descendantPids.add(pid);
      }
      signalCommand(child, "SIGKILL");
      for (const pid of descendantPids) signalPid(pid, "SIGKILL");
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (child.pid !== undefined) {
        for (const pid of linuxDescendants(child.pid)) descendantPids.add(pid);
      }
      signalCommand(child, "SIGTERM");
      for (const pid of descendantPids) signalPid(pid, "SIGTERM");
      hardKillTimer = setTimeout(forceKill, options.killGraceMs ?? DEFAULT_KILL_GRACE_MS);
      hardKillTimer.unref();
    };
    if (child.pid !== undefined) activeCommands.set(child.pid, { closed, stop, forceKill });

    const append = (chunks: Buffer[], chunk: Buffer, currentBytes: number): number => {
      const remaining = MAX_OUTPUT_BYTES - currentBytes;
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      if (chunk.length > remaining) stop();
      return currentBytes + Math.min(chunk.length, Math.max(0, remaining));
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes = append(stdout, chunk, stdoutBytes);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes = append(stderr, chunk, stderrBytes);
    });
    child.once("error", () => {
      spawnError = true;
    });

    const timeout = setTimeout(stop, options.timeoutMs ?? 20_000);
    timeout.unref();
    const abort = () => stop();
    options.signal?.addEventListener("abort", abort, { once: true });

    child.once("close", (code) => {
      void (async () => {
        clearTimeout(timeout);
        if (hardKillTimer) clearTimeout(hardKillTimer);
        options.signal?.removeEventListener("abort", abort);
        await waitForReaping(descendantPids);
        if (child.pid !== undefined) activeCommands.delete(child.pid);
        resolveClosed();
        resolve({
          ok: !spawnError && !stopped && code === 0,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          code: typeof code === "number" ? code : null,
        });
      })();
    });
  });
}

export async function terminateAllCommands(): Promise<void> {
  const commands = [...activeCommands.values()];
  for (const command of commands) command.stop();
  await Promise.allSettled(commands.map((command) => command.closed));
}

export function stripAnsi(value: string): string {
  // ANSI CSI sequences emitted by `gt info`, even with NO_COLOR on older releases.
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}
