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
import { ScreenHeader } from "@/components/ScreenHeader";
import { SearchBar } from "@/components/SearchBar";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { StatusBadge } from "@/components/StatusBadge";
import { useTheme } from "@/context/ThemeContext";
import { api, type VisitSummary } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function formatDate(dateStr?: string) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function VitalItem({ label, value, icon, colors }: { label: string; value: string; icon: React.ComponentProps<typeof Feather>["name"]; colors: any }) {
  if (!value) return null;
  return (
    <View style={[styles.vitalItem, { backgroundColor: colors.surfaceSecondary }]}>
      <Feather name={icon} size={14} color={colors.primary} />
      <View>
        <Text style={[styles.vitalLabel, { color: colors.textTertiary }]}>{label}</Text>
        <Text style={[styles.vitalValue, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function SummaryCard({ item, index, colors }: { item: VisitSummary; index: number; colors: any }) {
  const { t } = useI18n();
  const visitType = (item.visitType || "Office Visit").replace(/_/g, " ");
  const date = formatDate(item.visitDate);
  const provider = item.doctorName || item.provider || "";
  const hospital = item.hospitalName || "";

  return (
    <AnimatedCard index={index}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
            <Feather name="file-text" size={20} color={colors.primary} />
          </View>
          <View style={styles.cardHeaderContent}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{visitType}</Text>
            {item.status ? <StatusBadge label={item.status} /> : null}
          </View>
        </View>

        {date ? (
          <View style={styles.detailItem}>
            <Feather name="calendar" size={14} color={colors.textTertiary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>{date}</Text>
          </View>
        ) : null}

        {provider ? (
          <View style={styles.detailItem}>
            <Feather name="user" size={14} color={colors.textTertiary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>Dr. {provider}</Text>
          </View>
        ) : null}

        {hospital ? (
          <View style={styles.detailItem}>
            <Feather name="home" size={14} color={colors.textTertiary} />
            <Text style={[styles.detailText, { color: colors.textSecondary }]}>{hospital}</Text>
          </View>
        ) : null}

        {item.diagnosis ? (
          <View style={[styles.diagnosisBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.borderLight }]}>
            <Text style={[styles.diagnosisLabel, { color: colors.textTertiary }]}>{t("diagnosis")}</Text>
            <Text style={[styles.diagnosisText, { color: colors.text }]}>{item.diagnosis}</Text>
          </View>
        ) : null}

        {item.summary ? (
          <View style={styles.summarySection}>
            <Text style={[styles.summaryLabel, { color: colors.textTertiary }]}>{t("summary")}</Text>
            <Text style={[styles.summaryText, { color: colors.textSecondary }]}>{item.summary}</Text>
          </View>
        ) : null}

        {item.vitals ? (
          <View style={styles.vitalsGrid}>
            {item.vitals.bloodPressure ? <VitalItem label={t("bloodPressure")} value={item.vitals.bloodPressure} icon="activity" colors={colors} /> : null}
            {item.vitals.heartRate ? <VitalItem label={t("heartRate")} value={item.vitals.heartRate} icon="heart" colors={colors} /> : null}
            {item.vitals.temperature ? <VitalItem label={t("temperature")} value={item.vitals.temperature} icon="thermometer" colors={colors} /> : null}
            {item.vitals.weight ? <VitalItem label={t("weight")} value={item.vitals.weight} icon="trending-up" colors={colors} /> : null}
          </View>
        ) : null}

        {item.followUpDate ? (
          <View style={[styles.followUp, { backgroundColor: colors.primaryLight }]}>
            <Feather name="calendar" size={14} color={colors.primary} />
            <Text style={[styles.followUpText, { color: colors.primary }]}>
              {t("followUp")}: {formatDate(item.followUpDate)}
            </Text>
          </View>
        ) : null}

        {item.followUpInstructions ? (
          <View style={styles.summarySection}>
            <Text style={[styles.summaryLabel, { color: colors.textTertiary }]}>{t("followUpInstructions")}</Text>
            <Text style={[styles.summaryText, { color: colors.textSecondary }]}>{item.followUpInstructions}</Text>
          </View>
        ) : null}

        {item.notes ? (
          <View style={styles.summarySection}>
            <Text style={[styles.summaryLabel, { color: colors.textTertiary }]}>{t("notes")}</Text>
            <Text style={[styles.summaryText, { color: colors.textSecondary }]}>{item.notes}</Text>
          </View>
        ) : null}
      </View>
    </AnimatedCard>
  );
}

export default function VisitSummariesScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [search, setSearch] = useState("");

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["visit-summaries"],
    queryFn: () => api.getVisitSummaries(),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (v) =>
        v.visitType?.toLowerCase().includes(q) ||
        v.provider?.toLowerCase().includes(q) ||
        v.doctorName?.toLowerCase().includes(q) ||
        v.diagnosis?.toLowerCase().includes(q) ||
        v.summary?.toLowerCase().includes(q) ||
        v.hospitalName?.toLowerCase().includes(q)
    );
  }, [data, search]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("visitSummaries")} />
        <ListSkeleton />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("visitSummaries")} />
        <View style={styles.centered}>
          <Feather name="wifi-off" size={36} color={colors.textTertiary} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>{t("unableToLoad")}</Text>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{(error as Error).message}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t("visitSummaries")}
        subtitle={data && data.length > 0 ? `${data.length} visits` : undefined}
      />
      <FlatList
        data={filtered}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => <SummaryCard item={item} index={index} colors={colors} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          data && data.length > 1 ? (
            <SearchBar value={search} onChangeText={setSearch} placeholder={t("searchVisits")} />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}>
              <Feather name="file-text" size={32} color={colors.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("noVisitSummaries")}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t("visitSummariesEmpty")}
            </Text>
          </View>
        }
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
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  cardHeaderContent: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  detailItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  diagnosisBox: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 4,
  },
  diagnosisLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  diagnosisText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  summarySection: { gap: 4 },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  vitalsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  vitalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: "45%",
  },
  vitalLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  vitalValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  followUp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  followUpText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  errorTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
