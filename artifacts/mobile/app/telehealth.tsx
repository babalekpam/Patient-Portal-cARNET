import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { impactLight, impactMedium, notificationSuccess } from "@/lib/haptics";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React, { useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { api, type Appointment } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";

type VisitPhase = "list" | "waiting" | "incall" | "ended";

// ─── helpers ────────────────────────────────────────────────────────────────

function isTelemedicine(apt: Appointment): boolean {
  const type = (apt.appointmentType || "").toLowerCase();
  const loc = (apt.location || "").toLowerCase();
  return (
    type.includes("telehealth") ||
    type.includes("telemedicine") ||
    type.includes("virtual") ||
    type.includes("video") ||
    loc.includes("virtual") ||
    loc.includes("online") ||
    loc.includes("telehealth")
  );
}

function isUpcoming(apt: Appointment): boolean {
  if (!apt.appointmentDate) return false;
  try { return new Date(apt.appointmentDate) >= new Date(); } catch { return false; }
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };
  } catch { return null; }
}

function buildJitsiUrl(appointment: Appointment, user: any): string {
  const room = [
    "carnet",
    (user?.firstName || "patient").toLowerCase().replace(/\s+/g, ""),
    Math.abs(appointment.id?.split("").reduce((a, c) => a + c.charCodeAt(0), 0) || 0) || Date.now() % 99999,
  ].join("-");
  return `https://meet.jit.si/${room}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.TOOLBAR_BUTTONS=[]`;
}

// JS injected into the WebView to toggle audio/video via Jitsi's postMessage API
const JITSI_MUTE_AUDIO = `
  (function(){
    try { window.JitsiMeetExternalAPI && window.JitsiMeetExternalAPI.prototype; } catch(e){}
    document.querySelectorAll('[aria-label*="mute" i],[aria-label*="audio" i],[data-testid*="audio" i]')[0]?.click();
  })(); true;
`;
const JITSI_TOGGLE_VIDEO = `
  (function(){
    document.querySelectorAll('[aria-label*="camera" i],[aria-label*="video" i],[data-testid*="video" i]')[0]?.click();
  })(); true;
`;

// ─── Appointment card ────────────────────────────────────────────────────────

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
        <LinearGradient colors={["#2563eb", "#1d4ed8"]} style={styles.badge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <Feather name="video" size={12} color="#fff" />
          <Text style={styles.badgeText}>Virtual Visit</Text>
        </LinearGradient>

        <View style={styles.cardRow}>
          <View style={[styles.iconBox, { backgroundColor: "#dbeafe" }]}>
            <Feather name="monitor" size={22} color="#2563eb" />
          </View>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{typeName}</Text>
            {item.doctorName || item.provider ? (
              <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{item.doctorName || item.provider}</Text>
            ) : null}
          </View>
        </View>

        {dt ? (
          <View style={[styles.dateBox, { backgroundColor: colors.surfaceSecondary }]}>
            <View style={styles.dateRow}>
              <Feather name="calendar" size={13} color={colors.textTertiary} />
              <Text style={[styles.dateText, { color: colors.textSecondary }]}>{dt.date}</Text>
            </View>
            <View style={styles.dateRow}>
              <Feather name="clock" size={13} color={colors.textTertiary} />
              <Text style={[styles.dateText, { color: colors.textSecondary }]}>{dt.time}</Text>
            </View>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.joinBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          onPress={() => { impactMedium(); onJoin(item); }}
        >
          <Feather name="video" size={16} color="#fff" />
          <Text style={styles.joinBtnText}>{t("joinVisit")}</Text>
        </Pressable>
      </View>
    </AnimatedCard>
  );
}

// ─── Waiting room ────────────────────────────────────────────────────────────

function WaitingRoom({
  appointment,
  colors,
  onStart,
  onBack,
}: {
  appointment: Appointment;
  colors: any;
  onStart: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const checklist: { key: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
    { key: "checkCamera", icon: "camera" },
    { key: "checkMicrophone", icon: "mic" },
    { key: "quietLocation", icon: "sun" },
    { key: "prepareQuestions", icon: "edit-3" },
  ];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.waitingScroll} showsVerticalScrollIndicator={false}>
      <LogoWatermark />
      <LinearGradient colors={["#2563eb", "#1d4ed8", "#1e40af"]} style={styles.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.heroIconCircle}>
          <Feather name="video" size={40} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>{t("waitingRoom")}</Text>
        <Text style={styles.heroSub}>{t("waitingRoomText")}</Text>
        {appointment.doctorName || appointment.provider ? (
          <View style={styles.providerPill}>
            <Feather name="user" size={13} color="#fff" />
            <Text style={styles.providerPillText}>{appointment.doctorName || appointment.provider}</Text>
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.checklistWrap}>
        <Text style={[styles.checklistTitle, { color: colors.text }]}>{t("beforeYourVisit")}</Text>
        {checklist.map(({ key, icon }) => (
          <View key={key} style={[styles.checkItem, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <View style={[styles.checkItemIcon, { backgroundColor: "#dbeafe" }]}>
              <Feather name={icon} size={15} color="#2563eb" />
            </View>
            <Text style={[styles.checkItemText, { color: colors.text }]}>{t(key as any)}</Text>
            <Feather name="check-circle" size={18} color="#22c55e" />
          </View>
        ))}
      </View>

      <View style={styles.waitingActions}>
        <Pressable style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.88 }]} onPress={onStart}>
          <LinearGradient colors={["#2563eb", "#1d4ed8"]} style={styles.startBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Feather name="video" size={20} color="#fff" />
            <Text style={styles.startBtnText}>{t("joinVisit")}</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { borderColor: colors.borderLight }, pressed && { opacity: 0.7 }]}
          onPress={() => { impactLight(); onBack(); }}
        >
          <Text style={[styles.backBtnText, { color: colors.textSecondary }]}>Go Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ─── In-call screen ──────────────────────────────────────────────────────────

function InCallScreen({
  appointment,
  user,
  colors,
  insets,
  onEnd,
}: {
  appointment: Appointment;
  user: any;
  colors: any;
  insets: any;
  onEnd: () => void;
}) {
  const { t } = useI18n();
  const webviewRef = useRef<WebView>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const url = buildJitsiUrl(appointment, user);

  function toggleMute() {
    impactLight();
    webviewRef.current?.injectJavaScript(JITSI_MUTE_AUDIO);
    setMuted((v) => !v);
  }

  function toggleCamera() {
    impactLight();
    webviewRef.current?.injectJavaScript(JITSI_TOGGLE_VIDEO);
    setCameraOff((v) => !v);
  }

  function handleEnd() {
    impactMedium();
    notificationSuccess();
    onEnd();
  }

  return (
    <View style={styles.callContainer}>
      {/* Status bar */}
      <LinearGradient colors={["#1e3a8a", "#1d4ed8"]} style={[styles.callStatus, { paddingTop: insets.top + 4 }]}>
        <View style={styles.callStatusLeft}>
          <View style={styles.liveDot} />
          <Text style={styles.callStatusText}>{t("inProgress")}</Text>
        </View>
        <Text style={styles.callProviderText}>{appointment.doctorName || appointment.provider || "Your Provider"}</Text>
      </LinearGradient>

      {/* Video WebView */}
      <WebView
        ref={webviewRef}
        source={{ uri: url }}
        style={styles.webview}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
        mediaCapturePermissionGrantType="grant"
        originWhitelist={["*"]}
        allowsFullscreenVideo
      />

      {/* Control bar */}
      <View style={[styles.controlBar, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
        {/* Mute */}
        <Pressable
          style={({ pressed }) => [styles.ctrlBtn, { backgroundColor: muted ? "#ef4444" : colors.surfaceSecondary }, pressed && { opacity: 0.8 }]}
          onPress={toggleMute}
        >
          <Feather name={muted ? "mic-off" : "mic"} size={22} color={muted ? "#fff" : colors.text} />
          <Text style={[styles.ctrlLabel, { color: muted ? "#fff" : colors.textSecondary }]}>
            {muted ? t("unmute") : t("mute")}
          </Text>
        </Pressable>

        {/* End call */}
        <Pressable
          style={({ pressed }) => [styles.endCallBtn, pressed && { opacity: 0.88 }]}
          onPress={handleEnd}
        >
          <LinearGradient colors={["#dc2626", "#b91c1c"]} style={styles.endCallGrad}>
            <Feather name="phone-off" size={26} color="#fff" />
          </LinearGradient>
          <Text style={[styles.ctrlLabel, { color: "#dc2626" }]}>{t("endCall")}</Text>
        </Pressable>

        {/* Camera */}
        <Pressable
          style={({ pressed }) => [styles.ctrlBtn, { backgroundColor: cameraOff ? "#ef4444" : colors.surfaceSecondary }, pressed && { opacity: 0.8 }]}
          onPress={toggleCamera}
        >
          <Feather name={cameraOff ? "video-off" : "video"} size={22} color={cameraOff ? "#fff" : colors.text} />
          <Text style={[styles.ctrlLabel, { color: cameraOff ? "#fff" : colors.textSecondary }]}>
            {t("camera")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Visit ended ─────────────────────────────────────────────────────────────

function VisitEnded({ colors, onViewSummary, onSchedule }: { colors: any; onViewSummary: () => void; onSchedule: () => void }) {
  const { t } = useI18n();
  return (
    <View style={[styles.endedWrap, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <View style={styles.endedContent}>
        <LinearGradient colors={["#22c55e", "#16a34a"]} style={styles.endedIcon}>
          <Feather name="check" size={44} color="#fff" />
        </LinearGradient>
        <Text style={[styles.endedTitle, { color: colors.text }]}>{t("visitEnded")}</Text>
        <Text style={[styles.endedSub, { color: colors.textSecondary }]}>{t("visitEndedText")}</Text>
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

// ─── Root screen ─────────────────────────────────────────────────────────────

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
    const virtual = data.filter(isTelemedicine).filter(isUpcoming);
    if (virtual.length > 0) return virtual.sort((a, b) =>
      new Date(a.appointmentDate || 0).getTime() - new Date(b.appointmentDate || 0).getTime()
    );
    return data.filter(isUpcoming).slice(0, 3);
  }, [data]);

  // In-call: full-screen, skip header/list layout
  if (phase === "incall" && selectedApt) {
    return (
      <InCallScreen
        appointment={selectedApt}
        user={user}
        colors={colors}
        insets={insets}
        onEnd={() => setPhase("ended")}
      />
    );
  }

  if (phase === "ended") {
    return (
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <ScreenHeader title={t("telehealth")} />
        <VisitEnded
          colors={colors}
          onViewSummary={() => { setPhase("list"); router.push("/visit-summaries"); }}
          onSchedule={() => { setPhase("list"); router.push("/request-appointment"); }}
        />
      </View>
    );
  }

  if (phase === "waiting" && selectedApt) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: insets.top }]}>
        <ScreenHeader title={t("telehealth")} subtitle={t("waitingRoom")} />
        <WaitingRoom
          appointment={selectedApt}
          colors={colors}
          onStart={() => { impactMedium(); setPhase("incall"); }}
          onBack={() => setPhase("list")}
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
            <AppointmentCard
              item={item}
              index={index}
              colors={colors}
              onJoin={(apt) => { setSelectedApt(apt); setPhase("waiting"); }}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, gap: 12, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },

  // card
  card: {
    borderRadius: 16, padding: 16, gap: 12, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardMeta: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  cardSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  dateBox: { borderRadius: 10, padding: 10, gap: 6 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  joinBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, paddingVertical: 12,
  },
  joinBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },

  // waiting room
  waitingScroll: { paddingBottom: 40 },
  hero: { margin: 16, borderRadius: 20, padding: 28, alignItems: "center", gap: 12 },
  heroIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  heroTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  providerPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 4,
  },
  providerPillText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium" },
  checklistWrap: { paddingHorizontal: 16, gap: 10 },
  checklistTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  checkItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  checkItemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  checkItemText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  waitingActions: { padding: 16, gap: 12, marginTop: 8 },
  startBtn: { borderRadius: 14, overflow: "hidden" },
  startBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16,
  },
  startBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  backBtn: { alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1 },
  backBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },

  // in-call
  callContainer: { flex: 1, backgroundColor: "#000" },
  callStatus: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 10,
  },
  callStatusLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" },
  callStatusText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  callProviderText: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "Inter_400Regular" },
  webview: { flex: 1 },
  controlBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    paddingTop: 16, paddingHorizontal: 20,
  },
  ctrlBtn: {
    width: 72, alignItems: "center", gap: 6,
    paddingVertical: 12, borderRadius: 16,
  },
  ctrlLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  endCallBtn: { alignItems: "center", gap: 6 },
  endCallGrad: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },

  // ended
  endedWrap: { flex: 1 },
  endedContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 28 },
  endedIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  endedTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  endedSub: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  endedBtn: { width: "100%", alignItems: "center", paddingVertical: 14, borderRadius: 14 },
  endedBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  endedBtnOutline: { width: "100%", alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1.5 },
  endedBtnOutlineText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },

  // empty / error
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  scheduleBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 4,
  },
  scheduleBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
