import assert from "node:assert/strict";
import test from "node:test";
import { SecureStorageEngine, type SecretDriver } from "../lib/secureStorageCore";

function fixture() {
  const store = new Map<string, string>();
  let failKey: RegExp | null = null;
  const driver: SecretDriver = {
    get: async key => store.get(key) ?? null,
    set: async (key, value) => {
      assert.ok(Buffer.byteLength(value, "utf8") <= 1800, "exceeds conservative Keychain entry budget");
      if (failKey?.test(key)) throw new Error("Device storage unavailable");
      store.set(key, value);
    },
    remove: async key => { store.delete(key); },
  };
  return { store, engine: new SecureStorageEngine(driver), fail: (key: RegExp | null) => { failKey = key; } };
}

test("stores unicode across small native entries without splitting surrogate pairs", async () => {
  const f = fixture();
  const value = JSON.stringify({ notes: "patient 🩺".repeat(600) });
  await f.engine.set("health_metrics", value);
  assert.equal(await f.engine.get("health_metrics"), value);
  assert.deepEqual(await f.engine.keys(), ["health_metrics"]);
});

test("atomic replacement retains previous value when a chunk write fails", async () => {
  const f = fixture();
  await f.engine.set("health_metrics", "original");
  f.fail(/\.1$/);
  await assert.rejects(f.engine.set("health_metrics", "x".repeat(700)), /unavailable/);
  f.fail(null);
  assert.equal(await f.engine.get("health_metrics"), "original");
  assert.equal([...f.store.keys()].filter(key => key.startsWith("health_metrics.")).length, 2);
});

test("shorter replacements and deletion leave no record chunks behind", async () => {
  const f = fixture();
  await f.engine.set("health_metrics", "x".repeat(900));
  await f.engine.set("health_metrics", "short");
  assert.equal([...f.store.keys()].filter(k => k.startsWith("health_metrics.")).length, 2);
  await f.engine.remove("health_metrics");
  assert.equal(await f.engine.get("health_metrics"), null);
  assert.deepEqual(await f.engine.keys(), []);
  assert.ok([...f.store.keys()].every(k => !k.startsWith("health_metrics.")));
});

test("interrupted pending chunks are cleaned on next successful write", async () => {
  const f = fixture();
  f.store.set("health_metrics.__pending", JSON.stringify({ version: 2, generation: "old", chunks: 2 }));
  f.store.set("health_metrics.old.0", "partial");
  await f.engine.set("health_metrics", "new");
  assert.equal(f.store.has("health_metrics.old.0"), false);
  assert.equal(await f.engine.get("health_metrics"), "new");
});

test("rejects colliding keys, large values, and damaged manifests", async () => {
  const f = fixture();
  await assert.rejects(f.engine.set("family/members", "test"), /Invalid/);
  await assert.rejects(f.engine.set("family_members", "x".repeat(90000)), /too large/);
  assert.equal(f.store.size, 0);
  f.store.set("family_members.__meta", JSON.stringify({ version: 2, generation: "../../", chunks: 9000 }));
  await assert.rejects(f.engine.get("family_members"), /damaged/);
});

test("missing chunk is an explicit failure, not empty success", async () => {
  const f = fixture();
  await f.engine.set("family_members", "test");
  for (const key of f.store.keys()) if (key.endsWith(".0")) f.store.delete(key);
  await assert.rejects(f.engine.get("family_members"), /incomplete/);
});