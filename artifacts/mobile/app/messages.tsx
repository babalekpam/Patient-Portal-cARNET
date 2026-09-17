import { Feather } from "@expo/vector-icons";
import { impactLight, impactMedium, impactHeavy, notificationSuccess, notificationError, selectionClick } from "@/lib/haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
import { Pressable } from "@/components/AccessiblePressable";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";
import { useI18n } from "@/lib/i18n";
import { useEHR } from "@/context/EHRContext";
import { useAuth } from "@/context/AuthContext";
import { sessionGeneration } from "@/lib/session";
import { restrictedProductionFeaturesEnabled } from "@/lib/productionFeatures";

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return null; }
}

function MessageCard({
  item,
  index,
  rowKey,
  colors,
}: {
  item: Message;
  index: number;
  rowKey: string;
  colors: any;
}) {
  const date = formatDate(item.createdAt);
  const subject = item.originalContent?.subject || item.type?.replace(/_/g, " ") || "Message";
  const preview = item.originalContent?.message || "";

  return (
    <AnimatedCard index={index}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]} testID={`card-message-${rowKey}`}>
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

function ComposeSheet({
  onSend,
  sending,
  error,
  onClose,
  colors,
}: {
  onSend: (s: string, m: string) => void;
  sending: boolean;
  error?: string;
  onClose: () => void;
  colors: any;
}) {
  const a11y = useAccessibilityLabels();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const canSend = subject.trim().length > 0 && message.trim().length > 0 && !sending;

  return (
    <View style={styles.composeContainer}>
      <View style={styles.composeHeader}>
        <Text style={[styles.composeTitle, { color: colors.text }]}>New Message</Text>
        <Pressable onPress={onClose} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel={a11y.closeDialog}>
          <Feather name="x" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.composeField}>
        <Text style={[styles.composeLabel, { color: colors.textSecondary }]}>Subject</Text>
        <TextInput
          style={[styles.composeInput, { backgroundColor: colors.surface, borderColor: colors.controlBorder, color: colors.text }]}
          value={subject}
          onChangeText={setSubject}
          placeholder="Enter subject..."
          placeholderTextColor={colors.textTertiary}
          returnKeyType="next"
          accessibilityLabel="Subject"
        />
      </View>
      <View style={[styles.composeField, { flex: 1 }]}>
        <Text style={[styles.composeLabel, { color: colors.textSecondary }]}>Message</Text>
        <TextInput
          style={[styles.composeInput, styles.messageInput, { backgroundColor: colors.surface, borderColor: colors.controlBorder, color: colors.text }]}
          value={message}
          onChangeText={setMessage}
          placeholder="Write your message to your care team..."
          placeholderTextColor={colors.textTertiary}
          multiline
          textAlignVertical="top"
          accessibilityLabel="Message"
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.errorText, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.sendBtn, { backgroundColor: colors.primary }, !canSend && styles.sendBtnDisabled, pressed && { opacity: 0.85 }]}
        disabled={!canSend}
        onPress={() => { impactMedium(); onSend(subject.trim(), message.trim()); }}
        accessibilityRole="button"
        accessibilityLabel="Send Message"
        accessibilityState={{ disabled: !canSend, busy: sending }}
      >
        {sending ? <ActivityIndicator size="small" color={colors.onPrimary} /> : (
          <>
            <Feather name="send" size={16} color={colors.onPrimary} />
            <Text style={[styles.sendBtnText, { color: colors.onPrimary }]}>Send Message</Text>
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
  const { t } = useI18n();
  const a11y = useAccessibilityLabels();
  const queryClient = useQueryClient();
  const { adapter, isLoading: ehrLoading } = useEHR();
  const { isAuthenticated, profile } = useAuth();
  const [composing, setComposing] = useState(false);
  const sessionKey = adapter?.sessionKey || "direct-navimedi";
  const patientKey = profile?.patientId || profile?.id || "unknown";
  const generation = sessionGeneration();
  const queryKey = ["messages", sessionKey, patientKey, generation] as const;
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey,
    queryFn: () => api.getMessages(),
    enabled: isAuthenticated && !ehrLoading,
  });
  const messageRows = useMemo(() => {
    const occurrences = new Map<string, number>();
    return (data || []).map((item) => {
      const base = item.id?.trim() ||
        JSON.stringify([
          item.type,
          item.priority,
          item.createdAt,
          item.sender,
          item.originalContent?.subject,
          item.originalContent?.message,
        ]);
      const occurrence = (occurrences.get(base) || 0) + 1;
      occurrences.set(base, occurrence);
      return { item, key: `${base}:${occurrence}` };
    });
  }, [data]);
  const invalidateCurrentQuery = async () => {
    if (sessionGeneration() === generation) {
      await queryClient.invalidateQueries({ queryKey });
    }
  };
  const sendMutation = useMutation({
    mutationFn: ({ subject, message }: { subject: string; message: string }) => api.sendMessage(subject, message),
    onSuccess: async () => {
      if (sessionGeneration() !== generation) return;
      await invalidateCurrentQuery();
      setComposing(false);
    },
  });

  const composeBtn = (
    <Pressable
      style={({ pressed }) => [styles.composeBtn, pressed && { opacity: 0.7 }]}
      onPress={() => { impactLight(); sendMutation.reset(); setComposing(true); }}
      accessibilityRole="button"
      accessibilityLabel="Compose message"
    >
      <Feather name="edit-2" size={18} color={colors.whiteText} />
    </Pressable>
  );

  const laboratoryMessagesBtn = restrictedProductionFeaturesEnabled() &&
    !ehrLoading && (!adapter || adapter.providerId === "navimedi") ? (
    <Pressable
      style={({ pressed }) => [styles.composeBtn, pressed && { opacity: 0.7 }]}
      onPress={() => { impactLight(); router.push("/lab-messages"); }}
      accessibilityRole="button"
      accessibilityLabel="Laboratory messages"
    >
      <Feather name="activity" size={18} color={colors.whiteText} />
    </Pressable>
  ) : null;
  const headerActions = (
    <View style={styles.headerActions}>
      {laboratoryMessagesBtn}
      {composeBtn}
    </View>
  );

  if (composing) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScreenHeader title="Compose" showBack={false} />
        <ComposeSheet
          onSend={(s, m) => sendMutation.mutate({ subject: s, message: m })}
          sending={sendMutation.isPending}
          error={sendMutation.error instanceof Error ? sendMutation.error.message : undefined}
          onClose={() => { sendMutation.reset(); setComposing(false); }}
          colors={colors}
        />
      </KeyboardAvoidingView>
    );
  }

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: colors.background }]}
        accessibilityLabel={a11y.loading}
        accessibilityState={{ busy: true }}
        aria-busy
        aria-live="polite"
      >
        <ScreenHeader title="Messages" rightElement={headerActions} />
        <ListSkeleton />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Messages" rightElement={headerActions} />
        <View style={styles.centered}>
          <Feather name="wifi-off" size={36} color={colors.textTertiary} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>{t("unableToLoad")}</Text>
          <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" aria-live="assertive" style={[styles.errorText, { color: colors.textSecondary }]}>
            {t("unableToLoadMessages")}
          </Text>
          <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()} accessibilityRole="button" accessibilityLabel={a11y.refresh} accessibilityState={{ busy: isRefetching }}>
            <Text style={[styles.retryText, { color: colors.onPrimary }]}>{t("tryAgain")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title="Messages" subtitle={messageRows.length > 0 ? `${messageRows.length} message${messageRows.length !== 1 ? "s" : ""}` : undefined} rightElement={headerActions} />
      <FlatList
        data={messageRows}
        keyExtractor={(row) => row.key}
        renderItem={({ item: row, index }) => (
          <MessageCard item={row.item} rowKey={row.key} index={index} colors={colors} />
        )}
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
  composeBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  composeContainer: { flex: 1, padding: 16, gap: 16 },
  composeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  composeTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  composeField: { gap: 6 },
  composeLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  composeInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, fontSize: 15, fontFamily: "Inter_400Regular" },
  messageInput: { flex: 1, minHeight: 120, textAlignVertical: "top" },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 16, shadowColor: "#1a6fbf", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
