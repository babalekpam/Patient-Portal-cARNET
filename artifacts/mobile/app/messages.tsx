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
import { StatusBadge } from "@/components/StatusBadge";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { useTheme } from "@/context/ThemeContext";
import { api, type Message } from "@/lib/api";
import { LogoWatermark } from "@/components/LogoWatermark";

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return null; }
}

function MessageCard({ item, index, colors }: { item: Message; index: number; colors: any }) {
  const date = formatDate(item.createdAt);
  const subject = item.originalContent?.subject || item.type?.replace(/_/g, " ") || "Message";
  const preview = item.originalContent?.message || "";

  return (
    <AnimatedCard index={index}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]} testID={`card-message-${index}`}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Feather name="message-circle" size={18} color="#0284c7" />
          </View>
          <View style={styles.cardHeaderContent}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{subject}</Text>
            <View style={styles.badgeRow}>
              <StatusBadge label={item.status || item.priority || "normal"} />
              {date ? (
                <View style={styles.dateRow}>
                  <Feather name="clock" size={11} color={colors.textTertiary} />
                  <Text style={[styles.dateText, { color: colors.textTertiary }]}>{date}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        {preview ? <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={2}>{preview}</Text> : null}
        {item.sender ? (
          <View style={styles.senderRow}>
            <Feather name="user" size={12} color={colors.textTertiary} />
            <Text style={[styles.senderText, { color: colors.textTertiary }]}>{item.sender}</Text>
          </View>
        ) : null}
      </View>
    </AnimatedCard>
  );
}

function ComposeSheet({ onSend, sending, onClose, colors }: { onSend: (s: string, m: string) => void; sending: boolean; onClose: () => void; colors: any }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const canSend = subject.trim().length > 0 && message.trim().length > 0 && !sending;

  return (
    <View style={styles.composeContainer}>
      <View style={styles.composeHeader}>
        <Text style={[styles.composeTitle, { color: colors.text }]}>New Message</Text>
        <Pressable onPress={onClose} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
          <Feather name="x" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.composeField}>
        <Text style={[styles.composeLabel, { color: colors.textSecondary }]}>Subject</Text>
        <TextInput
          style={[styles.composeInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={subject}
          onChangeText={setSubject}
          placeholder="Enter subject..."
          placeholderTextColor={colors.textTertiary}
          returnKeyType="next"
        />
      </View>
      <View style={[styles.composeField, { flex: 1 }]}>
        <Text style={[styles.composeLabel, { color: colors.textSecondary }]}>Message</Text>
        <TextInput
          style={[styles.composeInput, styles.messageInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          value={message}
          onChangeText={setMessage}
          placeholder="Write your message to your care team..."
          placeholderTextColor={colors.textTertiary}
          multiline
          textAlignVertical="top"
        />
      </View>
      <Pressable
        style={({ pressed }) => [styles.sendBtn, { backgroundColor: colors.primary }, !canSend && styles.sendBtnDisabled, pressed && { opacity: 0.85 }]}
        disabled={!canSend}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onSend(subject.trim(), message.trim()); }}
      >
        {sending ? <ActivityIndicator size="small" color="#fff" /> : (
          <>
            <Feather name="send" size={16} color="#fff" />
            <Text style={styles.sendBtnText}>Send Message</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function EmptyState({ colors }: { colors: any }) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}>
        <Feather name="message-circle" size={32} color={colors.textTertiary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No Messages</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Messages from your care team will appear here.</Text>
    </View>
  );
}

export default function MessagesScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["messages"],
    queryFn: () => api.getMessages(),
  });
  const sendMutation = useMutation({
    mutationFn: ({ subject, message }: { subject: string; message: string }) => api.sendMessage(subject, message),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["messages"] }); setComposing(false); },
  });

  const composeBtn = (
    <Pressable
      style={({ pressed }) => [styles.composeBtn, pressed && { opacity: 0.7 }]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setComposing(true); }}
    >
      <Feather name="edit-2" size={18} color="#fff" />
    </Pressable>
  );

  if (composing) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScreenHeader title="Compose" showBack={false} />
        <ComposeSheet onSend={(s, m) => sendMutation.mutate({ subject: s, message: m })} sending={sendMutation.isPending} onClose={() => setComposing(false)} colors={colors} />
      </KeyboardAvoidingView>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Messages" rightElement={composeBtn} />
        <ListSkeleton />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Messages" rightElement={composeBtn} />
        <View style={styles.centered}>
          <Feather name="wifi-off" size={36} color={colors.textTertiary} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>Unable to Load</Text>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{(error as Error).message}</Text>
          <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title="Messages" subtitle={data && data.length > 0 ? `${data.length} message${data.length !== 1 ? "s" : ""}` : undefined} rightElement={composeBtn} />
      <FlatList
        data={data || []}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => <MessageCard item={item} index={index} colors={colors} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState colors={colors} />}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  card: { borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#e0f2fe", alignItems: "center", justifyContent: "center" },
  cardHeaderContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  dateText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  preview: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  senderRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  senderText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  composeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  composeContainer: { flex: 1, padding: 16, gap: 16 },
  composeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  composeTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  composeField: { gap: 6 },
  composeLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  composeInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  messageInput: { flex: 1, minHeight: 120, textAlignVertical: "top" },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, shadowColor: "#1a6fbf", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
