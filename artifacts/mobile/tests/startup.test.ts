import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import {
  AsyncOperationTimeoutError,
  isAsyncOperationTimeout,
  withTimeout,
} from "../lib/async";
import { syncOptionalPushToken } from "../lib/optionalPush";
import { commitProviderSelection } from "../lib/providerTransition";

const layoutSource = readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../context/AuthContext.tsx", import.meta.url), "utf8");
const ehrSource = readFileSync(new URL("../context/EHRContext.tsx", import.meta.url), "utf8");
const storageSource = readFileSync(new URL("../lib/secureStorage.ts", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../app/login.tsx", import.meta.url), "utf8");

test("bounded startup operations expose timeout errors without cancelling the underlying operation", async () => {
  let release!: () => void;
  let completed = false;
  const underlying = new Promise<void>((resolve) => {
    release = () => {
      completed = true;
      resolve();
    };
  });

  await assert.rejects(
    withTimeout(underlying, 5, "test startup"),
    (error: unknown) => error instanceof AsyncOperationTimeoutError && isAsyncOperationTimeout(error),
  );
  release();
  await underlying;
  assert.equal(completed, true);
});

test("a delayed optional notification permission prompt cannot quarantine the session", async () => {
  let secureReads = 0;
  const result = await syncOptionalPushToken(
    () => new Promise<string | null>(() => {}),
    async () => {
      secureReads += 1;
      return null;
    },
    async () => {},
    5,
    5,
  );
  assert.equal(result, "unavailable");
  assert.equal(secureReads, 0);
});

test("secure push-token failures remain distinct from optional notification failures", async () => {
  const result = await syncOptionalPushToken(
    async () => "push-token",
    () => new Promise<string | null>(() => {}),
    async () => {},
    20,
    5,
  );
  assert.equal(result, "storage-failed");
});

test("provider persistence rechecks the destination before swapping adapters", async () => {
  let release!: () => void;
  let sessionIsCurrent = false;
  const events: string[] = [];
  const persist = new Promise<void>((resolve) => { release = resolve; });
  const selection = commitProviderSelection({
    persist: async () => persist,
    sessionIsCurrent: () => sessionIsCurrent,
    destinationChanged: () => true,
    endSession: () => events.push("end"),
    commit: () => events.push("commit"),
  });
  sessionIsCurrent = true;
  release();
  await selection;
  assert.deepEqual(events, ["end", "commit"]);
});

test("the root keeps a branded recovery surface instead of returning a blank screen", () => {
  assert.doesNotMatch(layoutSource, /if\s*\(\s*isLoading\s*\)\s*return\s+null/);
  assert.match(layoutSource, /Preparing a secure session/);
  assert.match(layoutSource, /Retry secure startup/);
  assert.match(layoutSource, /FONT_TIMEOUT_MS/);
  assert.match(layoutSource, /fontError \|\| fontTimedOut/);
  assert.doesNotMatch(layoutSource, /router\.replace\("\/"\)/);
  assert.match(layoutSource, /showStartupOverlay/);
  assert.match(layoutSource, /importantForAccessibility=\{showBlockingOverlay/);
});

test("startup and provider loading have retryable, bounded paths", () => {
  assert.match(authSource, /withTimeout\(getToken\(\)/);
  assert.match(authSource, /retryStartup/);
  assert.match(authSource, /await cleanup\.catch/);
  assert.match(authSource, /cleanupSucceeded/);
  assert.match(ehrSource, /withTimeout\(\s*AsyncStorage\.getItem/);
  assert.match(ehrSource, /retry:\s*loadSavedProvider/);
  assert.match(storageSource, /quarantineSecureStorage/);
  assert.match(storageSource, /subscribeToSecureStorageQuarantine/);
});

test("failed sign-in keeps the mounted form responsible for visible errors", () => {
  assert.match(layoutSource, /never replace \/login after a failed sign-in/);
  assert.match(loginSource, /setError\(err\.message \|\| t\("loginFailed"\)\)/);
  assert.match(loginSource, /accessibilityRole="alert"/);
  assert.match(loginSource, /ActivityIndicator/);
});