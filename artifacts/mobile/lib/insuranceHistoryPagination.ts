import type { InsuranceHistoryPage } from "./insuranceHistory";

export type InsuranceHistoryNavigation = {
  showPrevious: boolean;
  showNext: boolean;
  nextOffset: number | null;
};

/**
 * Pagination controls are based on the server cursor and local page history,
 * not on whether the current page happens to contain filings. An empty page
 * can be an intermediate page and must still offer a way back or forward.
 */
export function insuranceHistoryNavigation(
  page: InsuranceHistoryPage | undefined,
  previousPageCount: number,
): InsuranceHistoryNavigation {
  const showPrevious = previousPageCount > 0;
  const nextOffset =
    page?.pagination.hasMore && page.pagination.nextOffset !== null
      ? page.pagination.nextOffset
      : null;
  return {
    showPrevious,
    showNext: nextOffset !== null,
    nextOffset,
  };
}
