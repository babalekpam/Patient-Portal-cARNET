import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBadge } from "@/components/StatusBadge";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SearchBar } from "@/components/SearchBar";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { useTheme } from "@/context/ThemeContext";
import { api, type Prescription } from "@/lib/api";

function PrescriptionCard({ item, index, colors }: { item: Prescription; index: number; colors: any }) {
  return (
    <AnimatedCard index={index}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]} testID={`card-prescription-${index}`}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Feather name="package" size={20} color="#7c3aed" />
          </View>
          <View style={styles.cardHeaderContent}>
            <Text style={[styles.cardTitle, { color: colors.text }]} testID={`text-medication-name-${index}`}>
              {item.medicationName || "Medication"}
            </Text>
            <StatusBadge label={item.status || "Unknown"} />
          </View>
        </View>
        <View style={styles.pillRow}>
          {item.dosage ? (
            <View style={[styles.pill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Text style={[styles.pillText, { color: colors.textSecondary }]}>{item.dosage}</Text>
            </View>
          ) : null}
          {item.frequency ? (
            <View style={[styles.pill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Text style={[styles.pillText, { color: colors.textSecondary }]}>{item.frequency}</Text>
            </View>
          ) : null}
        </View>
        {item.instructions ? (
          <View style={[styles.instructionBox, { backgroundColor: colors.infoLight }]}>
            <Feather name="info" size={13} color={colors.info} />
            <Text style={[styles.instructionText, { color: colors.info }]}>{item.instructions}</Text>
          </View>
        ) : null}
        <View style={styles.footer}>
          {item.prescribingProvider ? (
            <View style={styles.footerItem}>
              <Feather name="user" size={13} color={colors.textTertiary} />
              <Text style={[styles.footerText, { color: colors.textSecondary }]}>{item.prescribingProvider}</Text>
            </View>
          ) : null}
          {typeof item.refillsRemaining === "number" ? (
            <View style={styles.refillBadge}>
              <Feather name="refresh-cw" size={12} color={item.refillsRemaining > 0 ? colors.success : colors.danger} />
              <Text style={[styles.refillText, { color: item.refillsRemaining > 0 ? colors.success : colors.danger }]}>
                {item.refillsRemaining} refill{item.refillsRemaining !== 1 ? "s" : ""} left
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </AnimatedCard>
  );
}

function EmptyState({ colors }: { colors: any }) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}>
        <Feather name="package" size={32} color={colors.textTertiary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No Prescriptions</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Your active prescriptions will appear here.</Text>
    </View>
  );
}

export default function PrescriptionsScreen() {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["prescriptions"],
    queryFn: () => api.getPrescriptions(),
  });

  const filtered = data?.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.medicationName?.toLowerCase().includes(q) ||
      p.prescribingProvider?.toLowerCase().includes(q) ||
      p.dosage?.toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Prescriptions" />
        <ListSkeleton />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Prescriptions" />
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
      <ScreenHeader title="Prescriptions" subtitle={data && data.length > 0 ? `${data.length} medication${data.length !== 1 ? "s" : ""}` : undefined} />
      <FlatList
        data={filtered || []}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => <PrescriptionCard item={item} index={index} colors={colors} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={data && data.length > 1 ? <SearchBar value={search} onChangeText={setSearch} placeholder="Search medications..." /> : null}
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
  card: {
    borderRadius: 16, padding: 16, gap: 10, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#ede9fe", alignItems: "center", justifyContent: "center" },
  cardHeaderContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  pillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  pillText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  instructionBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 10 },
  instructionText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  refillBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  refillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
