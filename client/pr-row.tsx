import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View } from "react-native";
import type { AttentionLevel, StackBranch } from "../shared/contracts";
import { openExternal } from "./web";

type Theme = PluginWorkspacePanelProps["theme"];

export function levelColor(level: AttentionLevel, theme: Theme): string {
  if (level === "action") return theme.colors.statusDanger;
  if (level === "ready") return theme.colors.statusSuccess;
  if (level === "waiting") return theme.colors.statusWarning;
  return theme.colors.foregroundMuted;
}

export function CompactPrRow({
  branch,
  theme,
  context,
  onOpenWorkspace,
}: {
  branch: StackBranch;
  theme: Theme;
  context?: string;
  onOpenWorkspace?: () => void;
}) {
  const tint = levelColor(branch.attention.level, theme);
  const pr = branch.pr;
  const title = pr ? `#${pr.number} ${pr.title}` : branch.branch;
  const checks = pr?.checks;
  const checkPassed = checks && checks.requiredTotal > 0 ? checks.requiredPassed : checks?.passed ?? 0;
  const checkTotal = checks && checks.requiredTotal > 0 ? checks.requiredTotal : checks?.total ?? 0;
  const checkFailed = checks && checks.requiredTotal > 0 ? checks.requiredFailed : checks?.failed ?? 0;
  const checkPending = checks && checks.requiredTotal > 0 ? checks.requiredPending : checks?.pending ?? 0;
  const titleContent = (
    <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>
      {title}
    </Text>
  );

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 9,
        gap: 5,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: branch.current ? theme.colors.surface2 : theme.colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tint }} />
        <View style={{ flex: 1 }}>
          {branch.graphiteUrl ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${title} in Graphite`}
              onPress={() => openExternal(branch.graphiteUrl!)}
            >
              {titleContent}
            </Pressable>
          ) : titleContent}
        </View>
        {onOpenWorkspace ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Paseo workspace"
            onPress={onOpenWorkspace}
            hitSlop={8}
            style={{ padding: 3 }}
          >
            <Icon name="FolderOpen" size={14} color={theme.colors.foregroundMuted} />
          </Pressable>
        ) : null}
        {branch.graphiteUrl ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open ${title} in Graphite`}
            onPress={() => openExternal(branch.graphiteUrl!)}
            hitSlop={8}
            style={{ padding: 3 }}
          >
            <Icon name="ExternalLink" size={14} color={theme.colors.foregroundMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={{ paddingLeft: 15, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
        <Text style={{ color: tint, fontSize: 11, fontWeight: "600" }}>
          {branch.attention.label}
        </Text>
        {pr && pr.totalThreads > 0 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
            {pr.resolvedThreads}/{pr.totalThreads} comments
          </Text>
        ) : null}
        {pr && checkTotal > 0 ? (
          <Text
            style={{
              color: checkFailed > 0
                ? theme.colors.statusDanger
                : checkPending > 0
                  ? theme.colors.statusWarning
                  : theme.colors.foregroundMuted,
              fontSize: 11,
            }}
          >
            {checkPassed}/{checkTotal} {pr.checks.requiredTotal > 0 ? "required" : "checks"}
          </Text>
        ) : null}
        {branch.attention.command ? (
          <Text style={{ color: theme.colors.accent, fontSize: 11 }}>{branch.attention.command}</Text>
        ) : null}
        {context ? (
          <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
            {context}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
