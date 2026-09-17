import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const tsxCli = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const harness = fileURLToPath(new URL("../src/carnet-live-test.ts", import.meta.url));
const laboratoryStaffHarness = fileURLToPath(
  new URL("../src/carnet-laboratory-staff-live-test.ts", import.meta.url),
);

function runHarness(...args) {
  return spawnSync(process.execPath, [tsxCli, harness, ...args], {
    encoding: "utf8",
    env: { ...process.env },
    timeout: 30_000,
  });
}

test("CARNET harness synthetic identity and clinical-marker regression passes", () => {
  const result = runHarness("--synthetic");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "CARNET live read-only harness: SYNTHETIC PASS");
  assert.equal(result.stderr, "");
});

test("CARNET harness rejects unknown live roles before reading retained secrets", () => {
  const result = runHarness("--role", "unknown", "--target", "direct");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stage=config code=SCHEMA_INVALID/);
  assert.doesNotMatch(result.stdout, /patient|token|message|result/i);
});

test("CARNET concurrent isolation role validates before any live request", () => {
  const env = { ...process.env };
  delete env.CARNET_TEST_CREDENTIALS_JSON;
  delete env.CARNET_TEST_FIXTURE_JSON;
  const result = spawnSync(
    process.execPath,
    [tsxCli, harness, "--role", "isolation", "--target", "direct"],
    { encoding: "utf8", env, timeout: 30_000 },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stage=credentials code=ENV_MISSING/);
  assert.doesNotMatch(result.stdout, /patient|token|message|result/i);
});

test("CARNET laboratory staff harness synthetic ownership regression passes", () => {
  const result = spawnSync(process.execPath, [tsxCli, laboratoryStaffHarness, "--synthetic"], {
    encoding: "utf8",
    env: { ...process.env },
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "CARNET laboratory staff receipt checks: SYNTHETIC PASS");
  assert.equal(result.stderr, "");
});