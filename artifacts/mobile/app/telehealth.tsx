import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { impactLight, impactMedium, impactHeavy, notificationSuccess, notificationError, selectionClick } from "@/lib/haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";

type VisitState = "lobby" | "waiting" | "inCall" | "ended";

function WaitingRoom({ colors, t, onJoin }: { colors: any; t: any; onJoin: () => void }) {
  return (
    <View style={styles.centerContent}>
      <View style={[styles.waitingIcon, { backgroundColor: colors.primaryLight }]}>
        <Feather name="video" size={48} color={colors.primary} />
      </View>
      <Text style={[styles.waitingTitle, { color: colors.text }]}>{t("waitingRoom")}</Text>
      <Text style={[styles.waitingText, { color: colors.textSecondary }]}>{t("waitingRoomText")}</Text>

      <View style={[styles.checklist, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <Text style={[styles.checklistTitle, { color: colors.text }]}>{t("beforeYourVisit")}</Text>
        {[t("checkCamera"), t("checkMicrophone"), t("quietLocation"), t("prepareQuestions")].map((item, i) => (
          <View key={i} style={styles.checkItem}>
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={[styles.checkText, { color: colors.textSecondary }]}>{item}</Text>
          </View>
        ))}
      </View>

      <Pressable style={[styles.joinBtn, { backgroundColor: colors.primary }]} onPress={onJoin}>
        <Feather name="video" size={20} color="#fff" />
        <Text style={styles.joinBtnText}>{t("joinVisit")}</Text>
      </Pressable>
    </View>
  );
}

function InCallView({ colors, t, onEnd }: { colors: any; t: any; onEnd: () => void }) {
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  return (
    <View style={styles.callContainer}>
      <View style={[styles.videoArea, { backgroundColor: "#1a1a2e" }]}>
        <View style={styles.remoteVideo}>
          <View style={[styles.avatarLarge, { backgroundColor: "#2d2d5e" }]}>
            <Feather name="user" size={48} color="#8888aa" />
          </View>
          <Text style={styles.callStatusText}>{t("connectedToProvider")}</Text>
        </View>

        <View style={[styles.selfVideo, { backgroundColor: "#2d2d5e", borderColor: "#4a4a8a" }]}>
          {isCameraOff ? (
            <Feather name="video-off" size={20} color="#8888aa" />
          ) : (
            <Feather name="user" size={24} color="#8888aa" />
          )}
        </View>

        <View style={styles.callTimer}>
          <View style={[styles.timerPill, { backgroundColor: "rgba(0,0,0,0.6)" }]}>
            <View style={[styles.liveDot, { backgroundColor: "#22c55e" }]} />
            <Text style={styles.timerText}>{t("inProgress")}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.controls, { backgroundColor: colors.surface }]}>
        <Pressable
          style={[styles.controlBtn, { backgroundColor: isMuted ? colors.danger : colors.surfaceSecondary }]}
          onPress={() => { impactLight(); setIsMuted(!isMuted); }}
        >
          <Feather name={isMuted ? "mic-off" : "mic"} size={22} color={isMuted ? "#fff" : colors.text} />
          <Text style={[styles.controlLabel, { color: isMuted ? "#fff" : colors.textSecondary }]}>{isMuted ? t("unmute") : t("mute")}</Text>
        </Pressable>

        <Pressable
          style={[styles.controlBtn, { backgroundColor: isCameraOff ? colors.danger : colors.surfaceSecondary }]}
          onPress={() => { impactLight(); setIsCameraOff(!isCameraOff); }}
        >
          <Feather name={isCameraOff ? "video-off" : "video"} size={22} color={isCameraOff ? "#fff" : colors.text} />
          <Text style={[styles.controlLabel, { color: isCameraOff ? "#fff" : colors.textSecondary }]}>{t("camera")}</Text>
        </Pressable>

        <Pressable
          style={[styles.endCallBtn, { backgroundColor: "#dc2626" }]}
          onPress={() => { impactHeavy(); onEnd(); }}
        >
          <Feather name="phone-off" size={22} color="#fff" />
          <Text style={[styles.controlLabel, { color: "#fff" }]}>{t("endCall")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PostCallView({ colors, t }: { colors: any; t: any }) {
  return (
    <View style={styles.centerContent}>
      <View style={[styles.waitingIcon, { backgroundColor: colors.successLight }]}>
        <Feather name="check-circle" size={48} color={colors.success} />
      </View>
      <Text style={[styles.waitingTitle, { color: colors.text }]}>{t("visitEnded")}</Text>
      <Text style={[styles.waitingText, { color: colors.textSecondary }]}>{t("visitEndedText")}</Text>

      <View style={styles.postActions}>
        <Pressable
          style={[styles.postBtn, { backgroundColor: colors.primary }]}
          onPress={() => { impactMedium(); router.push("/visit-summaries" as any); }}
        >
          <Feather name="clipboard" size={18} color="#fff" />
          <Text style={styles.postBtnText}>{t("viewVisitSummary")}</Text>
        </Pressable>
        <Pressable
          style={[styles.postBtn, { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border }]}
          onPress={() => { impactLight(); router.push("/request-appointment" as any); }}
        >
          <Feather name="calendar" size={18} color={colors.text} />
          <Text style={[styles.postBtnTextAlt, { color: colors.text }]}>{t("scheduleFollowUp")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TelehealthScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [visitState, setVisitState] = useState<VisitState>("lobby");

  const topPad = Platform.OS === "web" ? 20 : insets.top;

  if (visitState === "inCall") {
    return (
      <View style={[styles.container, { backgroundColor: "#0f0f23" }]}>
        <InCallView colors={colors} t={t} onEnd={() => setVisitState("ended")} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[styles.header, { paddingTop: topPad }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("telehealth")}</Text>
        <View style={styles.backBtn} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {visitState === "lobby" && <WaitingRoom colors={colors} t={t} onJoin={() => setVisitState("inCall")} />}
        {visitState === "ended" && <PostCallView colors={colors} t={t} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  scrollContent: { padding: 16, paddingBottom: 40 },
  centerContent: { alignItems: "center", gap: 16, paddingTop: 20 },
  waitingIcon: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  waitingTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  waitingText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, paddingHorizontal: 20 },
  checklist: { width: "100%", borderRadius: 14, padding: 16, gap: 10, borderWidth: 1 },
  checklistTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  checkItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  joinBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14 },
  joinBtnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  callContainer: { flex: 1 },
  videoArea: { flex: 1, justifyContent: "center", alignItems: "center" },
  remoteVideo: { alignItems: "center", gap: 12 },
  avatarLarge: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center" },
  callStatusText: { fontSize: 16, fontFamily: "Inter_500Medium", color: "#ccccee" },
  selfVideo: { position: "absolute", bottom: 16, right: 16, width: 100, height: 130, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  callTimer: { position: "absolute", top: 60, alignSelf: "center" },
  timerPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  timerText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  controls: { flexDirection: "row", justifyContent: "center", gap: 16, padding: 20, paddingBottom: 40 },
  controlBtn: { alignItems: "center", gap: 4, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, minWidth: 80 },
  controlLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  endCallBtn: { alignItems: "center", gap: 4, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14 },
  postActions: { width: "100%", gap: 10 },
  postBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 16, borderRadius: 14 },
  postBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  postBtnTextAlt: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
