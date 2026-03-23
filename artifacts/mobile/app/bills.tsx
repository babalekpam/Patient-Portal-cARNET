import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
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
import { AnimatedCard } from "@/components/AnimatedCard";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { useTheme } from "@/context/ThemeContext";
import { api, type Bill } from "@/lib/api";
import { LogoWatermark } from "@/components/LogoWatermark";

function formatCurrency(amount?: number) {
  if (amount === undefined || amount === null) return "\u2014";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return null; }
}

function BillCard({ item, index, colors }: { item: Bill; index: number; colors: any }) {
  const serviceDate = formatDate(item.serviceDate);

  return (
    <AnimatedCard index={index + 1}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]} testID={`card-bill-${index}`}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Feather name="credit-card" size={20} color="#d97706" />
          </View>
          <View style={styles.cardHeaderContent}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{item.description || "Medical Bill"}</Text>
            <StatusBadge label={item.status || "Unknown"} />
          </View>
        </View>
        {serviceDate ? (
          <View style={styles.metaItem}>
            <Feather name="calendar" size={13} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]} testID={`text-service-date-${index}`}>Service: {serviceDate}</Text>
          </View>
        ) : null}
        <View style={styles.amountsGrid}>
          <View style={[styles.amountItem, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.amountLabel, { color: colors.textTertiary }]}>Total Charges</Text>
            <Text style={[styles.amountValue, { color: colors.text }]} testID={`text-total-charges-${index}`}>{formatCurrency(item.totalCharges)}</Text>
          </View>
          <View style={[styles.amountItem, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.amountLabel, { color: colors.textTertiary }]}>Insurance Paid</Text>
            <Text style={[styles.amountValue, { color: colors.success }]} testID={`text-insurance-paid-${index}`}>{formatCurrency(item.insurancePaid)}</Text>
          </View>
        </View>
        <View style={[styles.responsibilityBox, { backgroundColor: colors.primaryLight }]}>
          <View style={styles.responsibilityLeft}>
            <Feather name="dollar-sign" size={16} color={colors.primary} />
            <Text style={[styles.responsibilityLabel, { color: colors.primary }]}>Your Responsibility</Text>
          </View>
          <Text style={[styles.responsibilityAmount, { color: colors.primary }]} testID={`text-patient-responsibility-${index}`}>{formatCurrency(item.patientResponsibility)}</Text>
        </View>
      </View>
    </AnimatedCard>
  );
}

function SummaryCard({ data: bills, colors }: { data: Bill[]; colors: any }) {
  const totalOwed = bills.reduce((sum, b) => sum + (b.patientResponsibility || 0), 0);
  const unpaidCount = bills.filter((b) => b.status?.toLowerCase() !== "paid").length;
  return (
    <AnimatedCard index={0}>
      <View style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Due</Text>
          <Text style={styles.summaryAmount}>{formatCurrency(totalOwed)}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Unpaid Bills</Text>
          <Text style={[styles.summaryAmount, unpaidCount > 0 && { color: "#fbbf24" }]}>{unpaidCount}</Text>
        </View>
      </View>
    </AnimatedCard>
  );
}

function EmptyState({ colors }: { colors: any }) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}>
        <Feather name="credit-card" size={32} color={colors.textTertiary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No Bills</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Your billing statements will appear here.</Text>
    </View>
  );
}

export default function BillsScreen() {
  const { colors } = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["bills"],
    queryFn: () => api.getBills(),
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Bills & Payments" />
        <ListSkeleton />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Bills & Payments" />
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

  const bills = data || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title="Bills & Payments" />
      <FlatList
        data={bills}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => <BillCard item={item} index={index} colors={colors} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={bills.length > 0 ? <SummaryCard data={bills} colors={colors} /> : null}
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
  summaryCard: {
    borderRadius: 16, padding: 20, flexDirection: "row", marginBottom: 4,
    shadowColor: "#1a6fbf", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginBottom: 4 },
  summaryAmount: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
  summaryDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 4 },
  card: {
    borderRadius: 16, padding: 16, gap: 12, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#fef3c7", alignItems: "center", justifyContent: "center" },
  cardHeaderContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  amountsGrid: { flexDirection: "row", gap: 12 },
  amountItem: { flex: 1, borderRadius: 12, padding: 12 },
  amountLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  amountValue: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  responsibilityBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#bfdbfe" },
  responsibilityLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  responsibilityLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  responsibilityAmount: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
