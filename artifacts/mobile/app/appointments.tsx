import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AccessiblePressable as Pressable } from "@/components/AccessiblePressable";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";
import { StatusBadge } from "@/components/StatusBadge";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SearchBar } from "@/components/SearchBar";
import { CalendarStrip } from "@/components/CalendarStrip";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { useTheme } from "@/context/ThemeContext";
import { api, type Appointment } from "@/lib/api";
import { LogoWatermark } from "@/components/LogoWatermark";

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateKey(dateStr?: string): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return toDateKey(d);
  } catch {
    return null;
  }
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };
  } catch {
    return null;
  }
}

function AppointmentCard({ item, index, colors }: { item: Appointment; index: number; colors: any }) {
  const dt = formatDate(item.appointmentDate);
  const typeName = (item.appointmentType || "Appointment").replace(/_/g, " ");

  return (
    <AnimatedCard index={index}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]} testID={`card-appointment-${index}`}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Feather name="calendar" size={20} color="#2563eb" />
          </View>
          <View style={styles.cardHeaderContent}>
            <Text style={[styles.cardTitle, { color: colors.text }]} testID={`text-appointment-type-${index}`}>{typeName}</Text>
            <StatusBadge label={item.status || "Unknown"} />
          </View>
        </View>
        {dt ? (
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Feather name="calendar" size={14} color={colors.textTertiary} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]} testID={`text-appointment-date-${index}`}>{dt.date}</Text>
            </View>
            <View style={styles.detailItem}>
              <Feather name="clock" size={14} color={colors.textTertiary} />
              <Text style={[styles.detailText, { color: colors.textSecondary }]} testID={`text-appointment-time-${index}`}>{dt.time}</Text>
            </View>
          </View>
        ) : null}
        {item.provider || item.doctorName ? (
          <View style={styles.detailItem}>
            <Feather name="user" size={14} color={colors.textTertiary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>{item.doctorName || item.provider}</Text>
          </View>
        ) : null}
        {item.hospitalName ? (
          <View style={styles.detailItem}>
            <Feather name="home" size={14} color={colors.textTertiary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>{item.hospitalName}</Text>
          </View>
        ) : null}
        {item.reason ? (
          <View style={[styles.detailItem, { marginTop: 4 }]}>
            <Feather name="file-text" size={14} color={colors.textTertiary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]} testID={`text-appointment-reason-${index}`}>{item.reason}</Text>
          </View>
        ) : null}
        {item.location ? (
          <View style={styles.detailItem}>
            <Feather name="map-pin" size={14} color={colors.textTertiary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>{item.location}</Text>
          </View>
        ) : null}
      </View>
    </AnimatedCard>
  );
}

function EmptyState({ forDate, colors }: { forDate: boolean; colors: any }) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}>
        <Feather name="calendar" size={32} color={colors.textTertiary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {forDate ? "No Appointments This Day" : "No Appointments"}
      </Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        {forDate ? "Select another date or check your full schedule." : "Your scheduled appointments will appear here."}
      </Text>
    </View>
  );
}

type ViewMode = "calendar" | "list";

export default function AppointmentsScreen() {
  const { colors } = useTheme();
  const a11y = useAccessibilityLabels();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => api.getAppointments(),
  });

  const markedDates = useMemo(() => {
    if (!data) return [];
    return data.map((a) => parseDateKey(a.appointmentDate)).filter(Boolean) as string[];
  }, [data]);

  const selectedKey = toDateKey(selectedDate);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data;
    if (viewMode === "calendar") {
      list = list.filter((a) => parseDateKey(a.appointmentDate) === selectedKey);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.appointmentType?.toLowerCase().includes(q) ||
          a.provider?.toLowerCase().includes(q) ||
          a.doctorName?.toLowerCase().includes(q) ||
          a.reason?.toLowerCase().includes(q) ||
          a.location?.toLowerCase().includes(q) ||
          a.hospitalName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, viewMode, selectedKey, search]);

  const toggleViewMode = () => setViewMode((v) => (v === "calendar" ? "list" : "calendar"));

  const viewToggle = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={viewMode === "calendar" ? "Show appointment list" : "Show appointment calendar"}
      accessibilityHint="Changes the appointment view"
      style={({ pressed }) => [styles.viewToggle, pressed && { opacity: 0.7 }]}
      onPress={toggleViewMode}
    >
      <Feather name={viewMode === "calendar" ? "list" : "calendar"} size={18} color="#fff" />
    </Pressable>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Appointments" rightElement={viewToggle} />
        <View accessibilityRole="progressbar" accessibilityLabel={a11y.loading} aria-busy={true}><ListSkeleton /></View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Appointments" rightElement={viewToggle} />
        <View style={styles.centered}>
          <Feather name="wifi-off" size={36} color={colors.textTertiary} />
          <Text accessibilityRole="header" style={[styles.errorTitle, { color: colors.text }]}>Unable to Load</Text>
          <Text accessibilityRole="alert" aria-live="assertive" style={[styles.errorText, { color: colors.textSecondary }]}>{(error as Error).message}</Text>
          <Pressable accessibilityLabel={a11y.refresh} style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
            <Text style={[styles.retryText, { color: colors.onPrimary }]}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const totalCount = data?.length || 0;
  const subtitle = viewMode === "calendar"
    ? `${filtered.length} on this day`
    : totalCount > 0 ? `${totalCount} total` : undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title="Appointments" subtitle={subtitle} rightElement={viewToggle} />
      <FlatList
        data={filtered}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => <AppointmentCard item={item} index={index} colors={colors} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerComponents}>
            {viewMode === "calendar" ? (
              <CalendarStrip
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                markedDates={markedDates}
              />
            ) : null}
            {totalCount > 1 ? (
              <SearchBar
                value={search}
                onChangeText={setSearch}
                placeholder="Search appointments..."
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={<EmptyState forDate={viewMode === "calendar"} colors={colors} />}
        refreshControl={<RefreshControl accessibilityLabel={a11y.refresh} refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  headerComponents: { gap: 8, marginBottom: 4 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: "#dbeafe",
    alignItems: "center", justifyContent: "center",
  },
  cardHeaderContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  detailRow: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  detailItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  viewToggle: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
