import type { QueryClient } from "@tanstack/react-query";
import type { EHRAdapter } from "@/lib/ehr/types";
import type { InsuranceFilingType } from "./insuranceHistory";
import type { Profile } from "./api";

export const INSURANCE_HISTORY_QUERY_PREFIX = ["insurance-history"] as const;

/**
 * Use only server-validated patient/tenant identity and provider session
 * metadata in the query key. Display names and email addresses are not identity
 * boundaries and are deliberately excluded.
 */
export function insuranceHistoryAccountKey(
  profile: Profile | null,
  adapter: EHRAdapter | null,
): string | null {
  if (!profile) return null;
  const patientId = profile.patientId ?? profile.patient?.id ?? profile.id;
  if (!patientId || typeof patientId !== "string" || !patientId.trim()) return null;
  const tenantId = profile.tenantId ?? profile.patient?.tenantId ?? profile.tenant?.id ?? "unknown";
  return `${adapter?.sessionKey ?? "direct-navimedi"}|${tenantId}|${patientId}`;
}

export function insuranceHistoryQueryKey(
  accountKey: string,
  filingType: InsuranceFilingType,
  limit: number,
  offset: number,
): readonly [string, string, InsuranceFilingType, number, number] {
  return [...INSURANCE_HISTORY_QUERY_PREFIX, accountKey, filingType, limit, offset];
}

export function clearOtherInsuranceHistoryQueries(
  queryClient: QueryClient,
  accountKey: string | null,
): void {
  queryClient.removeQueries({
    predicate: (query) =>
      query.queryKey[0] === INSURANCE_HISTORY_QUERY_PREFIX[0] &&
      queryKeyAccount(query.queryKey) !== accountKey,
  });
}

function queryKeyAccount(queryKey: readonly unknown[]): string | null {
  return typeof queryKey[1] === "string" ? queryKey[1] : null;
}
