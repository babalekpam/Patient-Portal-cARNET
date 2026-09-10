import assert from "node:assert/strict";
import test from "node:test";
import { buildAllowedOrigins, isAllowedOrigin } from "./security";

test("CORS allows the exact HTTPS request host", () => {
  assert.equal(isAllowedOrigin("https://portal.example.com", "portal.example.com"), true);
  assert.equal(isAllowedOrigin("https://portal.example.com:443", "portal.example.com"), true);
});

test("CORS rejects insecure, lookalike, credentialed, and path origins", () => {
  assert.equal(isAllowedOrigin("http://portal.example.com", "portal.example.com"), false);
  assert.equal(isAllowedOrigin("https://portal.example.com.evil.test", "portal.example.com"), false);
  assert.equal(isAllowedOrigin("https://portal.example.com@evil.test", "portal.example.com"), false);
  assert.equal(isAllowedOrigin("https://portal.example.com/path", "portal.example.com"), false);
});

test("development permits only the explicit Expo HTTPS domain", () => {
  assert.deepEqual(buildAllowedOrigins({
    NODE_ENV: "development",
    REPLIT_EXPO_DEV_DOMAIN: "expo-app.example.replit.dev",
  }), ["https://expo-app.example.replit.dev"]);
  assert.deepEqual(buildAllowedOrigins({
    NODE_ENV: "development",
    REPLIT_EXPO_DEV_DOMAIN: "*.replit.dev",
  }), []);
  assert.deepEqual(buildAllowedOrigins({
    NODE_ENV: "development",
    REPLIT_EXPO_DEV_DOMAIN: "trusted.replit.dev@evil.test",
  }), []);
  assert.deepEqual(buildAllowedOrigins({
    NODE_ENV: "production",
    REPLIT_EXPO_DEV_DOMAIN: "expo-app.example.replit.dev",
  }), []);
});

test("development never grants arbitrary Replit subdomains", () => {
  const allowed = buildAllowedOrigins({
    NODE_ENV: "development",
    REPLIT_EXPO_DEV_DOMAIN: "exact-app.replit.dev",
  });
  assert.equal(allowed.includes("https://exact-app.replit.dev"), true);
  assert.equal(allowed.includes("https://attacker.replit.dev"), false);
});