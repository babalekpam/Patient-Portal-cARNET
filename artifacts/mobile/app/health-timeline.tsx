import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type EventType = "appointment" | "prescription" | "lab" | "message";

interface TimelineEvent {
  id: string;
  type: EventType;
  title: string;
  subtitle?: string;
  date: string;
  status?: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  iconColor: string;
  iconBg: string;
}

const EVENT_CONFIG: Record<EventType, { icon: React.ComponentProps<typeof Feather>["name"]; color: string; bg: string }> = {
  appointment: { icon: "calendar", color: "#1a6fbf", bg: "#e8f2fd" },
  prescription: { icon: "package", color: "#7c3aed", bg: "#ede9fe" },
  lab: { icon: "bar-chart-2", color: "#059669", bg: "#d1fae5" },
  message: { icon: "mail", color: "#d97706", bg: "#fef3c7" },
};

const FILTER_OPTIONS: Array<{ key: EventType | "all"; icon: React.ComponentProps<typeof Feather>["name"] }> = [
  { key: "all", icon: "layers" },
  { key: "appointment", icon: "calendar" },
  { key: "prescription", icon: "package" },
  { key: "lab", icon: "bar-chart-2" },
  { key: "message", icon: "mail" },
];

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return {
      full: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      monthDay: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      dateKey: d.toISOString().split("T")[0],
    };
  } catch {
    return { full: dateStr, monthDay: dateStr, time: "", dateKey: dateStr };
  }
}

function TimelineCard({ event, index, colors, isLast }: { event: TimelineEvent; index: number; colors: any; isLast: boolean }) {
  const dt = formatDate(event.date);
  return (
    <AnimatedCard index={Math.min(index, 8)}>
      <View style={styles.timelineRow}>
        <View style={styles.timelineLeft}>
          <View style={[styles.timelineDot, { backgroundColor: event.iconBg }]}>
            <Feather name={event.icon} size={16} color={event.iconColor} />
          </View>
          {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.borderLight }]} />}
        </View>
        <View style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.eventHeader}>
            <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>{event.title}</Text>
            {event.status && (
              <View style={[styles.statusPill, { backgroundColor: event.iconBg }]}>
                <Text style={[styles.statusText, { color: event.iconColor }]}>{event.status}</Text>
              </View>
            )}
          </View>
          {event.subtitle && <Text style={[styles.eventSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>{event.subtitle}</Text>}
          <Text style={[styles.eventDate, { color: colors.textTertiary }]}>{dt.full}{dt.time ? ` · ${dt.time}` : ""}</Text>
        </View>
      </View>
    </AnimatedCard>
  );
}

export default function HealthTimelineScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [filter, setFilter] = useState<EventType | "all">("all");

  const { data: appointments, isLoading: loadingAppts, refetch: refetchAppts } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => api.getAppointments(),
  });

  const { data: prescriptions, isLoading: loadingRx, refetch: refetchRx } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => api.getPrescriptions(),
  });

  const { data: labs, isLoading: loadingLabs, refetch: refetchLabs } = useQuery({
    queryKey: ["labResults"],
    queryFn: () => api.getLabResults(),
  });

  const { data: messages, isLoading: loadingMsgs, refetch: refetchMsgs } = useQuery({
    queryKey: ["messages"],
    queryFn: () => api.getMessages(),
  });

  const isLoading = loadingAppts || loadingRx || loadingLabs || loadingMsgs;

  const events = useMemo(() => {
    const items: TimelineEvent[] = [];
    const cfg = EVENT_CONFIG;

    appointments?.forEach((a, i) => {
      items.push({
        id: `appt-${a.id || i}`,
        type: "appointment",
        title: a.appointmentType?.replace(/_/g, " ") || t("appointments"),
        subtitle: [a.doctorName, a.hospitalName].filter(Boolean).join(" · "),
        date: a.appointmentDate || new Date().toISOString(),
        status: a.status,
        icon: cfg.appointment.icon,
        iconColor: cfg.appointment.color,
        iconBg: cfg.appointment.bg,
      });
    });

    prescriptions?.forEach((p, i) => {
      items.push({
        id: `rx-${p.id || i}`,
        type: "prescription",
        title: p.medicationName || t("prescriptions"),
        subtitle: [p.dosage, p.frequency].filter(Boolean).join(" · "),
        date: p.prescribedDate || new Date().toISOString(),
        status: p.status,
        icon: cfg.prescription.icon,
        iconColor: cfg.prescription.color,
        iconBg: cfg.prescription.bg,
      });
    });

    labs?.forEach((l, i) => {
      items.push({
        id: `lab-${l.id || i}`,
        type: "lab",
        title: l.testName || t("labResults"),
        subtitle: l.orderingProvider ? `${t("orderedBy")} ${l.orderingProvider}` : undefined,
        date: l.resultDate || new Date().toISOString(),
        status: l.status,
        icon: cfg.lab.icon,
        iconColor: cfg.lab.color,
        iconBg: cfg.lab.bg,
      });
    });

    messages?.forEach((m, i) => {
      items.push({
        id: `msg-${m.id || i}`,
        type: "message",
        title: m.originalContent?.subject || m.type?.replace(/_/g, " ") || t("messages"),
        subtitle: m.sender ? `${t("from")} ${m.sender}` : undefined,
        date: m.createdAt || new Date().toISOString(),
        icon: cfg.message.icon,
        iconColor: cfg.message.color,
        iconBg: cfg.message.bg,
      });
    });

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [appointments, prescriptions, labs, messages, t]);

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);

  const handleRefresh = () => {
    refetchAppts();
    refetchRx();
    refetchLabs();
    refetchMsgs();
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("healthTimeline")} />
        <ListSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t("healthTimeline")} subtitle={`${events.length} ${t("events").toLowerCase()}`} />

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            style={[
              styles.filterChip,
              { backgroundColor: filter === opt.key ? colors.primary : colors.surfaceSecondary, borderColor: filter === opt.key ? colors.primary : colors.border },
            ]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFilter(opt.key); }}
          >
            <Feather name={opt.icon} size={14} color={filter === opt.key ? "#fff" : colors.textSecondary} />
            <Text style={[styles.filterText, { color: filter === opt.key ? "#fff" : colors.textSecondary }]}>
              {opt.key === "all" ? t("all") : t(opt.key === "appointment" ? "appointments" : opt.key === "prescription" ? "prescriptions" : opt.key === "lab" ? "labResults" : "messages")}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <TimelineCard event={item} index={index} colors={colors} isLast={index === filtered.length - 1} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="clock" size={40} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("noTimelineEvents")}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("timelineEmpty")}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, paddingBottom: 8, flexWrap: "wrap" },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  listContent: { padding: 16, paddingTop: 8 },
  timelineRow: { flexDirection: "row", gap: 12, marginBottom: 4 },
  timelineLeft: { alignItems: "center", width: 36 },
  timelineDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  timelineLine: { width: 2, flex: 1, marginTop: 4 },
  eventCard: { flex: 1, borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  eventHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  eventTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  eventSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  eventDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
