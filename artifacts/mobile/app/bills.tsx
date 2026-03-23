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
import { api, type Bill } from "@/lib/api";

const C = Colors.light;

function formatCurrency(amount?: number) {
  if (amount === undefined || amount === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return null; }
}

function BillCard({ item, index }: { item: Bill; index: number }) {
  const serviceDate = formatDate(item.serviceDate);
  const billDate = formatDate(item.billDate);

  return (
    <View style={styles.card} testID={`card-bill-${index}`}>
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <Feather name="credit-card" size={20} color="#d97706" />
        </View>
        <View style={styles.cardHeaderContent}>
          <Text style={styles.cardTitle}>{item.description || "Medical Bill"}</Text>
          <StatusBadge label={item.status || "Unknown"} />
        </View>
      </View>

      {serviceDate ? (
        <View style={styles.metaItem}>
          <Feather name="calendar" size={13} color={C.textTertiary} />
          <Text style={styles.metaText} testID={`text-service-date-${index}`}>Service: {serviceDate}</Text>
        </View>
      ) : null}

      <View style={styles.amountsGrid}>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Total Charges</Text>
          <Text style={styles.amountValue} testID={`text-total-charges-${index}`}>{formatCurrency(item.totalCharges)}</Text>
        </View>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Insurance Paid</Text>
          <Text style={[styles.amountValue, { color: C.success }]} testID={`text-insurance-paid-${index}`}>
            {formatCurrency(item.insurancePaid)}
          </Text>
        </View>
      </View>

      <View style={styles.responsibilityBox}>
        <View style={styles.responsibilityLeft}>
          <Feather name="dollar-sign" size={16} color={C.primary} />
          <Text style={styles.responsibilityLabel}>Your Responsibility</Text>
        </View>
        <Text style={styles.responsibilityAmount} testID={`text-patient-responsibility-${index}`}>
          {formatCurrency(item.patientResponsibility)}
        </Text>
      </View>
    </View>
  );
}

function SummaryCard({ data }: { data: Bill[] }) {
  const totalOwed = data.reduce((sum, b) => sum + (b.patientResponsibility || 0), 0);
  const unpaidCount = data.filter((b) => b.status?.toLowerCase() !== "paid").length;
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Total Due</Text>
        <Text style={styles.summaryAmount}>{formatCurrency(totalOwed)}</Text>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.summaryItem}>
        <Text style={styles.summaryLabel}>Unpaid Bills</Text>
        <Text style={[styles.summaryAmount, unpaidCount > 0 && { color: C.warning }]}>{unpaidCount}</Text>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Feather name="credit-card" size={32} color={C.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Bills</Text>
      <Text style={styles.emptyText}>Your billing statements will appear here.</Text>
    </View>
  );
}

export default function BillsScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["bills"],
    queryFn: () => api.getBills(),
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Bills & Payments" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Bills & Payments" />
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

  const bills = data || [];

  return (
    <View style={styles.container}>
      <ScreenHeader title="Bills & Payments" />
      <FlatList
        data={bills}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => <BillCard item={item} index={index} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={bills.length > 0 ? <SummaryCard data={bills} /> : null}
        ListEmptyComponent={<EmptyState />}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.primary} />}
        scrollEnabled={!!(bills.length > 0)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  listContent: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  summaryCard: {
    backgroundColor: C.primary,
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    marginBottom: 4,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.75)", marginBottom: 4 },
  summaryAmount: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#fff" },
  summaryDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
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
    width: 44, height: 44, borderRadius: 12, backgroundColor: "#fef3c7",
    alignItems: "center", justifyContent: "center",
  },
  cardHeaderContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.text },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.textSecondary },
  amountsGrid: { flexDirection: "row", gap: 12 },
  amountItem: { flex: 1, backgroundColor: C.surfaceSecondary, borderRadius: 12, padding: 12 },
  amountLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.textTertiary, marginBottom: 4 },
  amountValue: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.text },
  responsibilityBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.primaryLight,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  responsibilityLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  responsibilityLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: C.primary },
  responsibilityAmount: { fontSize: 20, fontFamily: "Inter_700Bold", color: C.primary },
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
