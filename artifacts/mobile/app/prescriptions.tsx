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
import { api, type Prescription } from "@/lib/api";

const C = Colors.light;

function PrescriptionCard({ item, index }: { item: Prescription; index: number }) {
  return (
    <View style={styles.card} testID={`card-prescription-${index}`}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <Feather name="package" size={20} color="#7c3aed" />
        </View>
        <View style={styles.cardHeaderContent}>
          <Text style={styles.cardTitle} testID={`text-medication-name-${index}`}>
            {item.medicationName || "Medication"}
          </Text>
          <StatusBadge label={item.status || "Unknown"} />
        </View>
      </View>

      <View style={styles.pillRow}>
        {item.dosage ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{item.dosage}</Text>
          </View>
        ) : null}
        {item.frequency ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>{item.frequency}</Text>
          </View>
        ) : null}
      </View>

      {item.instructions ? (
        <View style={styles.instructionBox}>
          <Feather name="info" size={13} color={C.info} />
          <Text style={styles.instructionText}>{item.instructions}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        {item.prescribingProvider ? (
          <View style={styles.footerItem}>
            <Feather name="user" size={13} color={C.textTertiary} />
            <Text style={styles.footerText}>{item.prescribingProvider}</Text>
          </View>
        ) : null}
        {typeof item.refillsRemaining === "number" ? (
          <View style={styles.refillBadge}>
            <Feather name="refresh-cw" size={12} color={item.refillsRemaining > 0 ? C.success : C.danger} />
            <Text style={[styles.refillText, { color: item.refillsRemaining > 0 ? C.success : C.danger }]}>
              {item.refillsRemaining} refill{item.refillsRemaining !== 1 ? "s" : ""} left
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Feather name="package" size={32} color={C.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Prescriptions</Text>
      <Text style={styles.emptyText}>Your active prescriptions will appear here.</Text>
    </View>
  );
}

export default function PrescriptionsScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => api.getPrescriptions(),
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Prescriptions" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Prescriptions" />
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
      <ScreenHeader title="Prescriptions" subtitle={data && data.length > 0 ? `${data.length} medication${data.length !== 1 ? "s" : ""}` : undefined} />
      <FlatList
        data={data || []}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => <PrescriptionCard item={item} index={index} />}
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
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#ede9fe",
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.text },
  pillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: C.surfaceSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  pillText: { fontSize: 12, fontFamily: "Inter_500Medium", color: C.textSecondary },
  instructionBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: C.infoLight,
    borderRadius: 10,
    padding: 10,
  },
  instructionText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#0369a1" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerText: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.textSecondary },
  refillBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  refillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 24, backgroundColor: C.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: C.text },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.textSecondary, textAlign: "center" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: C.text },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.textSecondary, textAlign: "center" },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: C.primary, borderRadius: 12 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
