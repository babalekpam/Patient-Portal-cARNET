import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertRestrictedProductionFeatureEnabled,
  restrictedProductionFeaturesEnabled,
} from "../lib/productionFeatures";

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = mutableEnv.NODE_ENV;
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../app");

function restoreEnvironment(): void {
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
}

test.afterEach(restoreEnvironment);

test("production disables restricted features at the API adapter boundary without network access", async () => {
  mutableEnv.NODE_ENV = "production";
  assert.equal(restrictedProductionFeaturesEnabled(), false);
  let requests = 0;
  const guardedRequest = (feature: "laboratory-messages" | "insurance-history") => {
    assertRestrictedProductionFeatureEnabled(feature);
    requests += 1;
  };
  assert.throws(() => guardedRequest("laboratory-messages"), /disabled in production/i);
  assert.throws(() => guardedRequest("insurance-history"), /disabled in production/i);
  assert.equal(requests, 0);

  const adapterSource = readFileSync(
    resolve(dirname(appRoot), "lib/ehr/adapters/navimedi.ts"),
    "utf8",
  );
  assert.match(adapterSource, /assertRestrictedProductionFeatureEnabled\("laboratory-messages"\)/);
  assert.match(adapterSource, /assertRestrictedProductionFeatureEnabled\("insurance-history"\)/);
});

test("release source removes restricted actions and protects deep links", () => {
  const layout = readFileSync(resolve(appRoot, "_layout.tsx"), "utf8");
  const home = readFileSync(resolve(appRoot, "(tabs)/index.tsx"), "utf8");
  const messages = readFileSync(resolve(appRoot, "messages.tsx"), "utf8");
  const bills = readFileSync(resolve(appRoot, "bills.tsx"), "utf8");
  assert.match(layout, /pathname === "\/insurance-history" \|\| pathname === "\/lab-messages"/);
  assert.match(
    layout,
    /if \(\s*!restrictedProductionFeaturesEnabled\(\)[\s\S]*router\.replace\(isAuthenticated \? "\/\(tabs\)" : "\/login"\)/,
  );
  assert.match(home, /route !== "\/insurance-history"/);
  assert.match(messages, /restrictedProductionFeaturesEnabled\(\)/);
  assert.match(bills, /restrictedProductionFeaturesEnabled\(\)/);
});

test("runtime source contains no credential-file references", () => {
  const runtimeFiles = [
    resolve(appRoot, "_layout.tsx"),
    resolve(dirname(appRoot), "lib/api.ts"),
    resolve(dirname(appRoot), "lib/ehr/adapters/navimedi.ts"),
    resolve(dirname(appRoot), "lib/ehr/navimediConfig.ts"),
  ];
  for (const file of runtimeFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /credentials\/|AuthKey_|google-play-service-account/i);
  }
});

test("development keeps restricted feature access enabled", () => {
  mutableEnv.NODE_ENV = "development";
  assert.equal(restrictedProductionFeaturesEnabled(), true);
});