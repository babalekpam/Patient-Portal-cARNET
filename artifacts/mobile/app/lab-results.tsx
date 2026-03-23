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
import { api, type LabResult } from "@/lib/api";

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return null; }
}

function ResultItem({ r, colors }: { r: { name: string; value: string; unit?: string; referenceRange?: string; flag?: string }; colors: any }) {
  const isAbnormal = r.flag && r.flag !== "normal" && r.flag !== "";
  return (
    <View style={[styles.resultItem, { borderBottomColor: colors.borderLight }, isAbnormal && { backgroundColor: colors.dangerLight }]}>
      <View style={styles.resultLeft}>
        <Text style={[styles.resultName, { color: colors.text }]}>{r.name}</Text>
        {r.referenceRange ? <Text style={[styles.resultRange, { color: colors.textTertiary }]}>Ref: {r.referenceRange}</Text> : null}
      </View>
      <View style={styles.resultRight}>
        <Text style={[styles.resultValue, { color: isAbnormal ? colors.danger : colors.text }]}>
          {r.value}{r.unit ? ` ${r.unit}` : ""}
        </Text>
        {isAbnormal ? (
          <View style={[styles.flagBadge, { backgroundColor: colors.dangerLight }]}>
            <Text style={[styles.flagText, { color: colors.danger }]}>{r.flag}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function LabCard({ item, index, colors }: { item: LabResult; index: number; colors: any }) {
  const [expanded, setExpanded] = useState(false);
  const date = formatDate(item.resultDate);
  const hasResults = item.results && item.results.length > 0;

  return (
    <AnimatedCard index={index}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]} testID={`card-lab-${index}`}>
        <Pressable style={styles.cardHeader} onPress={() => hasResults && setExpanded(!expanded)}>
          <View style={styles.iconWrap}>
            <Feather name="bar-chart-2" size={20} color="#059669" />
          </View>
          <View style={styles.cardHeaderContent}>
            <Text style={[styles.cardTitle, { color: colors.text }]} testID={`text-test-name-${index}`}>
              {item.testName || "Lab Test"}
            </Text>
            <View style={styles.badgeRow}>
              <StatusBadge label={item.status || "Unknown"} />
              {item.category ? (
                <View style={[styles.categoryBadge, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <Text style={[styles.categoryText, { color: colors.textSecondary }]}>{item.category}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {hasResults ? <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textTertiary} /> : null}
        </Pressable>
        <View style={styles.meta}>
          {date ? (
            <View style={styles.metaItem}>
              <Feather name="calendar" size={13} color={colors.textTertiary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]} testID={`text-result-date-${index}`}>{date}</Text>
            </View>
          ) : null}
          {item.orderingProvider ? (
            <View style={styles.metaItem}>
              <Feather name="user" size={13} color={colors.textTertiary} />
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{item.orderingProvider}</Text>
            </View>
          ) : null}
        </View>
        {expanded && hasResults ? (
          <View style={[styles.resultsList, { borderTopColor: colors.borderLight }]}>
            {item.results!.map((r, i) => <ResultItem key={i} r={r} colors={colors} />)}
          </View>
        ) : null}
        {hasResults && !expanded ? (
          <Pressable style={[styles.viewResultsBtn, { borderTopColor: colors.borderLight }]} onPress={() => setExpanded(true)}>
            <Text style={[styles.viewResultsText, { color: colors.primary }]}>View {item.results!.length} result{item.results!.length !== 1 ? "s" : ""}</Text>
            <Feather name="chevron-down" size={14} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
    </AnimatedCard>
  );
}

function EmptyState({ colors }: { colors: any }) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}>
        <Feather name="bar-chart-2" size={32} color={colors.textTertiary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No Lab Results</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Your lab test results will appear here.</Text>
    </View>
  );
}

export default function LabResultsScreen() {
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["lab-results"],
    queryFn: () => api.getLabResults(),
  });

  const filtered = data?.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.testName?.toLowerCase().includes(q) ||
      l.category?.toLowerCase().includes(q) ||
      l.orderingProvider?.toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Lab Results" />
        <ListSkeleton />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Lab Results" />
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
      <ScreenHeader title="Lab Results" subtitle={data && data.length > 0 ? `${data.length} test${data.length !== 1 ? "s" : ""}` : undefined} />
      <FlatList
        data={filtered || []}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => <LabCard item={item} index={index} colors={colors} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={data && data.length > 1 ? <SearchBar value={search} onChangeText={setSearch} placeholder="Search lab results..." /> : null}
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
  card: { borderRadius: 16, overflow: "hidden", borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, paddingBottom: 0 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#d1fae5", alignItems: "center", justifyContent: "center" },
  cardHeaderContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  categoryText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  meta: { flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  resultsList: { borderTopWidth: 1 },
  resultItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  resultLeft: { flex: 1 },
  resultName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  resultRange: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  resultRight: { alignItems: "flex-end", gap: 4 },
  resultValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  flagBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  flagText: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  viewResultsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, padding: 12, borderTopWidth: 1 },
  viewResultsText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
