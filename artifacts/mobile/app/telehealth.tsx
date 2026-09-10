import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { impactLight, impactMedium, notificationSuccess } from "@/lib/haptics";
import { router } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Pressable } from "@/components/AccessiblePressable";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useTheme } from "@/context/ThemeContext";
import { api, type TelehealthAppointment, type TelehealthSession } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";

type VisitPhase = "list" | "waiting" | "incall" | "ended";

// ─── helpers ─────────────────────────────────────────────────────────────────

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

// JS injected into Jitsi WebView to toggle audio/video
const JITSI_TOGGLE_AUDIO = `
  (function(){
    document.querySelectorAll('[aria-label*="mute" i],[aria-label*="audio" i],[data-testid*="audio" i]')[0]?.click();
  })(); true;
`;
const JITSI_TOGGLE_VIDEO = `
  (function(){
    document.querySelectorAll('[aria-label*="camera" i],[aria-label*="video" i],[data-testid*="video" i]')[0]?.click();
  })(); true;
`;

// ─── Appointment card ─────────────────────────────────────────────────────────

function AppointmentCard({
  item,
  index,
  colors,
  onJoin,
}: {
  item: TelehealthAppointment;
  index: number;
  colors: any;
  onJoin: (apt: TelehealthAppointment) => void;
}) {
  const { t } = useI18n();
  const dt = formatDate(item.appointmentDate);
  const typeName = (item.appointmentType || "Telehealth Visit").replace(/_/g, " ");

  return (
    <AnimatedCard index={index}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <LinearGradient colors={["#2563eb", "#1d4ed8"]} style={styles.badge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <Feather name="video" size={12} color={colors.whiteText} />
          <Text style={[styles.badgeText, { color: colors.whiteText }]}>Virtual Visit</Text>
        </LinearGradient>

        <View style={styles.cardRow}>
          <View style={[styles.iconBox, { backgroundColor: "#dbeafe" }]}>
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
          accessibilityRole="button"
        >
          <Feather name="video" size={16} color={colors.onPrimary} />
          <Text style={[styles.joinBtnText, { color: colors.onPrimary }]}>{t("joinVisit")}</Text>
        </Pressable>
      </View>
    </AnimatedCard>
  );
}

// ─── Waiting room ─────────────────────────────────────────────────────────────

function WaitingRoom({
  appointment,
  colors,
  onStart,
  onBack,
  isCreatingSession,
  sessionError,
}: {
  appointment: TelehealthAppointment;
  colors: any;
  onStart: () => void;
  onBack: () => void;
  isCreatingSession: boolean;
  sessionError: string | null;
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
          <Feather name="video" size={40} color={colors.whiteText} />
        </View>
        <Text style={[styles.heroTitle, { color: colors.whiteText }]}>{t("waitingRoom")}</Text>
        <Text style={[styles.heroSub, { color: colors.onPrimaryMuted }]}>{t("waitingRoomText")}</Text>
        {appointment.doctorName || appointment.provider ? (
          <View style={styles.providerPill}>
            <Feather name="user" size={13} color={colors.whiteText} />
            <Text style={[styles.providerPillText, { color: colors.whiteText }]}>{appointment.doctorName || appointment.provider}</Text>
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

      {sessionError ? (
        <View style={[styles.errorBanner, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]} accessibilityRole="alert" accessibilityLiveRegion="assertive" aria-live="assertive">
          <Feather name="alert-circle" size={16} color={colors.danger} />
          <Text style={[styles.errorBannerText, { color: colors.danger }]}>{sessionError}</Text>
        </View>
      ) : null}

      <View style={styles.waitingActions}>
        <Pressable
          style={({ pressed }) => [styles.startBtn, (isCreatingSession || !!sessionError) && { opacity: 0.6 }, pressed && { opacity: 0.88 }]}
          onPress={onStart}
          disabled={isCreatingSession}
          accessibilityRole="button"
          accessibilityState={{ disabled: isCreatingSession, busy: isCreatingSession }}
        >
          <LinearGradient colors={["#2563eb", "#1d4ed8"]} style={styles.startBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {isCreatingSession ? (
              <ActivityIndicator color={colors.whiteText} size="small" />
            ) : (
              <Feather name="video" size={20} color={colors.whiteText} />
            )}
            <Text style={[styles.startBtnText, { color: colors.whiteText }]}>
              {isCreatingSession ? "Connecting..." : t("joinVisit")}
            </Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.backBtn, { borderColor: colors.controlBorder }, pressed && { opacity: 0.7 }]}
          onPress={() => { impactLight(); onBack(); }}
          accessibilityRole="button"
        >
          <Text style={[styles.backBtnText, { color: colors.textSecondary }]}>Go Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ─── In-call screen ───────────────────────────────────────────────────────────

function InCallScreen({
  session,
  colors,
  insets,
  onEnd,
}: {
  session: TelehealthSession;
  colors: any;
  insets: any;
  onEnd: () => void;
}) {
  const { t } = useI18n();
  const webviewRef = useRef<WebView>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  function toggleMute() {
    impactLight();
    if (Platform.OS !== "web") {
      webviewRef.current?.injectJavaScript(JITSI_TOGGLE_AUDIO);
    }
    setMuted((v) => !v);
  }

  function toggleCamera() {
    impactLight();
    if (Platform.OS !== "web") {
      webviewRef.current?.injectJavaScript(JITSI_TOGGLE_VIDEO);
    }
    setCameraOff((v) => !v);
  }

  function handleEnd() {
    impactMedium();
    notificationSuccess();
    onEnd();
  }

  // Validate the server-provided room URL: only allow secure (https) origins.
  let roomOrigin: string | null = null;
  try {
    const parsed = new URL(session.roomUrl);
    if (parsed.protocol === "https:") {
      roomOrigin = parsed.origin;
    }
  } catch {
    roomOrigin = null;
  }

  // On native we hide Jitsi's own toolbar and drive controls from the native
  // control bar via injected JS. On web we keep Jitsi's in-iframe controls,
  // since cross-origin scripting of the iframe is not possible.
  const callUrl = session.roomUrl.includes("?")
    ? session.roomUrl
    : Platform.OS === "web"
      ? `${session.roomUrl}#config.prejoinPageEnabled=false`
      : `${session.roomUrl}#config.prejoinPageEnabled=false&interfaceConfig.TOOLBAR_BUTTONS=[]`;

  if (!roomOrigin) {
    return (
      <View style={[styles.callContainer, styles.callInvalid, { backgroundColor: colors.background }]}>
        <Feather name="alert-triangle" size={40} color="#dc2626" />
        <Text style={[styles.callInvalidText, { color: colors.text }]}>{t("error")}</Text>
        <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={handleEnd} accessibilityRole="button">
          <Text style={[styles.retryText, { color: colors.onPrimary }]}>{t("endCall")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.callContainer}>
      {/* Status bar */}
      <LinearGradient
        colors={["#1e3a8a", "#1d4ed8"]}
        style={[styles.callStatus, { paddingTop: insets.top + 4 }]}
      >
        <View style={styles.callStatusLeft}>
          <View style={styles.liveDot} />
          <Text style={[styles.callStatusText, { color: colors.whiteText }]}>{t("inProgress")}</Text>
        </View>
        <Text style={[styles.callProviderText, { color: colors.onPrimaryMuted }]}>
          {session.providerName || "Your Provider"}
        </Text>
      </LinearGradient>

      {/* Video session via Navimed room URL */}
      {Platform.OS === "web" ? (
        <iframe
          src={callUrl}
          style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          title="Telehealth video visit"
        />
      ) : (
        <WebView
          ref={webviewRef}
          source={{ uri: callUrl }}
          style={styles.webview}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          javaScriptEnabled
          domStorageEnabled
          mediaCapturePermissionGrantType="grant"
          originWhitelist={[roomOrigin]}
          allowsFullscreenVideo
        />
      )}

      {/* Control bar. On web the call's own (Jitsi) controls are used for
          mute/camera, so we only surface End Call here. */}
      <View style={[styles.controlBar, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
        {Platform.OS !== "web" && (
          <Pressable
            style={({ pressed }) => [
              styles.ctrlBtn,
              { backgroundColor: muted ? colors.danger : colors.surfaceSecondary },
              pressed && { opacity: 0.8 },
            ]}
            onPress={toggleMute}
            accessibilityRole="button"
            accessibilityState={{ selected: muted }}
          >
            <Feather name={muted ? "mic-off" : "mic"} size={22} color={muted ? colors.onPrimary : colors.text} />
            <Text style={[styles.ctrlLabel, { color: muted ? colors.onPrimary : colors.textSecondary }]}>
              {muted ? t("unmute") : t("mute")}
            </Text>
          </Pressable>
        )}

        <Pressable style={({ pressed }) => [styles.endCallBtn, pressed && { opacity: 0.88 }]} onPress={handleEnd} accessibilityRole="button">
          <LinearGradient colors={["#dc2626", "#b91c1c"]} style={styles.endCallGrad}>
            <Feather name="phone-off" size={26} color={colors.whiteText} />
          </LinearGradient>
          <Text style={[styles.ctrlLabel, { color: "#dc2626" }]}>{t("endCall")}</Text>
        </Pressable>

        {Platform.OS !== "web" && (
          <Pressable
            style={({ pressed }) => [
              styles.ctrlBtn,
              { backgroundColor: cameraOff ? colors.danger : colors.surfaceSecondary },
              pressed && { opacity: 0.8 },
            ]}
            onPress={toggleCamera}
            accessibilityRole="button"
            accessibilityState={{ selected: cameraOff }}
          >
            <Feather name={cameraOff ? "video-off" : "video"} size={22} color={cameraOff ? colors.onPrimary : colors.text} />
            <Text style={[styles.ctrlLabel, { color: cameraOff ? colors.onPrimary : colors.textSecondary }]}>
              {t("camera")}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Visit ended ──────────────────────────────────────────────────────────────

function VisitEnded({ colors, onViewSummary, onSchedule }: { colors: any; onViewSummary: () => void; onSchedule: () => void }) {
  const { t } = useI18n();
  return (
    <View style={[styles.endedWrap, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <View style={styles.endedContent}>
        <LinearGradient colors={[colors.success, colors.success]} style={styles.endedIcon}>
          <Feather name="check" size={44} color={colors.onPrimary} />
        </LinearGradient>
        <Text style={[styles.endedTitle, { color: colors.text }]}>{t("visitEnded")}</Text>
        <Text style={[styles.endedSub, { color: colors.textSecondary }]}>{t("visitEndedText")}</Text>
        <Pressable
          style={({ pressed }) => [styles.endedBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          onPress={onViewSummary}
          accessibilityRole="button"
        >
          <Text style={[styles.endedBtnText, { color: colors.onPrimary }]}>{t("viewVisitSummary")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.endedBtnOutline, { borderColor: colors.primary }, pressed && { opacity: 0.7 }]}
          onPress={onSchedule}
          accessibilityRole="button"
        >
          <Text style={[styles.endedBtnOutlineText, { color: colors.primary }]}>{t("scheduleFollowUp")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Root screen ──────────────────────────────────────────────────────────────

export default function TelehealthScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<VisitPhase>("list");
  const [selectedApt, setSelectedApt] = useState<TelehealthAppointment | null>(null);
  const [activeSession, setActiveSession] = useState<TelehealthSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // GET /patient/telehealth/appointments
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["telehealthAppointments"],
    queryFn: () => api.getTelehealthAppointments(),
  });

  // POST /patient/telehealth/sessions/:appointmentId
  const sessionMutation = useMutation({
    mutationFn: (appointmentId: string) => api.createTelehealthSession(appointmentId),
    onSuccess: (session) => {
      setActiveSession(session);
      setSessionError(null);
      setPhase("incall");
    },
    onError: (err: Error) => {
      setSessionError(err.message || "Unable to start session. Please try again.");
    },
  });

  function handleJoin(apt: TelehealthAppointment) {
    setSelectedApt(apt);
    setSessionError(null);
    setPhase("waiting");
  }

  function handleStartCall() {
    if (!selectedApt?.id) return;
    impactMedium();
    sessionMutation.mutate(selectedApt.id);
  }

  // In-call: full-screen, no header
  if (phase === "incall" && activeSession) {
    return (
      <InCallScreen
        session={activeSession}
        colors={colors}
        insets={insets}
        onEnd={() => { setActiveSession(null); setPhase("ended"); }}
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
          onStart={handleStartCall}
          onBack={() => { setPhase("list"); setSessionError(null); sessionMutation.reset(); }}
          isCreatingSession={sessionMutation.isPending}
          sessionError={sessionError}
        />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]} accessibilityState={{ busy: true }} aria-busy={true}>
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
          <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()} accessibilityRole="button">
            <Text style={[styles.retryText, { color: colors.onPrimary }]}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const apts = data || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title={t("telehealth")} subtitle={`${apts.length} upcoming`} />

      {apts.length === 0 ? (
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
            accessibilityRole="button"
          >
            <Feather name="plus" size={16} color={colors.onPrimary} />
            <Text style={[styles.scheduleBtnText, { color: colors.onPrimary }]}>Schedule Visit</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={apts}
          keyExtractor={(item, i) => item.id || i.toString()}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
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
  joinBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", flexShrink: 1 },

  // waiting room
  waitingScroll: { paddingBottom: 40 },
  hero: { margin: 16, borderRadius: 20, padding: 28, alignItems: "center", gap: 12 },
  heroIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  heroTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  providerPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 4,
  },
  providerPillText: { fontSize: 13, fontFamily: "Inter_500Medium", flexShrink: 1 },
  checklistWrap: { paddingHorizontal: 16, gap: 10 },
  checklistTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  checkItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  checkItemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  checkItemText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginTop: 12,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  errorBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#dc2626" },
  waitingActions: { padding: 16, gap: 12, marginTop: 8 },
  startBtn: { borderRadius: 14, overflow: "hidden" },
  startBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16,
  },
  startBtnText: { fontSize: 17, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
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
  callStatusText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  callProviderText: { fontSize: 13, fontFamily: "Inter_400Regular", flexShrink: 1 },
  webview: { flex: 1 },
  controlBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    paddingTop: 16, paddingHorizontal: 20,
  },
  ctrlBtn: { width: 72, alignItems: "center", gap: 6, paddingVertical: 12, borderRadius: 16 },
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
  endedBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
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
  scheduleBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  callInvalid: { alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  callInvalidText: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
});
