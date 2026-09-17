import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AccessiblePressable as Pressable } from "@/components/AccessiblePressable";
import { AnimatedCard } from "@/components/AnimatedCard";
import { ScreenHeader } from "@/components/ScreenHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { useEHR } from "@/context/EHRContext";
import { useTheme } from "@/context/ThemeContext";
import {
  INSURANCE_HISTORY_PAGE_SIZE,
  INSURER_PAID_EXPLANATION,
  type InsuranceFilingType,
  type InsuranceHistoryItem,
  type InsuranceHistoryPage,
} from "@/lib/insuranceHistory";
import {
  clearOtherInsuranceHistoryQueries,
  insuranceHistoryAccountKey,
  insuranceHistoryQueryKey,
} from "@/lib/insuranceHistoryQueries";
import { insuranceHistoryNavigation } from "@/lib/insuranceHistoryPagination";
import { api } from "@/lib/api";
import {
  PRODUCTION_FEATURE_UNAVAILABLE_MESSAGE,
  restrictedProductionFeaturesEnabled,
} from "@/lib/productionFeatures";

type CategoryState = {
  offset: number;
  previousOffsets: number[];
};

const INITIAL_CATEGORY_STATE: Record<InsuranceFilingType, CategoryState> = {
  medical_treatment: { offset: 0, previousOffsets: [] },
  medication: { offset: 0, previousOffsets: [] },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAmount(value: string | null): string {
  return value === null ? "Not recorded" : `$${value}`;
}

function Amount({
  label,
  value,
  colors,
}: {
  label: string;
  value: string | null;
  colors: any;
}) {
  return (
    <View style={[styles.amount, { backgroundColor: colors.surfaceSecondary }]}>
      <Text style={[styles.amountLabel, { color: colors.textTertiary }]}>{label}</Text>
      <Text
        style={[
          styles.amountValue,
          { color: value === null ? colors.textTertiary : colors.text },
        ]}
        accessibilityLabel={`${label}: ${formatAmount(value)}`}
      >
        {formatAmount(value)}
      </Text>
    </View>
  );
}

function FilingCard({
  item,
  index,
  colors,
}: {
  item: InsuranceHistoryItem;
  index: number;
  colors: any;
}) {
  return (
    <AnimatedCard index={index + 1}>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.borderLight },
        ]}
        testID={`card-insurance-filing-${item.filingId}`}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
            <Feather name="file-text" size={19} color={colors.primary} />
          </View>
          <View style={styles.cardTitleContent}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {item.filingType === "medical_treatment"
                ? "Medical treatment"
                : "Medication"}
            </Text>
            <Text style={[styles.date, { color: colors.textSecondary }]}>
              {formatDate(item.date)}
            </Text>
          </View>
          <StatusBadge label={item.status} />
        </View>
        <View style={styles.amounts}>
          <Amount label="Billed" value={item.amounts.billed} colors={colors} />
          <Amount label="Approved" value={item.amounts.approved} colors={colors} />
          <Amount label="Insurer paid" value={item.amounts.paid} colors={colors} />
        </View>
        <Text style={[styles.filingId, { color: colors.textTertiary }]}>
          Filing {item.filingId}
        </Text>
      </View>
    </AnimatedCard>
  );
}

function EmptyCategory({
  filingType,
  colors,
}: {
  filingType: InsuranceFilingType;
  colors: any;
}) {
  return (
    <View style={styles.emptyCategory}>
      <Feather name="inbox" size={28} color={colors.textTertiary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        No {filingType === "medical_treatment" ? "medical treatment" : "medication"} filings
      </Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        New insurance filings will appear here when they are available.
      </Text>
    </View>
  );
}

function ErrorCategory({
  error,
  onRetry,
  colors,
}: {
  error: unknown;
  onRetry: () => void;
  colors: any;
}) {
  return (
    <View style={styles.emptyCategory}>
      <Feather name="wifi-off" size={28} color={colors.textTertiary} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Unable to load history</Text>
      <Text accessibilityRole="alert" style={[styles.emptyText, { color: colors.textSecondary }]}>
        {error instanceof Error ? error.message : "Please try again."}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry insurance history"
        onPress={onRetry}
        style={[styles.retryButton, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.retryText, { color: colors.onPrimary }]}>Try again</Text>
      </Pressable>
    </View>
  );
}

function CategorySection({
  title,
  filingType,
  page,
  isLoading,
  isFetching,
  error,
  onRetry,
  categoryState,
  onNext,
  onPrevious,
  colors,
}: {
  title: string;
  filingType: InsuranceFilingType;
  page: InsuranceHistoryPage | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
  categoryState: CategoryState;
  onNext: (offset: number) => void;
  onPrevious: () => void;
  colors: any;
}) {
  const navigation = insuranceHistoryNavigation(page, categoryState.previousOffsets.length);
  const showPagination = navigation.showPrevious || navigation.showNext;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>
            {title}
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            {page ? `${page.items.length} filing${page.items.length === 1 ? "" : "s"}` : "Patient filings"}
          </Text>
        </View>
        {isFetching && !isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
      {isLoading ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Loading insurance history"
          aria-busy={true}
          style={styles.loadingCategory}
        >
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Loading filings…</Text>
        </View>
      ) : error ? (
        <ErrorCategory error={error} onRetry={onRetry} colors={colors} />
      ) : (
        <>
          {page?.items.length ? (
            page.items.map((item, index) => (
              <FilingCard key={item.filingId} item={item} index={index} colors={colors} />
            ))
          ) : (
            <EmptyCategory filingType={filingType} colors={colors} />
          )}
          {showPagination ? (
            <View style={styles.pagination}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Previous ${title} page`}
                disabled={!navigation.showPrevious}
                onPress={onPrevious}
                style={[
                  styles.pageButton,
                  { borderColor: colors.controlBorder },
                  !navigation.showPrevious && styles.disabled,
                ]}
              >
                <Feather name="chevron-left" size={17} color={colors.primary} />
                <Text style={[styles.pageButtonText, { color: colors.primary }]}>Previous</Text>
              </Pressable>
              {navigation.showNext ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Next ${title} page`}
                  onPress={() => onNext(navigation.nextOffset!)}
                  style={[styles.pageButton, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.pageButtonText, { color: colors.onPrimary }]}>Next</Text>
                  <Feather name="chevron-right" size={17} color={colors.onPrimary} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

export default function InsuranceHistoryScreen() {
  const { profile } = useAuth();
  const { adapter } = useEHR();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const featureEnabled = restrictedProductionFeaturesEnabled();
  const accountKey = useMemo(
    () => insuranceHistoryAccountKey(profile, adapter),
    [adapter, profile],
  );
  const [categoryState, setCategoryState] =
    useState<Record<InsuranceFilingType, CategoryState>>(INITIAL_CATEGORY_STATE);
  const unavailableForProvider = !featureEnabled || Boolean(adapter && !adapter.getInsuranceHistory);

  useEffect(() => {
    clearOtherInsuranceHistoryQueries(queryClient, accountKey);
    setCategoryState(INITIAL_CATEGORY_STATE);
  }, [accountKey, queryClient]);

  const medicalQuery = useQuery({
    queryKey: insuranceHistoryQueryKey(
      accountKey ?? "no-session",
      "medical_treatment",
      INSURANCE_HISTORY_PAGE_SIZE,
      categoryState.medical_treatment.offset,
    ),
    queryFn: () =>
      api.getInsuranceHistory({
        filingType: "medical_treatment",
        limit: INSURANCE_HISTORY_PAGE_SIZE,
        offset: categoryState.medical_treatment.offset,
      }),
    enabled: featureEnabled && Boolean(accountKey) && !unavailableForProvider,
  });
  const medicationQuery = useQuery({
    queryKey: insuranceHistoryQueryKey(
      accountKey ?? "no-session",
      "medication",
      INSURANCE_HISTORY_PAGE_SIZE,
      categoryState.medication.offset,
    ),
    queryFn: () =>
      api.getInsuranceHistory({
        filingType: "medication",
        limit: INSURANCE_HISTORY_PAGE_SIZE,
        offset: categoryState.medication.offset,
      }),
    enabled: featureEnabled && Boolean(accountKey) && !unavailableForProvider,
  });

  const updateCategory = (filingType: InsuranceFilingType, offset: number) => {
    setCategoryState((current) => ({
      ...current,
      [filingType]: {
        offset,
        previousOffsets: [
          ...current[filingType].previousOffsets,
          current[filingType].offset,
        ],
      },
    }));
  };
  const previousCategory = (filingType: InsuranceFilingType) => {
    setCategoryState((current) => {
      const history = [...current[filingType].previousOffsets];
      const offset = history.pop();
      if (offset === undefined) return current;
      return {
        ...current,
        [filingType]: { offset, previousOffsets: history },
      };
    });
  };

  const noSession = !profile || !accountKey;
  const isInitialLoading = medicalQuery.isLoading && medicationQuery.isLoading;
  const isRefreshing = medicalQuery.isFetching || medicationQuery.isFetching;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Insurance History" subtitle="Read-only patient filings" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            accessibilityLabel="Refresh insurance history"
            refreshing={isRefreshing && !isInitialLoading}
            onRefresh={() => {
              void Promise.all([medicalQuery.refetch(), medicationQuery.refetch()]);
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={[styles.notice, { backgroundColor: colors.notice, borderColor: colors.noticeBorder }]}>
          <Feather name="info" size={18} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
            {INSURER_PAID_EXPLANATION}
          </Text>
        </View>
        {unavailableForProvider || noSession ? (
          <View style={styles.unavailable}>
            <Feather name="shield" size={32} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {!featureEnabled
                ? "Insurance history is unavailable"
                : noSession
                  ? "Sign in to view insurance history"
                  : "Insurance history is unavailable"}
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {!featureEnabled
                ? PRODUCTION_FEATURE_UNAVAILABLE_MESSAGE
                : noSession
                ? "Only the signed-in patient can access these filings."
                : "This provider does not expose the CARNET insurance-history service."}
            </Text>
          </View>
        ) : isInitialLoading ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Loading insurance history"
            aria-busy={true}
            style={styles.initialLoading}
          >
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Loading insurance history…</Text>
          </View>
        ) : (
          <>
            <CategorySection
              title="Medical treatment"
              filingType="medical_treatment"
              page={medicalQuery.data}
              isLoading={medicalQuery.isLoading}
              isFetching={medicalQuery.isFetching}
              error={medicalQuery.error}
              onRetry={() => void medicalQuery.refetch()}
              categoryState={categoryState.medical_treatment}
              onNext={(offset) => updateCategory("medical_treatment", offset)}
              onPrevious={() => previousCategory("medical_treatment")}
              colors={colors}
            />
            <CategorySection
              title="Medication"
              filingType="medication"
              page={medicationQuery.data}
              isLoading={medicationQuery.isLoading}
              isFetching={medicationQuery.isFetching}
              error={medicationQuery.error}
              onRetry={() => void medicationQuery.refetch()}
              categoryState={categoryState.medication}
              onNext={(offset) => updateCategory("medication", offset)}
              onPrevious={() => previousCategory("medication")}
              colors={colors}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 42, gap: 22 },
  notice: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    gap: 9,
    alignItems: "flex-start",
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19, fontFamily: "Inter_500Medium" },
  section: { gap: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 21, fontFamily: "Inter_700Bold" },
  sectionSubtitle: { fontSize: 13, marginTop: 2 },
  loadingCategory: { minHeight: 130, alignItems: "center", justifyContent: "center", gap: 9 },
  initialLoading: { minHeight: 280, alignItems: "center", justifyContent: "center", gap: 12 },
  unavailable: { minHeight: 230, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    gap: 13,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardTitleContent: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  date: { fontSize: 12 },
  amounts: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  amount: { flex: 1, minWidth: 95, borderRadius: 11, padding: 10, gap: 4 },
  amountLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  amountValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  filingId: { fontSize: 10, fontFamily: "Inter_400Regular" },
  emptyCategory: { minHeight: 150, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 17, textAlign: "center", fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  retryButton: { minHeight: 44, borderRadius: 11, paddingHorizontal: 18, justifyContent: "center", marginTop: 4 },
  retryText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  pagination: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  pageButton: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  pageButtonText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  disabled: { opacity: 0.4 },
});