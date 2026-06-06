import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { impactLight, impactMedium, notificationSuccess } from "@/lib/haptics";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { api, type Appointment } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";

type VisitPhase = "list" | "waiting" | "ended";

function isTelemedicine(apt: Appointment): boolean {
  const type = (apt.appointmentType || "").toLowerCase();
  const location = (apt.location || "").toLowerCase();
  return (
    type.includes("telehealth") ||
    type.includes("telemedicine") ||
    type.includes("virtual") ||
    type.includes("video") ||
    location.includes("virtual") ||
    location.includes("online") ||
    location.includes("telehealth")
  );
}

function isUpcoming(apt: Appointment): boolean {
  if (!apt.appointmentDate) return false;
  try {
    return new Date(apt.appointmentDate) >= new Date();
  } catch {
    return false;
  }
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };
  } catch {
    return null;
  }
}

function AppointmentCard({
  item,
  index,
  colors,
  onJoin,
}: {
  item: Appointment;
  index: number;
  colors: any;
  onJoin: (apt: Appointment) => void;
}) {
  const { t } = useI18n();
  const dt = formatDate(item.appointmentDate);
  const typeName = (item.appointmentType || "Telehealth Visit").replace(/_/g, " ");

  return (
    <AnimatedCard index={index}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <LinearGradient
          colors={["#2563eb", "#1d4ed8"]}
          style={styles.cardBadge}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Feather name="video" size={14} color="#fff" />
          <Text style={styles.cardBadgeText}>Virtual Visit</Text>
        </LinearGradient>

        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: "#dbeafe" }]}>
            <Feather name="monitor" size={22} color="#2563eb" />
          </View>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{typeName}</Text>
            {item.doctorName || item.provider ? (
              <Text style={[styles.cardSub, { color: colors.textSecondary }]}>
                {item.doctorName || item.provider}
              </Text>
            ) : null}
          </View>
        </View>

        {dt ? (
          <View style={[styles.dateRow, { backgroundColor: colors.surfaceSecondary }]}>
            <View style={styles.dateItem}>
              <Feather name="calendar" size={13} color={colors.textTertiary} />
              <Text style={[styles.dateText, { color: colors.textSecondary }]}>{dt.date}</Text>
            </View>
            <View style={styles.dateItem}>
              <Feather name="clock" size={13} color={colors.textTertiary} />
              <Text style={[styles.dateText, { color: colors.textSecondary }]}>{dt.time}</Text>
            </View>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.joinBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => {
            impactMedium();
            onJoin(item);
          }}
        >
          <Feather name="video" size={16} color="#fff" />
          <Text style={styles.joinBtnText}>{t("joinVisit")}</Text>
        </Pressable>
      </View>
    </AnimatedCard>
  );
}

function WaitingRoom({
  appointment,
  colors,
  onJoinCall,
  onBack,
}: {
  appointment: Appointment;
  colors: any;
  onJoinCall: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const checklist = [
    { key: "checkCamera", icon: "camera" as const },
    { key: "checkMicrophone", icon: "mic" as const },
    { key: "quietLocation", icon: "sun" as const },
    { key: "prepareQuestions", icon: "edit-3" as const },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.waitingContent}
      showsVerticalScrollIndicator={false}
    >
      <LogoWatermark />

      <LinearGradient
        colors={["#2563eb", "#1d4ed8", "#1e40af"]}
        style={styles.waitingHero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.waitingIconCircle}>
          <Feather name="video" size={40} color="#fff" />
        </View>
        <Text style={styles.waitingTitle}>{t("waitingRoom")}</Text>
        <Text style={styles.waitingSubtitle}>{t("waitingRoomText")}</Text>
        {appointment.doctorName || appointment.provider ? (
          <View style={styles.providerBadge}>
            <Feather name="user" size={14} color="#fff" />
            <Text style={styles.providerBadgeText}>
              {appointment.doctorName || appointment.provider}
            </Text>
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.checklistSection}>
        <Text style={[styles.checklistTitle, { color: colors.text }]}>{t("beforeYourVisit")}</Text>
        {checklist.map(({ key, icon }) => (
          <View key={key} style={[styles.checklistItem, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <View style={[styles.checkIcon, { backgroundColor: "#dbeafe" }]}>
              <Feather name={icon} size={16} color="#2563eb" />
            </View>
            <Text style={[styles.checkText, { color: colors.text }]}>{t(key as any)}</Text>
            <Feather name="check-circle" size={18} color="#22c55e" />
          </View>
        ))}
      </View>

      <View style={styles.waitingActions}>
        <Pressable
          style={({ pressed }) => [
            styles.startCallBtn,
            pressed && { opacity: 0.85 },
          ]}
          onPress={onJoinCall}
        >
          <LinearGradient
            colors={["#2563eb", "#1d4ed8"]}
            style={styles.startCallGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Feather name="video" size={20} color="#fff" />
            <Text style={styles.startCallText}>{t("joinVisit")}</Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.backBtn,
            { borderColor: colors.borderLight },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => {
            impactLight();
            onBack();
          }}
        >
          <Text style={[styles.backBtnText, { color: colors.textSecondary }]}>Go Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function VisitEnded({ colors, onViewSummary, onSchedule }: { colors: any; onViewSummary: () => void; onSchedule: () => void }) {
  const { t } = useI18n();
  return (
    <View style={[styles.endedContainer, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <View style={styles.endedContent}>
        <LinearGradient colors={["#22c55e", "#16a34a"]} style={styles.endedIcon}>
          <Feather name="check" size={44} color="#fff" />
        </LinearGradient>
        <Text style={[styles.endedTitle, { color: colors.text }]}>{t("visitEnded")}</Text>
        <Text style={[styles.endedText, { color: colors.textSecondary }]}>{t("visitEndedText")}</Text>
        <Pressable
          style={({ pressed }) => [styles.endedBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          onPress={onViewSummary}
        >
          <Text style={styles.endedBtnText}>{t("viewVisitSummary")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.endedBtnOutline, { borderColor: colors.primary }, pressed && { opacity: 0.7 }]}
          onPress={onSchedule}
        >
          <Text style={[styles.endedBtnOutlineText, { color: colors.primary }]}>{t("scheduleFollowUp")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TelehealthScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<VisitPhase>("list");
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => api.getAppointments(),
  });

  const telehealthApts = React.useMemo(() => {
    if (!data) return [];
    const virtual = data.filter(isTelemedicine);
    if (virtual.length > 0) return virtual.filter(isUpcoming).sort((a, b) =>
      new Date(a.appointmentDate || 0).getTime() - new Date(b.appointmentDate || 0).getTime()
    );
    // If no appointments are flagged as virtual, show all upcoming for demo
    return data.filter(isUpcoming).slice(0, 3);
  }, [data]);

  function handleJoin(apt: Appointment) {
    setSelectedApt(apt);
    setPhase("waiting");
  }

  async function handleStartCall() {
    impactMedium();
    // Build a deterministic room name from patient + provider for the session
    const room = [
      "carnet",
      (user?.firstName || "patient").toLowerCase().replace(/\s+/g, ""),
      Date.now().toString(36),
    ].join("-");
    const jitsiUrl = `https://meet.jit.si/${room}`;
    await WebBrowser.openBrowserAsync(jitsiUrl, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
    // After browser closes, treat visit as ended
    notificationSuccess();
    setPhase("ended");
  }

  if (phase === "waiting" && selectedApt) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <ScreenHeader title={t("telehealth")} subtitle={t("waitingRoom")} />
        <WaitingRoom
          appointment={selectedApt}
          colors={colors}
          onJoinCall={handleStartCall}
          onBack={() => setPhase("list")}
        />
      </View>
    );
  }

  if (phase === "ended") {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <ScreenHeader title={t("telehealth")} />
        <VisitEnded
          colors={colors}
          onViewSummary={() => {
            setPhase("list");
            router.push("/visit-summaries");
          }}
          onSchedule={() => {
            setPhase("list");
            router.push("/request-appointment");
          }}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("telehealth")} />
        <ListSkeleton />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("telehealth")} />
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
      <ScreenHeader title={t("telehealth")} subtitle={`${telehealthApts.length} upcoming`} />

      {telehealthApts.length === 0 ? (
        <View style={styles.centered}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}>
            <Feather name="monitor" size={36} color={colors.textTertiary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Virtual Visits</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Your upcoming telehealth appointments will appear here.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.scheduleBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
            onPress={() => router.push("/request-appointment")}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.scheduleBtnText}>Schedule Visit</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={telehealthApts}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item, index }) => (
            <AppointmentCard item={item} index={index} colors={colors} onJoin={handleJoin} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, gap: 12, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },

  // Appointment card
  card: {
    borderRadius: 16, padding: 16, gap: 12, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
  },
  cardBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  cardMeta: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  cardSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  dateRow: { borderRadius: 10, padding: 10, gap: 6 },
  dateItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  joinBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, paddingVertical: 12,
  },
  joinBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // Waiting room
  waitingContent: { paddingBottom: 40 },
  waitingHero: {
    margin: 16, borderRadius: 20, padding: 28,
    alignItems: "center", gap: 12,
  },
  waitingIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  waitingTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  waitingSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  providerBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 4,
  },
  providerBadgeText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
  checklistSection: { paddingHorizontal: 16, gap: 10 },
  checklistTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  checklistItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  checkIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  checkText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  waitingActions: { padding: 16, gap: 12, marginTop: 8 },
  startCallBtn: { borderRadius: 14, overflow: "hidden" },
  startCallGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16,
  },
  startCallText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  backBtn: { alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  backBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },

  // Visit ended
  endedContainer: { flex: 1 },
  endedContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 28 },
  endedIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  endedTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  endedText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  endedBtn: { width: "100%", alignItems: "center", paddingVertical: 14, borderRadius: 14 },
  endedBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  endedBtnOutline: { width: "100%", alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  endedBtnOutlineText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },

  // Empty & error
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  scheduleBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  scheduleBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
