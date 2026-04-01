import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { impactLight, impactMedium, impactHeavy, notificationSuccess, notificationError, selectionClick } from "@/lib/haptics";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { AnimatedCard } from "@/components/AnimatedCard";
import { HomeSkeleton } from "@/components/SkeletonLoader";
import { api, type Message, type Appointment } from "@/lib/api";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";

interface QuickAction {
  labelKey: TranslationKey;
  icon: React.ComponentProps<typeof Feather>["name"];
  route: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { labelKey: "scheduleAppointment", icon: "calendar", route: "/request-appointment" },
  { labelKey: "messages", icon: "mail", route: "/messages" },
  { labelKey: "visits", icon: "clipboard", route: "/visit-summaries" },
  { labelKey: "testResults", icon: "bar-chart-2", route: "/lab-results" },
  { labelKey: "medications", icon: "package", route: "/prescriptions" },
  { labelKey: "accountSummary", icon: "credit-card", route: "/bills" },
  { labelKey: "emergencyCard", icon: "alert-circle", route: "/emergency-card" },
  { labelKey: "healthTimeline", icon: "clock", route: "/health-timeline" },
  { labelKey: "symptomChecker", icon: "thermometer", route: "/symptom-checker" },
  { labelKey: "documents", icon: "camera", route: "/documents" },
  { labelKey: "familyMembers", icon: "users", route: "/family" },
  { labelKey: "interactionChecker", icon: "zap", route: "/interactions" },
  { labelKey: "exportRecords", icon: "share", route: "/export-records" },
  { labelKey: "telehealth", icon: "video", route: "/telehealth" },
  { labelKey: "healthMetrics", icon: "activity", route: "/health-metrics" },
];

function QuickActionTile({ item, colors }: { item: QuickAction; colors: any }) {
  const { t } = useI18n();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: colors.surface, borderColor: colors.borderLight },
        pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
      ]}
      onPress={() => {
        impactLight();
        router.push(item.route as any);
      }}
    >
      <View style={[styles.tileIconWrap, { backgroundColor: colors.primaryLight }]}>
        <Feather name={item.icon} size={28} color={colors.primary} />
      </View>
      <Text style={[styles.tileLabel, { color: colors.text }]} numberOfLines={2}>{t(item.labelKey)}</Text>
    </Pressable>
  );
}

function formatMessageDate(dateStr?: string) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}

function MessagePreview({ messages, colors, hasError }: { messages: Message[]; colors: any; hasError?: boolean }) {
  const { t } = useI18n();
  if (hasError) {
    return (
      <AnimatedCard index={1}>
        <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.previewHeader}>
            <View style={[styles.previewIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Feather name="mail" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.previewTitle, { color: colors.text }]}>{t("messages")}</Text>
          </View>
          <View style={styles.emptyState}>
            <Feather name="wifi-off" size={28} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("unableToLoadMessages")}</Text>
            <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>{t("pullToRefresh")}</Text>
          </View>
        </View>
      </AnimatedCard>
    );
  }
  if (!messages || messages.length === 0) {
    return (
      <AnimatedCard index={1}>
        <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.previewHeader}>
            <View style={[styles.previewIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Feather name="mail" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.previewTitle, { color: colors.text }]}>{t("messages")}</Text>
          </View>
          <View style={styles.emptyState}>
            <Feather name="inbox" size={32} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("noNewMessages")}</Text>
            <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>{t("careTeamMessages")}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.viewBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
            onPress={() => {
              impactLight();
              router.push("/messages" as any);
            }}
          >
            <Text style={styles.viewBtnText}>{t("sendMessage")}</Text>
          </Pressable>
        </View>
      </AnimatedCard>
    );
  }
  const latest = messages[0];
  const subject = latest.originalContent?.subject || latest.type?.replace(/_/g, " ") || "Message";
  const body = latest.originalContent?.message || "";
  const sender = latest.sender || "Care Team";
  const dateStr = formatMessageDate(latest.createdAt);
  const initial = sender.charAt(0).toUpperCase();

  return (
    <AnimatedCard index={1}>
      <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <View style={styles.previewHeader}>
          <View style={[styles.previewIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Feather name="mail" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.previewTitle, { color: colors.text }]}>{subject}</Text>
        </View>

        <View style={styles.messageBody}>
          <View style={[styles.senderAvatar, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.senderInitial, { color: colors.primary }]}>{initial}</Text>
          </View>
          <View style={styles.messageContent}>
            <View style={styles.senderRow}>
              <Text style={[styles.senderName, { color: colors.text }]}>{sender}</Text>
              {dateStr ? <Text style={[styles.messageDate, { color: colors.textTertiary }]}>{dateStr}</Text> : null}
            </View>
            {body ? <Text style={[styles.messagePreviewText, { color: colors.textSecondary }]} numberOfLines={1}>{body}</Text> : null}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.viewBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          onPress={() => {
            impactLight();
            router.push("/messages" as any);
          }}
        >
          <Text style={styles.viewBtnText}>{t("viewMessage")}</Text>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

        <Pressable
          style={({ pressed }) => [styles.viewAllRow, pressed && { opacity: 0.7 }]}
          onPress={() => {
            impactLight();
            router.push("/messages" as any);
          }}
        >
          <Feather name="mail" size={16} color={colors.textSecondary} />
          <Text style={[styles.viewAllText, { color: colors.textSecondary }]}>{t("viewAll")} ({messages.length})</Text>
        </Pressable>
      </View>
    </AnimatedCard>
  );
}

function formatAppointmentDate(dateStr?: string) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return {
      month: d.toLocaleDateString("en-US", { month: "short" }),
      day: d.getDate().toString(),
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
      time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }),
    };
  } catch { return null; }
}

function AppointmentPreview({ appointments, colors, hasError }: { appointments: Appointment[]; colors: any; hasError?: boolean }) {
  const { t } = useI18n();
  if (hasError) {
    return (
      <AnimatedCard index={2}>
        <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.previewHeader}>
            <View style={[styles.visitIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Feather name="calendar" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.previewTitle, { color: colors.text }]}>{t("upcomingAppointment")}</Text>
          </View>
          <View style={styles.emptyState}>
            <Feather name="wifi-off" size={28} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("unableToLoadAppointments")}</Text>
            <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>{t("pullToRefresh")}</Text>
          </View>
        </View>
      </AnimatedCard>
    );
  }
  const upcoming = appointments.find(
    (a) => a.status?.toLowerCase() !== "cancelled" && a.appointmentDate
  );
  if (!upcoming) {
    return (
      <AnimatedCard index={2}>
        <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.previewHeader}>
            <View style={[styles.visitIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Feather name="calendar" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.previewTitle, { color: colors.text }]}>{t("upcomingAppointment")}</Text>
          </View>
          <View style={styles.emptyState}>
            <Feather name="calendar" size={32} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("noUpcomingAppointments")}</Text>
            <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>{t("scheduleVisit")}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.viewBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
            onPress={() => {
              impactLight();
              router.push("/appointments" as any);
            }}
          >
            <Text style={styles.viewBtnText}>{t("scheduleAppointmentBtn")}</Text>
          </Pressable>
        </View>
      </AnimatedCard>
    );
  }

  const dt = formatAppointmentDate(upcoming.appointmentDate);
  const typeName = (upcoming.appointmentType || "Office Visit").replace(/_/g, " ").toUpperCase();
  const provider = upcoming.doctorName || upcoming.provider || "";
  const location = upcoming.hospitalName || upcoming.location || "";

  return (
    <AnimatedCard index={2}>
      <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <View style={styles.previewHeader}>
          <View style={[styles.visitIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Feather name="calendar" size={18} color={colors.primary} />
          </View>
          <Text style={[styles.visitType, { color: colors.text }]}>{typeName}</Text>
        </View>

        <View style={styles.appointmentBody}>
          {dt ? (
            <View style={[styles.dateColumn, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.dateMonth, { color: colors.primary }]}>{dt.month}</Text>
              <Text style={[styles.dateDay, { color: colors.primary }]}>{dt.day}</Text>
              <Text style={[styles.dateWeekday, { color: colors.primary }]}>{dt.weekday}</Text>
            </View>
          ) : null}

          <View style={styles.appointmentDetails}>
            {dt ? (
              <View style={styles.detailRow}>
                <Feather name="clock" size={14} color={colors.textTertiary} />
                <Text style={[styles.detailText, { color: colors.textSecondary }]}>Starts at {dt.time}</Text>
              </View>
            ) : null}
            {location ? (
              <View style={styles.detailRow}>
                <Feather name="home" size={14} color={colors.textTertiary} />
                <Text style={[styles.detailText, { color: colors.textSecondary }]}>{location}</Text>
              </View>
            ) : null}
            {provider ? (
              <View style={styles.detailRow}>
                <Feather name="user" size={14} color={colors.textTertiary} />
                <Text style={[styles.detailText, { color: colors.textSecondary }]}>With {provider}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.viewBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          onPress={() => {
            impactLight();
            router.push("/appointments" as any);
          }}
        >
          <Text style={styles.viewBtnText}>{t("viewDetails")}</Text>
        </Pressable>
      </View>
    </AnimatedCard>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile, isLoading, refreshProfile } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  const queryClient = useQueryClient();

  const { data: messages, isError: messagesError } = useQuery({
    queryKey: ["messages"],
    queryFn: () => api.getMessages(),
    enabled: !!profile,
  });

  const { data: appointments, isError: appointmentsError } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => api.getAppointments(),
    enabled: !!profile,
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshProfile(),
      queryClient.invalidateQueries({ queryKey: ["messages"] }),
      queryClient.invalidateQueries({ queryKey: ["appointments"] }),
    ]);
    setRefreshing(false);
  };

  const firstName = profile?.firstName || "Patient";

  if (isLoading && !profile) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad + 16 }]}>
        <HomeSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : 20 }}
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerGradient, { paddingTop: topPad + 16 }]}
        >
          <View style={styles.headerRow}>
            <Text style={styles.welcomeText}>{t("welcome", { name: firstName })}</Text>
            <Pressable
              style={({ pressed }) => [styles.editProfileBtn, pressed && { opacity: 0.7 }]}
              onPress={() => {
                impactLight();
                router.push("/(tabs)/profile" as any);
              }}
            >
              <Feather name="edit-2" size={18} color="#fff" />
            </Pressable>
          </View>
        </LinearGradient>

        <AnimatedCard index={0}>
          <View style={styles.tilesContainer}>
            <View style={styles.tilesGrid}>
              {QUICK_ACTIONS.map((item) => (
                <QuickActionTile key={item.labelKey} item={item} colors={colors} />
              ))}
            </View>
          </View>
        </AnimatedCard>

        <View style={styles.cardsContainer}>
          <MessagePreview messages={messages || []} colors={colors} hasError={messagesError} />
          <AppointmentPreview appointments={appointments || []} colors={colors} hasError={appointmentsError} />
        </View>

        <View style={styles.footer}>
          <Feather name="shield" size={13} color={colors.textTertiary} />
          <Text style={[styles.footerText, { color: colors.textTertiary }]}>{t("poweredBy")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  welcomeText: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  editProfileBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  tilesContainer: {
    marginTop: -8,
    paddingHorizontal: 16,
  },
  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  tile: {
    width: "31%",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 10,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  tileIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    lineHeight: 16,
  },
  cardsContainer: {
    marginTop: 16,
    paddingHorizontal: 16,
    gap: 14,
  },
  previewCard: {
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  previewIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  previewTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  messageBody: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  senderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  senderInitial: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  messageContent: {
    flex: 1,
    gap: 3,
  },
  senderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  senderName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  messageDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  messagePreviewText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  viewBtn: {
    alignSelf: "center",
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 20,
  },
  viewBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  divider: {
    height: 1,
  },
  viewAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  viewAllText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  visitIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  visitType: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    flex: 1,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  appointmentBody: {
    flexDirection: "row",
    gap: 14,
  },
  dateColumn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 64,
  },
  dateMonth: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },
  dateDay: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    lineHeight: 36,
  },
  dateWeekday: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  appointmentDetails: {
    flex: 1,
    gap: 8,
    justifyContent: "center",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 28,
    marginBottom: 8,
  },
  footerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 6,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
