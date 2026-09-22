import { type PluginSurfaceProps, usePaseo, useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  getStack,
  type AttentionLevel,
  type StackBranch,
  type StackSnapshot,
} from "../shared/contracts";
import { CompactPrRow } from "./pr-row";
import { publishStack, stackQueryKey } from "./status";

type PaseoApi = ReturnType<typeof usePaseo>;

const centerQueryKey = ["paseo-graphite", "center", "client-scan-v2"] as const;
const SCAN_CONCURRENCY = 1;
const CENTER_REFRESH_MS = 5 * 60_000;

interface CenterData {
  inspectedAt: string;
  scannedWorkspaces: number;
  skippedWorkspaces: number;
  stacks: StackSnapshot[];
}

interface ScanProgress {
  completed: number;
  total: number;
}

interface CenterItem {
  stack: StackSnapshot;
  branch: StackBranch;
}

type InspectStack = (input: { workspaceId: string; refresh?: boolean }) => Promise<StackSnapshot>;

const SECTION_ORDER: Array<{ level: AttentionLevel; title: string; icon: string }> = [
  { level: "action", title: "Needs your attention", icon: "CircleAlert" },
  { level: "ready", title: "Approved", icon: "CircleCheck" },
  { level: "waiting", title: "Waiting", icon: "Clock3" },
  { level: "done", title: "Merged / closed", icon: "Archive" },
];

function levelColor(level: AttentionLevel, theme: PluginSurfaceProps["theme"]): string {
  if (level === "action") return theme.colors.statusDanger;
  if (level === "ready") return theme.colors.statusSuccess;
  if (level === "waiting") return theme.colors.statusWarning;
  return theme.colors.foregroundMuted;
}

function repositoryLabel(stack: StackSnapshot): string {
  return stack.repository
    ? `${stack.repository.owner}/${stack.repository.name}`
    : stack.workspaceName;
}

function stackIdentity(stack: StackSnapshot): string {
  const repository = stack.repository
    ? `${stack.repository.owner}/${stack.repository.name}`
    : stack.directory;
  const branches = stack.branches
    .map((branch) => branch.pr?.number ? `#${branch.pr.number}` : branch.branch)
    .sort()
    .join(",");
  return `${repository}:${branches}`;
}

function snapshotScore(stack: StackSnapshot): number {
  return (
    stack.summary.action * 1_000
    + stack.summary.ready * 100
    + stack.summary.waiting * 10
    + stack.branches.length
  );
}

function dedupeStacks(stacks: StackSnapshot[]): StackSnapshot[] {
  const unique = new Map<string, StackSnapshot>();
  for (const stack of stacks) {
    const key = stackIdentity(stack);
    const current = unique.get(key);
    if (!current || snapshotScore(stack) > snapshotScore(current)) unique.set(key, stack);
  }
  return [...unique.values()].sort((left, right) => {
    const action = right.summary.action - left.summary.action;
    if (action !== 0) return action;
    const ready = right.summary.ready - left.summary.ready;
    if (ready !== 0) return ready;
    return left.workspaceName.localeCompare(right.workspaceName);
  });
}

async function listWorkspaceIds(paseo: PaseoApi): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await paseo.workspaces.list({
      sort: [{ key: "activity_at", direction: "desc" }],
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
    });
    for (const workspace of page.entries) {
      if (workspace.workspaceDirectory && !workspace.archivingAt) ids.push(workspace.id);
    }
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  return ids;
}

async function mapWithConcurrency<T>(
  values: string[],
  concurrency: number,
  visit: (value: string) => Promise<T>,
): Promise<T[]> {
  const results = new Array<T>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await visit(values[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

async function scanGraphiteStacks(
  paseo: PaseoApi,
  inspect: InspectStack,
  refresh: boolean,
  onStart: (total: number) => void,
  onProgress: (completed: number, snapshot: StackSnapshot | null) => void,
): Promise<CenterData> {
  const workspaceIds = await listWorkspaceIds(paseo);
  onStart(workspaceIds.length);
  let completed = 0;
  const results = await mapWithConcurrency(workspaceIds, SCAN_CONCURRENCY, async (workspaceId) => {
    let snapshot: StackSnapshot | null = null;
    try {
      snapshot = await inspect({ workspaceId, refresh });
      return snapshot;
    } catch {
      return null;
    } finally {
      completed += 1;
      onProgress(completed, snapshot);
    }
  });
  const stacks = results.filter(
    (snapshot): snapshot is StackSnapshot => Boolean(snapshot?.available && snapshot.branches.length > 0),
  );
  return {
    inspectedAt: new Date().toISOString(),
    scannedWorkspaces: workspaceIds.length,
    skippedWorkspaces: workspaceIds.length - stacks.length,
    stacks: dedupeStacks(stacks),
  };
}

export function GraphitePrCenter({ theme, layout, navigation }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const inspect = useRpc(getStack);
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<ScanProgress>({ completed: 0, total: 0 });
  const [partialStacks, setPartialStacks] = useState<StackSnapshot[]>([]);

  const beginScan = (total: number) => {
    setProgress({ completed: 0, total });
    setPartialStacks([]);
  };
  const recordProgress = (completed: number, snapshot: StackSnapshot | null) => {
    setProgress((current) => ({ completed, total: current.total }));
    if (!snapshot) return;
    queryClient.setQueryData(stackQueryKey(snapshot.workspaceId), snapshot);
    publishStack(snapshot);
    if (snapshot.available && snapshot.branches.length > 0) {
      setPartialStacks((current) => dedupeStacks([...current, snapshot]));
    }
  };

  const query = useQuery({
    queryKey: centerQueryKey,
    queryFn: () => scanGraphiteStacks(paseo, inspect, false, beginScan, recordProgress),
    // Paseo owns one query client per plugin installation. Keep the expensive
    // aggregate scan there when this surface unmounts so reopening is instant.
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Stay current while the center is actually open. Manual refresh remains
    // available for an immediate forced Graphite/GitHub update.
    refetchInterval: CENTER_REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const refresh = useMutation({
    mutationFn: () => scanGraphiteStacks(paseo, inspect, true, beginScan, recordProgress),
    onSuccess(data) {
      queryClient.setQueryData(centerQueryKey, data);
    },
  });

  const scanning = query.isFetching || refresh.isPending;
  const stacks = query.data?.stacks ?? partialStacks;
  const groups = useMemo(() => {
    const grouped = new Map<AttentionLevel, CenterItem[]>([
      ["action", []],
      ["ready", []],
      ["waiting", []],
      ["done", []],
    ]);
    for (const stack of stacks) {
      for (const branch of stack.branches) {
        grouped.get(branch.attention.level)!.push({ stack, branch });
      }
    }
    for (const items of grouped.values()) {
      items.sort((left, right) => {
        const updated = (right.branch.pr?.updatedAt ?? "").localeCompare(left.branch.pr?.updatedAt ?? "");
        if (updated !== 0) return updated;
        return left.branch.branch.localeCompare(right.branch.branch);
      });
    }
    return grouped;
  }, [stacks]);

  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: layout.compact ? 12 : 20, gap: 16 },
      title: { color: theme.colors.foreground, fontSize: layout.compact ? 22 : 26, fontWeight: "700" as const },
      detail: { color: theme.colors.foregroundMuted, fontSize: 12 },
    }),
    [theme, layout.compact],
  );

  const total = [...groups.values()].reduce((count, items) => count + items.length, 0);
  const error = query.error ?? refresh.error;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name="GitPullRequest" size={25} color={theme.colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Graphite PRs</Text>
          <Text style={styles.detail}>
            {stacks.length} stacks · {total} PR branches
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh all Graphite stacks"
          disabled={scanning}
          onPress={() => refresh.mutate()}
          style={{ padding: 9, borderRadius: 8, backgroundColor: theme.colors.surface2, opacity: scanning ? 0.6 : 1 }}
        >
          <Icon name="RefreshCw" size={17} color={theme.colors.foreground} />
        </Pressable>
      </View>

      {scanning ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9, padding: 10, borderRadius: 9, backgroundColor: theme.colors.surface1 }}>
          <ActivityIndicator size="small" color={theme.colors.accent} />
          <Text style={styles.detail}>
            Scanning {progress.completed}/{progress.total || "…"} workspaces…
          </Text>
        </View>
      ) : null}

      {error ? (
        <View style={{ padding: 12, borderRadius: 9, backgroundColor: theme.colors.surface1, gap: 8 }}>
          <Text style={{ color: theme.colors.statusDanger }}>Could not scan workspaces: {String(error)}</Text>
          <Pressable onPress={() => query.refetch()} style={{ alignSelf: "flex-start", padding: 8, borderRadius: 7, backgroundColor: theme.colors.surface2 }}>
            <Text style={{ color: theme.colors.foreground }}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {SECTION_ORDER.map((section) => (
          <View
            key={section.level}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 9,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: theme.colors.surface1,
            }}
          >
            <Icon name={section.icon} size={14} color={levelColor(section.level, theme)} />
            <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>
              {section.title} {groups.get(section.level)!.length}
            </Text>
          </View>
        ))}
      </View>

      {!scanning && stacks.length === 0 && !error ? (
        <View style={{ padding: 18, borderRadius: 12, backgroundColor: theme.colors.surface1, gap: 5 }}>
          <Text style={{ color: theme.colors.foreground, fontWeight: "600" }}>No active Graphite stacks</Text>
          <Text style={styles.detail}>Scanned {query.data?.scannedWorkspaces ?? 0} workspaces.</Text>
        </View>
      ) : null}

      {SECTION_ORDER.map((section) => {
        const items = groups.get(section.level)!;
        if (items.length === 0) return null;
        const color = levelColor(section.level, theme);
        return (
          <View key={section.level} style={{ gap: 7 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 2 }}>
              <Icon name={section.icon} size={17} color={color} />
              <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: 15, fontWeight: "700" }}>
                {section.title}
              </Text>
              <Text style={{ color, fontSize: 13, fontWeight: "700" }}>{items.length}</Text>
            </View>
            <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, overflow: "hidden" }}>
              {items.map(({ stack, branch }) => (
                <CompactPrRow
                  key={`${stack.workspaceId}:${branch.branch}`}
                  branch={branch}
                  theme={theme}
                  context={`${repositoryLabel(stack)} · ${stack.workspaceName}`}
                  onOpenWorkspace={navigation ? () => navigation.openWorkspace({ workspaceId: stack.workspaceId }) : undefined}
                />
              ))}
            </View>
          </View>
        );
      })}

      {query.data?.inspectedAt ? (
        <Text style={[styles.detail, { textAlign: "center", paddingBottom: 8 }]}>
          Scanned {query.data.scannedWorkspaces} workspaces · Updated {new Date(query.data.inspectedAt).toLocaleTimeString()}
        </Text>
      ) : null}
    </ScrollView>
  );
}
