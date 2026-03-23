import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { StatusBadge } from "@/components/StatusBadge";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api, type Message } from "@/lib/api";

const C = Colors.light;

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return null; }
}

function MessageCard({ item, index }: { item: Message; index: number }) {
  const date = formatDate(item.createdAt);
  const subject = item.originalContent?.subject || item.type?.replace(/_/g, " ") || "Message";
  const preview = item.originalContent?.message || "";

  return (
    <View style={styles.card} testID={`card-message-${index}`}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <Feather name="message-circle" size={18} color="#0284c7" />
        </View>
        <View style={styles.cardHeaderContent}>
          <Text style={styles.cardTitle} numberOfLines={1}>{subject}</Text>
          <View style={styles.badgeRow}>
            <StatusBadge label={item.status || item.priority || "normal"} />
            {date ? (
              <View style={styles.dateRow}>
                <Feather name="clock" size={11} color={C.textTertiary} />
                <Text style={styles.dateText}>{date}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {preview ? (
        <Text style={styles.preview} numberOfLines={2}>{preview}</Text>
      ) : null}
      {item.sender ? (
        <View style={styles.senderRow}>
          <Feather name="user" size={12} color={C.textTertiary} />
          <Text style={styles.senderText}>{item.sender}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ComposeSheet({
  onSend,
  sending,
  onClose,
}: {
  onSend: (subject: string, message: string) => void;
  sending: boolean;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const canSend = subject.trim().length > 0 && message.trim().length > 0 && !sending;

  return (
    <View style={styles.composeContainer}>
      <View style={styles.composeHeader}>
        <Text style={styles.composeTitle}>New Message</Text>
        <Pressable onPress={onClose} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
          <Feather name="x" size={24} color={C.text} />
        </Pressable>
      </View>
      <View style={styles.composeField}>
        <Text style={styles.composeLabel}>Subject</Text>
        <TextInput
          style={styles.composeInput}
          value={subject}
          onChangeText={setSubject}
          placeholder="Enter subject..."
          placeholderTextColor={C.textTertiary}
          returnKeyType="next"
        />
      </View>
      <View style={[styles.composeField, { flex: 1 }]}>
        <Text style={styles.composeLabel}>Message</Text>
        <TextInput
          style={[styles.composeInput, styles.messageInput]}
          value={message}
          onChangeText={setMessage}
          placeholder="Write your message to your care team..."
          placeholderTextColor={C.textTertiary}
          multiline
          textAlignVertical="top"
        />
      </View>
      <Pressable
        style={({ pressed }) => [styles.sendBtn, !canSend && styles.sendBtnDisabled, pressed && { opacity: 0.85 }]}
        disabled={!canSend}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSend(subject.trim(), message.trim());
        }}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Feather name="send" size={16} color="#fff" />
            <Text style={styles.sendBtnText}>Send Message</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Feather name="message-circle" size={32} color={C.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Messages</Text>
      <Text style={styles.emptyText}>Messages from your care team will appear here.</Text>
    </View>
  );
}

export default function MessagesScreen() {
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["messages"],
    queryFn: () => api.getMessages(),
  });

  const sendMutation = useMutation({
    mutationFn: ({ subject, message }: { subject: string; message: string }) =>
      api.sendMessage(subject, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      setComposing(false);
    },
  });

  const composeBtn = (
    <Pressable
      style={({ pressed }) => [styles.composeBtn, pressed && { opacity: 0.7 }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setComposing(true);
      }}
    >
      <Feather name="edit-2" size={18} color={C.primary} />
    </Pressable>
  );

  if (composing) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScreenHeader title="Compose" showBack={false} rightElement={null} />
        <ComposeSheet
          onSend={(s, m) => sendMutation.mutate({ subject: s, message: m })}
          sending={sendMutation.isPending}
          onClose={() => setComposing(false)}
        />
      </KeyboardAvoidingView>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Messages" rightElement={composeBtn} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Messages" rightElement={composeBtn} />
        <View style={styles.centered}>
          <Feather name="wifi-off" size={36} color={C.textTertiary} />
          <Text style={styles.errorTitle}>Unable to Load</Text>
          <Text style={styles.errorText}>{(error as Error).message}</Text>
          <Pressable style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Messages" subtitle={data && data.length > 0 ? `${data.length} message${data.length !== 1 ? "s" : ""}` : undefined} rightElement={composeBtn} />
      <FlatList
        data={data || []}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => <MessageCard item={item} index={index} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState />}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.primary} />}
        scrollEnabled={!!(data && data.length > 0)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  listContent: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: C.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: "#e0f2fe",
    alignItems: "center", justifyContent: "center",
  },
  cardHeaderContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.text },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.textTertiary },
  preview: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.textSecondary, lineHeight: 20 },
  senderRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  senderText: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.textTertiary },
  composeBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryLight,
    alignItems: "center", justifyContent: "center",
  },
  composeContainer: { flex: 1, padding: 16, gap: 16 },
  composeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  composeTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: C.text },
  composeField: { gap: 6 },
  composeLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.textSecondary },
  composeInput: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: C.text,
  },
  messageInput: { flex: 1, minHeight: 120, textAlignVertical: "top" },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24, backgroundColor: C.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: C.text },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.textSecondary, textAlign: "center" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: C.text },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.textSecondary, textAlign: "center" },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: C.primary, borderRadius: 12 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
