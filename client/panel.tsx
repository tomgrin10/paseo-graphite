import {
  type PluginWorkspacePanelProps,
  usePaseo,
  useRpc,
  useWorkspace,
} from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { getStack } from "../shared/contracts";
import { dispatchFixAll } from "./fix-all";
import { CompactPrRow } from "./pr-row";
import { publishStack, stackQueryKey } from "./status";

function Count({
  label,
  value,
  color,
  theme,
}: {
  label: string;
  value: number;
  color: string;
  theme: PluginWorkspacePanelProps["theme"];
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{value}</Text>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

export function GraphiteStackPanel({
  theme,
  layout,
  workspaceId,
  navigation,
}: PluginWorkspacePanelProps) {
  const workspace = useWorkspace(workspaceId, ({ name }) => ({ name }));
  const paseo = usePaseo();
  const toast = useToast();
  const inspect = useRpc(getStack);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: stackQueryKey(workspaceId),
    queryFn: () => inspect({ workspaceId }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const refresh = useMutation({
    mutationFn: () => inspect({ workspaceId, refresh: true }),
    onSuccess(data) {
      queryClient.setQueryData(stackQueryKey(workspaceId), data);
      publishStack(data);
    },
  });
  const fixAll = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error("The stack is still loading.");
      return dispatchFixAll(paseo, workspaceId, query.data);
    },
    onSuccess(agentId) {
      toast.show("Fix All agent started", { variant: "success" });
      navigation?.openAgent({ agentId });
    },
    onError(error) {
      toast.error(error instanceof Error ? error.message : "Could not start the Fix All agent.");
    },
  });
  useEffect(() => {
    if (query.data) publishStack(query.data);
  }, [query.data]);

  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: layout.compact ? 10 : 12, gap: 9 },
      title: { color: theme.colors.foreground, fontSize: 18, fontWeight: "700" as const },
      detail: { color: theme.colors.foregroundMuted, fontSize: 11 },
    }),
    [theme, layout.compact],
  );

  if (query.isPending) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center", gap: 10 }]}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text style={styles.detail}>Reading the Graphite stack…</Text>
      </View>
    );
  }
  if (query.error) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.title}>Graphite stack</Text>
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{String(query.error)}</Text>
        <Pressable onPress={() => query.refetch()} style={{ padding: 9, borderRadius: 8, backgroundColor: theme.colors.surface2 }}>
          <Text style={{ color: theme.colors.foreground }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const snapshot = query.data!;
  const summaryColor = snapshot.summary.action
    ? theme.colors.statusDanger
    : snapshot.summary.ready
      ? theme.colors.statusSuccess
      : snapshot.summary.waiting
        ? theme.colors.statusWarning
        : theme.colors.foregroundMuted;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="GitPullRequest" size={20} color={summaryColor} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Graphite stack</Text>
          <Text numberOfLines={1} style={styles.detail}>{workspace?.name ?? snapshot.workspaceName}</Text>
        </View>
        {snapshot.available && snapshot.summary.action > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Fix all ${snapshot.summary.action} actionable pull requests with a new agent`}
            disabled={fixAll.isPending}
            onPress={() => fixAll.mutate()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 9,
              paddingVertical: 7,
              borderRadius: 8,
              backgroundColor: theme.colors.accent,
              opacity: fixAll.isPending ? 0.65 : 1,
            }}
          >
            {fixAll.isPending ? (
              <ActivityIndicator size="small" color={theme.colors.accentForeground} />
            ) : (
              <Icon name="Wrench" size={14} color={theme.colors.accentForeground} />
            )}
            <Text style={{ color: theme.colors.accentForeground, fontSize: 12, fontWeight: "700" }}>
              Fix All
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh Graphite stack"
          disabled={refresh.isPending}
          onPress={() => refresh.mutate()}
          style={{ padding: 7, borderRadius: 8, backgroundColor: theme.colors.surface2 }}
        >
          <Icon name="RefreshCw" size={15} color={theme.colors.foreground} />
        </Pressable>
      </View>

      {!snapshot.available ? (
        <View style={{ padding: 12, borderRadius: 10, gap: 5, backgroundColor: theme.colors.surface1 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>
            {snapshot.unavailable?.message ?? "No Graphite stack found"}
          </Text>
          {snapshot.unavailable?.hint ? <Text style={styles.detail}>{snapshot.unavailable.hint}</Text> : null}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 2 }}>
            <Count label="need you" value={snapshot.summary.action} color={theme.colors.statusDanger} theme={theme} />
            <Count label="ready" value={snapshot.summary.ready} color={theme.colors.statusSuccess} theme={theme} />
            <Count label="waiting" value={snapshot.summary.waiting} color={theme.colors.statusWarning} theme={theme} />
            <Count label="done" value={snapshot.summary.done} color={theme.colors.foregroundMuted} theme={theme} />
          </View>
          {snapshot.unavailable?.kind === "github" ? (
            <Text style={{ color: theme.colors.statusWarning, fontSize: 11 }}>
              Partial status · {snapshot.unavailable.message}
            </Text>
          ) : null}
          <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, overflow: "hidden" }}>
            {snapshot.branches.map((branch) => (
              <CompactPrRow key={branch.branch} branch={branch} theme={theme} />
            ))}
          </View>
        </>
      )}
      <Text style={[styles.detail, { textAlign: "center", paddingBottom: 4 }]}>
        Updated {new Date(snapshot.inspectedAt).toLocaleTimeString()}
      </Text>
    </ScrollView>
  );
}
