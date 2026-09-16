import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AccessiblePressable as Pressable } from "@/components/AccessiblePressable";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";
import { useTheme } from "@/context/ThemeContext";
import { api, type LaboratoryMessage } from "@/lib/api";

interface LaboratoryThread {
  key: string;
  subject: string;
  messages: LaboratoryMessage[];
  latest: LaboratoryMessage;
  unreadCount: number;
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function messageTime(value?: string): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildThreads(messages: LaboratoryMessage[]): LaboratoryThread[] {
  const grouped = new Map<string, LaboratoryMessage[]>();
  messages.forEach((message, index) => {
    // The server derives patient ownership. labOrderId is only a local display
    // grouping key and is never sent as a patient selector to NaviMED.
    const key = message.labOrderId || message.id || "message-" + String(index);
    const thread = grouped.get(key) || [];
    thread.push(message);
    grouped.set(key, thread);
  });

  return Array.from(grouped.entries())
    .map(([key, threadMessages]) => {
      const ordered = [...threadMessages].sort((a, b) => messageTime(a.createdAt) - messageTime(b.createdAt));
      const latest = ordered[ordered.length - 1] || {};
      return {
        key,
        subject: threadMessages.find((message) => message.subject)?.subject || "Laboratory message",
        messages: ordered,
        latest,
        unreadCount: threadMessages.filter((message) => !message.readByPatientAt).length,
      };
    })
    .sort((a, b) => messageTime(b.latest.createdAt) - messageTime(a.latest.createdAt));
}

function ThreadCard({
  thread,
  colors,
  onPress,
}: {
  thread: LaboratoryThread;
  colors: any;
  onPress: () => void;
}) {
  const date = formatDate(thread.latest.createdAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={thread.subject}
      accessibilityHint="Opens the laboratory message thread"
      onPress={onPress}
      style={({ pressed }) => [styles.threadCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }, pressed && styles.pressed]}
    >
      <View style={[styles.threadIcon, { backgroundColor: colors.successLight }]}>
        <Feather name="activity" size={19} color={colors.success} />
      </View>
      <View style={styles.threadCopy}>
        <View style={styles.threadTitleRow}>
          <Text style={[styles.threadTitle, { color: colors.text }]} numberOfLines={1}>{thread.subject}</Text>
          {thread.unreadCount > 0 ? <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}><Text style={[styles.unreadBadgeText, { color: colors.onPrimary }]}>{thread.unreadCount}</Text></View> : null}
        </View>
        <Text style={[styles.threadPreview, { color: colors.textSecondary }]} numberOfLines={2}>{thread.latest.content || "No message content"}</Text>
        <View style={styles.threadMeta}>
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>{thread.messages.length} message{thread.messages.length === 1 ? "" : "s"}</Text>
          {date ? <Text style={[styles.metaText, { color: colors.textTertiary }]}>{date}</Text> : null}
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

function MessageBubble({ message, colors }: { message: LaboratoryMessage; colors: any }) {
  const isPatient = message.direction === "patient_to_laboratory";
  const date = formatDate(message.createdAt);
  return (
    <View style={[styles.messageRow, isPatient && styles.messageRowPatient]}>
      <View style={[styles.messageBubble, { backgroundColor: isPatient ? colors.primaryLight : colors.surface, borderColor: colors.borderLight }]}>
        <View style={styles.messageHeader}>
          <Text style={[styles.messageSender, { color: colors.text }]}>{isPatient ? "You" : "Laboratory"}</Text>
          {date ? <Text style={[styles.metaText, { color: colors.textTertiary }]}>{date}</Text> : null}
        </View>
        <Text style={[styles.messageContent, { color: colors.text }]}>{message.content || ""}</Text>
      </View>
    </View>
  );
}

function EmptyState({ colors }: { colors: any }) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}><Feather name="activity" size={32} color={colors.textTertiary} /></View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No Laboratory Messages</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Messages related to an approved laboratory handoff will appear here.</Text>
    </View>
  );
}

export default function LaboratoryMessagesScreen() {
  const { colors } = useTheme();
  const a11y = useAccessibilityLabels();
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["laboratory-messages"],
    queryFn: () => api.getLaboratoryMessages(),
  });
  const threads = useMemo(() => buildThreads(data || []), [data]);
  const selected = threads.find((thread) => thread.key === selectedKey) || null;
  const replyMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.replyToLaboratoryMessage(id, content),
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["laboratory-messages"] });
    },
  });

  const openThread = (thread: LaboratoryThread) => {
    setSelectedKey(thread.key);
    setReadError(null);
    const unreadIds = thread.messages
      .filter((message) => message.id && !message.readByPatientAt)
      .map((message) => message.id as string);
    if (unreadIds.length > 0) {
      void Promise.all(unreadIds.map((id) => api.markLaboratoryMessageRead(id)))
        .then(() => queryClient.invalidateQueries({ queryKey: ["laboratory-messages"] }))
        .catch((error) => setReadError(error instanceof Error ? error.message : "Unable to mark laboratory messages read."));
    }
  };

  if (isLoading) {
    return <View style={[styles.container, { backgroundColor: colors.background }]}><ScreenHeader title="Laboratory Messages" /><ListSkeleton /></View>;
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Laboratory Messages" />
        <View style={styles.centered}>
          <Feather name="wifi-off" size={36} color={colors.textTertiary} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>Unable to Load</Text>
          <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.textSecondary }]}>{(error as Error).message}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={a11y.refresh} onPress={() => refetch()} style={[styles.retryButton, { backgroundColor: colors.primary }]}><Text style={[styles.retryText, { color: colors.onPrimary }]}>Try Again</Text></Pressable>
        </View>
      </View>
    );
  }

  if (selected) {
    const latest = selected.latest.id;
    return (
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScreenHeader
          title="Laboratory Thread"
          subtitle={selected.subject}
          showBack={false}
          rightElement={<Pressable accessibilityRole="button" accessibilityLabel="All laboratory threads" onPress={() => setSelectedKey(null)} style={styles.headerLink}><Text style={[styles.headerLinkText, { color: colors.whiteText }]}>All</Text></Pressable>}
        />
        <ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled">
          {readError ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.danger }]}>{readError}</Text> : null}
          {selected.messages.map((message, index) => <MessageBubble key={message.id || String(index)} message={message} colors={colors} />)}
          <View style={[styles.replyPanel, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.replyLabel, { color: colors.textSecondary }]}>Reply to the laboratory</Text>
            {replyMutation.error ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.danger }]}>{(replyMutation.error as Error).message}</Text> : null}
            <TextInput
              accessibilityLabel="Laboratory reply"
              value={draft}
              onChangeText={setDraft}
              multiline
              textAlignVertical="top"
              placeholder="Write a reply..."
              placeholderTextColor={colors.textTertiary}
              style={[styles.replyInput, { backgroundColor: colors.surfaceSecondary, borderColor: colors.controlBorder, color: colors.text }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send laboratory reply"
              disabled={!latest || !draft.trim() || replyMutation.isPending}
              onPress={() => latest && replyMutation.mutate({ id: latest, content: draft.trim() })}
              style={[styles.replyButton, { backgroundColor: colors.primary }, (!latest || !draft.trim() || replyMutation.isPending) && styles.disabled]}
            >
              {replyMutation.isPending ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <><Feather name="send" size={16} color={colors.onPrimary} /><Text style={[styles.replyButtonText, { color: colors.onPrimary }]}>Send Reply</Text></>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const threadSubtitle = threads.length ? String(threads.length) + " thread" + (threads.length === 1 ? "" : "s") : undefined;
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Laboratory Messages" subtitle={threadSubtitle} />
      <FlatList
        data={threads}
        keyExtractor={(thread) => thread.key}
        renderItem={({ item }) => <ThreadCard thread={item} colors={colors} onPress={() => openThread(item)} />}
        contentContainerStyle={[styles.listContent, !threads.length && styles.emptyList]}
        ListEmptyComponent={<EmptyState colors={colors} />}
        refreshControl={<RefreshControl accessibilityLabel={a11y.refresh} refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  emptyList: { flexGrow: 1 },
  threadCard: { borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: "row", alignItems: "flex-start", gap: 11 },
  threadIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  threadCopy: { flex: 1, gap: 5 },
  threadTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  threadTitle: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  threadPreview: { fontSize: 13, lineHeight: 18 },
  threadMeta: { flexDirection: "row", gap: 12 },
  metaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  pressed: { opacity: 0.78 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 14, textAlign: "center" },
  retryButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 22, alignItems: "center", justifyContent: "center" },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  headerLink: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  headerLinkText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  detailContent: { padding: 16, gap: 12, paddingBottom: 34 },
  messageRow: { flexDirection: "row", justifyContent: "flex-start" },
  messageRowPatient: { justifyContent: "flex-end" },
  messageBubble: { maxWidth: "88%", borderWidth: 1, borderRadius: 15, padding: 13, gap: 7 },
  messageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  messageSender: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  messageContent: { fontSize: 14, lineHeight: 20 },
  replyPanel: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9, marginTop: 4 },
  replyLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyInput: { minHeight: 100, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14 },
  replyButton: { minHeight: 46, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  replyButtonText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  disabled: { opacity: 0.5 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 30 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
