import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  insuranceHistoryQuery,
  requireInsuranceHistoryPage,
  type InsuranceHistoryPage,
} from "../lib/insuranceHistory";
import {
  clearInsuranceHistoryCache,
  getInsuranceHistoryPage,
  insuranceHistoryCacheSize,
  setInsuranceHistoryPage,
} from "../lib/insuranceHistoryCache";
import { insuranceHistoryNavigation } from "../lib/insuranceHistoryPagination";
import { beginProtectedSessionTermination } from "../lib/sessionBoundary";

const page: InsuranceHistoryPage = {
  items: [{
    filingId: "11111111-1111-4111-8111-111111111111",
    filingType: "medical_treatment",
    date: "2026-09-13T14:00:00.000Z",
    status: "approved",
    currency: "USD",
    amounts: { billed: "240.00", approved: "180.00", paid: null },
  }],
  pagination: { limit: 20, offset: 0, hasMore: false, nextOffset: null },
};

test.afterEach(clearInsuranceHistoryCache);

test("strictly parses the uploaded insurance-history contract and preserves null versus zero", () => {
  const parsed = requireInsuranceHistoryPage({
    ...page,
    items: [{
      ...page.items[0],
      amounts: { ...page.items[0].amounts, paid: "0.00" },
    }],
  });
  assert.equal(parsed.items[0].amounts.paid, "0.00");
  assert.equal(requireInsuranceHistoryPage(page).items[0].amounts.paid, null);
  assert.throws(
    () => requireInsuranceHistoryPage({
      ...page,
      items: [{ ...page.items[0], filingType: "staff" }],
    }),
    /invalid insurance history response/i,
  );
  assert.throws(
    () => requireInsuranceHistoryPage({
      ...page,
      pagination: { limit: 20, offset: 0, hasMore: true, nextOffset: null },
    }),
    /invalid insurance history response/i,
  );
});

test("builds bounded category pagination without accepting selectors", () => {
  assert.equal(
    insuranceHistoryQuery({
      filingType: "medication",
      limit: 100,
      offset: 40,
    }),
    "limit=100&offset=40&filingType=medication",
  );
  assert.throws(
    () => insuranceHistoryQuery({ limit: 101 }),
    /pagination is invalid/i,
  );
  assert.throws(
    () => insuranceHistoryQuery({ filingType: "staff" as never }),
    /pagination is invalid/i,
  );
});

test("cache is generation and session scoped, and logout cleanup removes every page", () => {
  setInsuranceHistoryPage(7, "navimedi|tenant-a|patient-a", "medical_treatment", 20, 0, page);
  assert.equal(
    getInsuranceHistoryPage(7, "navimedi|tenant-a|patient-a", "medical_treatment", 20, 0),
    page,
  );
  assert.equal(
    getInsuranceHistoryPage(8, "navimedi|tenant-a|patient-a", "medical_treatment", 20, 0),
    undefined,
  );
  assert.equal(
    getInsuranceHistoryPage(7, "navimedi|tenant-b|patient-b", "medical_treatment", 20, 0),
    undefined,
  );
  assert.equal(insuranceHistoryCacheSize(), 1);
  clearInsuranceHistoryCache();
  assert.equal(insuranceHistoryCacheSize(), 0);
});

test("keeps pagination controls on empty intermediate pages", () => {
  const emptyLaterPage: InsuranceHistoryPage = {
    items: [],
    pagination: { limit: 20, offset: 20, hasMore: true, nextOffset: 40 },
  };
  assert.deepEqual(insuranceHistoryNavigation(emptyLaterPage, 1), {
    showPrevious: true,
    showNext: true,
    nextOffset: 40,
  });
  assert.deepEqual(
    insuranceHistoryNavigation(
      { ...emptyLaterPage, pagination: { ...emptyLaterPage.pagination, hasMore: false, nextOffset: null } },
      1,
    ),
    { showPrevious: true, showNext: false, nextOffset: null },
  );
});

test("logout boundary blocks a late patient-A history page before delayed revocation and replacement patient-B", async () => {
  let currentSession: { account: string } | null = { account: "patient-a" };
  let bearer = "token-a";
  let visible = true;
  let releaseHistory!: () => void;
  const historyResponse = new Promise<void>((resolve) => { releaseHistory = resolve; });
  const queryEvents: string[] = [];
  const fakeQueryClient = {
    cancelQueries: async () => { queryEvents.push("cancel-history"); },
    removeQueries: () => { queryEvents.push("remove-history"); },
  };

  const patientAHistory = (async () => {
    const requestSession = currentSession;
    await historyResponse;
    if (requestSession !== currentSession) return;
    setInsuranceHistoryPage(
      1,
      "navimedi|tenant-a|patient-a",
      "medication",
      20,
      0,
      page,
    );
  })();

  let releaseRemoteLogout!: () => void;
  const remoteLogout = new Promise<void>((resolve) => { releaseRemoteLogout = resolve; });
  // This is the same ordering as AuthContext.terminate: local concealment and
  // session invalidation happen before the remote logout can resolve.
  visible = false;
  beginProtectedSessionTermination(fakeQueryClient, () => {
    currentSession = null;
  });
  const capturedBearer = bearer;
  const replacementLogin = (async () => {
    await remoteLogout;
    assert.equal(capturedBearer, "token-a");
    currentSession = { account: "patient-b" };
    bearer = "token-b";
    visible = true;
  })();

  assert.equal(visible, false);
  assert.deepEqual(queryEvents, ["cancel-history", "remove-history"]);
  releaseHistory();
  await patientAHistory;
  assert.equal(insuranceHistoryCacheSize(), 0);

  releaseRemoteLogout();
  await replacementLogin;
  assert.equal(currentSession?.account, "patient-b");
  assert.equal(bearer, "token-b");
  assert.equal(visible, true);
  assert.deepEqual(queryEvents, ["cancel-history", "remove-history"]);
});

test("AuthContext starts the local logout boundary before remote logout and clears the captured token afterward", () => {
  const authSource = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../context/AuthContext.tsx"),
    "utf8",
  );
  const boundary = authSource.indexOf("beginProtectedSessionTermination(queryClient, invalidateSessionBoundary)");
  const remoteLogout = authSource.indexOf("await api.logout(capturedAdapter)");
  const capturedTokenClear = authSource.indexOf("capturedAdapter?.clearToken()");
  assert.ok(boundary >= 0 && boundary < remoteLogout);
  assert.ok(remoteLogout < capturedTokenClear);
});
