import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { StatusBadge } from "@/components/StatusBadge";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api, type Appointment } from "@/lib/api";

const C = Colors.light;

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

function AppointmentCard({ item, index }: { item: Appointment; index: number }) {
  const dt = formatDate(item.appointmentDate);
  const typeName = (item.appointmentType || "Appointment").replace(/_/g, " ");

  return (
    <View style={styles.card} testID={`card-appointment-${index}`}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <Feather name="calendar" size={20} color="#2563eb" />
        </View>
        <View style={styles.cardHeaderContent}>
          <Text style={styles.cardTitle} testID={`text-appointment-type-${index}`}>{typeName}</Text>
          <StatusBadge label={item.status || "Unknown"} />
        </View>
      </View>

      {dt ? (
        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <Feather name="calendar" size={14} color={C.textTertiary} />
            <Text style={styles.detailText} testID={`text-appointment-date-${index}`}>{dt.date}</Text>
          </View>
          <View style={styles.detailItem}>
            <Feather name="clock" size={14} color={C.textTertiary} />
            <Text style={styles.detailText} testID={`text-appointment-time-${index}`}>{dt.time}</Text>
          </View>
        </View>
      ) : null}

      {item.provider ? (
        <View style={styles.detailItem}>
          <Feather name="user" size={14} color={C.textTertiary} />
          <Text style={styles.detailText}>{item.provider}</Text>
        </View>
      ) : null}

      {item.reason ? (
        <View style={[styles.detailItem, { marginTop: 8 }]}>
          <Feather name="file-text" size={14} color={C.textTertiary} />
          <Text style={styles.detailText} testID={`text-appointment-reason-${index}`}>{item.reason}</Text>
        </View>
      ) : null}

      {item.location ? (
        <View style={styles.detailItem}>
          <Feather name="map-pin" size={14} color={C.textTertiary} />
          <Text style={styles.detailText}>{item.location}</Text>
        </View>
      ) : null}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Feather name="calendar" size={32} color={C.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Appointments</Text>
      <Text style={styles.emptyText}>Your scheduled appointments will appear here.</Text>
    </View>
  );
}

export default function AppointmentsScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => api.getAppointments(),
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Appointments" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Appointments" />
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
      <ScreenHeader title="Appointments" subtitle={data && data.length > 0 ? `${data.length} appointment${data.length !== 1 ? "s" : ""}` : undefined} />
      <FlatList
        data={data || []}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => <AppointmentCard item={item} index={index} />}
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
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderContent: {
    flex: 1,
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: C.text,
    textTransform: "capitalize",
  },
  detailRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: C.textSecondary,
  },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: C.text },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.textSecondary, textAlign: "center" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: C.text },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.textSecondary, textAlign: "center" },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: C.primary,
    borderRadius: 12,
  },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
