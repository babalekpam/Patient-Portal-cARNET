import assert from "node:assert/strict";
import test from "node:test";
import {
  NAVIMEDI_RELAY_UPSTREAM,
  RELAY_UPSTREAM_ENV_KEY,
  TEMPORARY_HANDOFF_RELAY_UPSTREAM,
  resolveRelayUpstreamBaseUrl,
} from "./relay-upstream";

test("keeps the production relay upstream when no override is supplied", () => {
  assert.equal(resolveRelayUpstreamBaseUrl({ NODE_ENV: "development" }), NAVIMEDI_RELAY_UPSTREAM);
  assert.equal(resolveRelayUpstreamBaseUrl({ NODE_ENV: "production" }), NAVIMEDI_RELAY_UPSTREAM);
});

test("allows only the fixed temporary handoff upstream in development", () => {
  assert.equal(
    resolveRelayUpstreamBaseUrl({
      NODE_ENV: "development",
      [RELAY_UPSTREAM_ENV_KEY]: TEMPORARY_HANDOFF_RELAY_UPSTREAM,
    }),
    TEMPORARY_HANDOFF_RELAY_UPSTREAM,
  );
  assert.throws(
    () => resolveRelayUpstreamBaseUrl({
      NODE_ENV: "development",
      [RELAY_UPSTREAM_ENV_KEY]: "https://evil.example/api",
    }),
    /allowlisted/i,
  );
});

test("rejects a development relay override outside development", () => {
  assert.throws(
    () => resolveRelayUpstreamBaseUrl({
      NODE_ENV: "production",
      [RELAY_UPSTREAM_ENV_KEY]: TEMPORARY_HANDOFF_RELAY_UPSTREAM,
    }),
    /development-only/i,
  );
  assert.throws(
    () => resolveRelayUpstreamBaseUrl({
      NODE_ENV: "test",
      [RELAY_UPSTREAM_ENV_KEY]: TEMPORARY_HANDOFF_RELAY_UPSTREAM,
    }),
    /development-only/i,
  );
});