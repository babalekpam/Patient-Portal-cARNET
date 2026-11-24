import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ListSkeleton } from "@/components/SkeletonLoader";
import { StatusBadge } from "@/components/StatusBadge";
import { LogoWatermark } from "@/components/LogoWatermark";
import { useTheme } from "@/context/ThemeContext";
import { api, type CommunityHealthRecord } from "@/lib/api";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";

/**
 * What a community health worker recorded about this patient, once the
 * patient's hospital has checked and accepted it. Entries the hospital has not
 * accepted are never sent to this screen.
 */

const TYPE_KEY: Record<string, TranslationKey> = {
  screening: "communityHealthScreening",
  referral: "communityHealthReferral",
  patient: "communityHealthRegistration",
};

const TYPE_ICON: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  screening: "activity",
  referral: "send",
  patient: "user-check",
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function readable(value?: string | null) {
  return value ? value.replace(/_/g, " ") : "";
}

function Line({ label, value, colors }: { label: string; value: string; colors: any }) {
  if (!value) return null;
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[styles.lineValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function RecordCard({ item, index, colors }: { item: CommunityHealthRecord; index: number; colors: any }) {
  const { t } = useI18n();
  const title = TYPE_KEY[item.entryType] ? t(TYPE_KEY[item.entryType]) : readable(item.entryType);
  const date = formatDate(item.recordedAt ?? item.reviewedAt);
  const detail = item.entryType === "screening" ? readable(item.protocol) : item.reason ?? "";

  return (
    <AnimatedCard index={index}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
            <Feather name={TYPE_ICON[item.entryType] ?? "file-text"} size={20} color={colors.primary} />
          </View>
          <View style={styles.cardHeaderContent}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
            {date ? <Text style={[styles.date, { color: colors.textSecondary }]}>{date}</Text> : null}
          </View>
        </View>

        {detail ? <Text style={[styles.detail, { color: colors.text }]}>{detail}</Text> : null}

        <Line label={t("communityHealthResult")} value={readable(item.result)} colors={colors} />
        <Line label={t("communityHealthAdvice")} value={item.recommendation ?? ""} colors={colors} />

        {item.entryType === "referral" && item.referralStatus ? (
          <View style={styles.statusRow}>
            <Text style={[styles.lineLabel, { color: colors.textTertiary }]}>{t("communityHealthReferralStatus")}</Text>
            <StatusBadge label={readable(item.referralStatus)} />
          </View>
        ) : null}

        <View style={[styles.footer, { borderTopColor: colors.borderLight }]}>
          {item.chwName ? (
            <View style={styles.footerItem}>
              <Feather name="user" size={13} color={colors.textTertiary} />
              <Text style={[styles.footerText, { color: colors.textSecondary }]}>{t("communityHealthVisitBy", { name: item.chwName })}</Text>
            </View>
          ) : null}
          {item.reviewedBy ? (
            <View style={styles.footerItem}>
              <Feather name="check-circle" size={13} color={colors.textTertiary} />
              <Text style={[styles.footerText, { color: colors.textSecondary }]}>{t("communityHealthCheckedBy", { name: item.reviewedBy })}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </AnimatedCard>
  );
}

export default function CommunityHealthScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const a11y = useAccessibilityLabels();

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["community-health"],
    queryFn: () => api.getCommunityHealth(),
  });

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("communityHealth")} />
        <View accessibilityRole="progressbar" accessibilityLabel={a11y.loading} aria-busy={true}><ListSkeleton /></View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title={t("communityHealth")} />
        <View style={styles.centered}>
          <Feather name="wifi-off" size={36} color={colors.textTertiary} />
          <Text accessibilityRole="header" style={[styles.emptyTitle, { color: colors.text }]}>{t("unableToLoad")}</Text>
          <Text accessibilityRole="alert" aria-live="assertive" style={[styles.emptyText, { color: colors.textSecondary }]}>{(error as Error).message}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title={t("communityHealth")} />
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <RecordCard item={item} index={index} colors={colors} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Feather name="home" size={36} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("communityHealthEmpty")}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardHeaderContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  date: { fontSize: 13, marginTop: 2 },
  detail: { fontSize: 15, textTransform: "capitalize" },
  line: { gap: 2 },
  lineLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  lineValue: { fontSize: 15, lineHeight: 21 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  footer: { borderTopWidth: 1, paddingTop: 10, gap: 6 },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { fontSize: 13, flex: 1 },
  centered: { alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "700" },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
