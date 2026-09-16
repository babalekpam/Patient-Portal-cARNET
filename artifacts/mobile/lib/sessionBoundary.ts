import type { QueryClient } from "@tanstack/react-query";
import { clearInsuranceHistoryCache } from "./insuranceHistoryCache";
import { INSURANCE_HISTORY_QUERY_PREFIX } from "./insuranceHistoryQueries";

/**
 * Starts the local protected-session boundary without touching the captured
 * bearer. Remote revocation can therefore continue with the old adapter while
 * React Query and the history cache are already unable to expose old patient
 * data.
 */
export function beginProtectedSessionTermination(
  queryClient: Pick<QueryClient, "cancelQueries" | "removeQueries">,
  invalidateSession: () => void,
): void {
  clearInsuranceHistoryCache();
  void queryClient
    .cancelQueries({ queryKey: INSURANCE_HISTORY_QUERY_PREFIX })
    .catch(() => {});
  queryClient.removeQueries({ queryKey: INSURANCE_HISTORY_QUERY_PREFIX });
  invalidateSession();
}
