export const INSURANCE_HISTORY_PAGE_SIZE = 20;
export const INSURANCE_HISTORY_MAX_PAGE_SIZE = 100;

export type InsuranceFilingType = "medical_treatment" | "medication";

export interface InsuranceHistoryAmounts {
  billed: string | null;
  approved: string | null;
  paid: string | null;
}

export interface InsuranceHistoryItem {
  filingId: string;
  filingType: InsuranceFilingType;
  date: string;
  status: string;
  currency: "USD";
  amounts: InsuranceHistoryAmounts;
}

export interface InsuranceHistoryPagination {
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface InsuranceHistoryPage {
  items: InsuranceHistoryItem[];
  pagination: InsuranceHistoryPagination;
}

export interface InsuranceHistoryRequest {
  filingType?: InsuranceFilingType;
  limit?: number;
  offset?: number;
}

const INVALID_RESPONSE = "The server returned an invalid insurance history response. Please try again.";
const DECIMAL_USD = /^(?:0|[1-9]\d*)\.\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function optionalAmount(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 64 || !DECIMAL_USD.test(value)) {
    throw new Error(INVALID_RESPONSE);
  }
  return value;
}

function parseItem(value: unknown): InsuranceHistoryItem {
  if (!isRecord(value) || !hasExactKeys(value, [
    "filingId",
    "filingType",
    "date",
    "status",
    "currency",
    "amounts",
  ])) {
    throw new Error(INVALID_RESPONSE);
  }
  if (!boundedString(value.filingId, 256) ||
      (value.filingType !== "medical_treatment" && value.filingType !== "medication") ||
      !boundedString(value.date, 64) ||
      !ISO_DATE.test(value.date) ||
      !Number.isFinite(Date.parse(value.date)) ||
      !boundedString(value.status, 128) ||
      value.currency !== "USD" ||
      !isRecord(value.amounts) ||
      !hasExactKeys(value.amounts, ["billed", "approved", "paid"])) {
    throw new Error(INVALID_RESPONSE);
  }

  return {
    filingId: value.filingId,
    filingType: value.filingType,
    date: value.date,
    status: value.status,
    currency: "USD",
    amounts: {
      billed: optionalAmount(value.amounts.billed),
      approved: optionalAmount(value.amounts.approved),
      paid: optionalAmount(value.amounts.paid),
    },
  };
}

function parsePagination(value: unknown): InsuranceHistoryPagination {
  if (!isRecord(value) || !hasExactKeys(value, ["limit", "offset", "hasMore", "nextOffset"])) {
    throw new Error(INVALID_RESPONSE);
  }
  const { limit, offset, hasMore, nextOffset } = value;
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > INSURANCE_HISTORY_MAX_PAGE_SIZE ||
    typeof offset !== "number" ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    typeof hasMore !== "boolean" ||
    (nextOffset !== null &&
      (typeof nextOffset !== "number" ||
        !Number.isSafeInteger(nextOffset) ||
        nextOffset < 0))
  ) {
    throw new Error(INVALID_RESPONSE);
  }
  if (hasMore && (nextOffset === null || nextOffset <= offset)) {
    throw new Error(INVALID_RESPONSE);
  }
  if (!hasMore && nextOffset !== null) {
    throw new Error(INVALID_RESPONSE);
  }
  return { limit, offset, hasMore, nextOffset };
}

/**
 * Validate the read-only patient insurance-history contract before any item is
 * rendered or cached. Amounts intentionally remain decimal strings so null
 * (unavailable/not recorded) is never collapsed into an explicit zero.
 */
export function requireInsuranceHistoryPage(value: unknown): InsuranceHistoryPage {
  if (!isRecord(value) || !hasExactKeys(value, ["items", "pagination"]) || !Array.isArray(value.items)) {
    throw new Error(INVALID_RESPONSE);
  }
  return {
    items: value.items.map(parseItem),
    pagination: parsePagination(value.pagination),
  };
}

export function normalizeInsuranceHistoryRequest(
  request: InsuranceHistoryRequest = {},
): Required<Pick<InsuranceHistoryRequest, "limit" | "offset">> & Pick<InsuranceHistoryRequest, "filingType"> {
  const limit = request.limit ?? INSURANCE_HISTORY_PAGE_SIZE;
  const offset = request.offset ?? 0;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > INSURANCE_HISTORY_MAX_PAGE_SIZE ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    (request.filingType !== undefined &&
      request.filingType !== "medical_treatment" &&
      request.filingType !== "medication")
  ) {
    throw new Error("Insurance history pagination is invalid.");
  }
  return { filingType: request.filingType, limit, offset };
}

export function insuranceHistoryQuery(
  request: InsuranceHistoryRequest = {},
): string {
  const normalized = normalizeInsuranceHistoryRequest(request);
  const params = new URLSearchParams({
    limit: String(normalized.limit),
    offset: String(normalized.offset),
  });
  if (normalized.filingType) params.set("filingType", normalized.filingType);
  return params.toString();
}

export const INSURER_PAID_EXPLANATION =
  "Insurer paid is cumulative payments recorded by NaviMED, including partial payments. It excludes patient copays and does not count provider receipt confirmation again. It is not bank-verified settlement.";
