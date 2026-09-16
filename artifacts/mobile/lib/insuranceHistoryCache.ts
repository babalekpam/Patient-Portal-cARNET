import type { InsuranceFilingType, InsuranceHistoryPage } from "./insuranceHistory";

type CacheEntry = {
  generation: number;
  page: InsuranceHistoryPage;
};

const pages = new Map<string, CacheEntry>();

function key(
  generation: number,
  sessionKey: string,
  filingType: InsuranceFilingType | undefined,
  limit: number,
  offset: number,
): string {
  return JSON.stringify([generation, sessionKey, filingType ?? "all", limit, offset]);
}

export function getInsuranceHistoryPage(
  generation: number,
  sessionKey: string,
  filingType: InsuranceFilingType | undefined,
  limit: number,
  offset: number,
): InsuranceHistoryPage | undefined {
  return pages.get(key(generation, sessionKey, filingType, limit, offset))?.page;
}

export function setInsuranceHistoryPage(
  generation: number,
  sessionKey: string,
  filingType: InsuranceFilingType | undefined,
  limit: number,
  offset: number,
  page: InsuranceHistoryPage,
): void {
  pages.set(key(generation, sessionKey, filingType, limit, offset), { generation, page });
}

/**
 * Logout and provider/account transitions call this synchronously before
 * awaiting any storage or network cleanup. No patient history page survives a
 * session boundary.
 */
export function clearInsuranceHistoryCache(): void {
  pages.clear();
}

export function insuranceHistoryCacheSize(): number {
  return pages.size;
}