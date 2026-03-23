import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
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
import { api, type LabResult } from "@/lib/api";

const C = Colors.light;

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return null; }
}

function ResultItem({ r }: { r: { name: string; value: string; unit?: string; referenceRange?: string; flag?: string } }) {
  const isAbnormal = r.flag && r.flag !== "normal" && r.flag !== "";
  return (
    <View style={[styles.resultItem, isAbnormal && styles.resultItemAbnormal]}>
      <View style={styles.resultLeft}>
        <Text style={styles.resultName}>{r.name}</Text>
        {r.referenceRange ? <Text style={styles.resultRange}>Ref: {r.referenceRange}</Text> : null}
      </View>
      <View style={styles.resultRight}>
        <Text style={[styles.resultValue, isAbnormal && { color: C.danger }]}>
          {r.value}{r.unit ? ` ${r.unit}` : ""}
        </Text>
        {isAbnormal ? (
          <View style={styles.flagBadge}>
            <Text style={styles.flagText}>{r.flag}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function LabCard({ item, index }: { item: LabResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const date = formatDate(item.resultDate);
  const hasResults = item.results && item.results.length > 0;

  return (
    <View style={styles.card} testID={`card-lab-${index}`}>
      <Pressable
        style={styles.cardHeader}
        onPress={() => hasResults && setExpanded(!expanded)}
      >
        <View style={styles.iconWrap}>
          <Feather name="bar-chart-2" size={20} color="#059669" />
        </View>
        <View style={styles.cardHeaderContent}>
          <Text style={styles.cardTitle} testID={`text-test-name-${index}`}>
            {item.testName || "Lab Test"}
          </Text>
          <View style={styles.badgeRow}>
            <StatusBadge label={item.status || "Unknown"} />
            {item.category ? (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{item.category}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {hasResults ? (
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={C.textTertiary} />
        ) : null}
      </Pressable>

      <View style={styles.meta}>
        {date ? (
          <View style={styles.metaItem}>
            <Feather name="calendar" size={13} color={C.textTertiary} />
            <Text style={styles.metaText} testID={`text-result-date-${index}`}>{date}</Text>
          </View>
        ) : null}
        {item.orderingProvider ? (
          <View style={styles.metaItem}>
            <Feather name="user" size={13} color={C.textTertiary} />
            <Text style={styles.metaText}>{item.orderingProvider}</Text>
          </View>
        ) : null}
      </View>

      {expanded && hasResults ? (
        <View style={styles.resultsList}>
          {item.results!.map((r, i) => (
            <ResultItem key={i} r={r} />
          ))}
        </View>
      ) : null}

      {hasResults && !expanded ? (
        <Pressable style={styles.viewResultsBtn} onPress={() => setExpanded(true)}>
          <Text style={styles.viewResultsText}>View {item.results!.length} result{item.results!.length !== 1 ? "s" : ""}</Text>
          <Feather name="chevron-down" size={14} color={C.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Feather name="bar-chart-2" size={32} color={C.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Lab Results</Text>
      <Text style={styles.emptyText}>Your lab test results will appear here.</Text>
    </View>
  );
}

export default function LabResultsScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["lab-results"],
    queryFn: () => api.getLabResults(),
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Lab Results" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Lab Results" />
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
      <ScreenHeader title="Lab Results" subtitle={data && data.length > 0 ? `${data.length} test${data.length !== 1 ? "s" : ""}` : undefined} />
      <FlatList
        data={data || []}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => <LabCard item={item} index={index} />}
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
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, paddingBottom: 0 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: "#d1fae5",
    alignItems: "center", justifyContent: "center",
  },
  cardHeaderContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.text },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  categoryBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: C.surfaceSecondary, borderRadius: 6, borderWidth: 1, borderColor: C.border,
  },
  categoryText: { fontSize: 11, fontFamily: "Inter_500Medium", color: C.textSecondary },
  meta: { flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.textSecondary },
  resultsList: { borderTopWidth: 1, borderTopColor: C.borderLight },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  resultItemAbnormal: { backgroundColor: "#fff7f7" },
  resultLeft: { flex: 1 },
  resultName: { fontSize: 14, fontFamily: "Inter_500Medium", color: C.text },
  resultRange: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.textTertiary, marginTop: 2 },
  resultRight: { alignItems: "flex-end", gap: 4 },
  resultValue: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.text },
  flagBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: C.dangerLight, borderRadius: 6,
  },
  flagText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: C.danger, textTransform: "capitalize" },
  viewResultsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
  viewResultsText: { fontSize: 14, fontFamily: "Inter_500Medium", color: C.primary },
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
