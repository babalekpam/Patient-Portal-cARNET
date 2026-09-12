import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const source = readFileSync(new URL("../components/SessionSecurity.tsx", import.meta.url), "utf8");

test("startup privacy cover is restricted to authenticated sessions", () => {
  assert.match(source, /authenticated && Platform\.OS !== "web" && AppState\.currentState !== "active"/);
  assert.match(source, /const privacyConcealed = authenticated && concealed/);
  assert.match(source, /const isVisible = !privacyConcealed && !viewingBlocked/);
  assert.match(source, /\{privacyConcealed \? <View style=\{styles\.curtain\}/);
});

test("signing out clears any retained privacy concealment", () => {
  assert.match(source, /if \(!authenticated\) \{\s*setConcealed\(false\);\s*return;\s*\}/);
});

test("foregrounding a protected session still validates it before revealing content", () => {
  assert.match(source, /assertSession\(sessionKey\);\s*recordSessionActivity\(\);\s*setConcealed\(false\)/);
  assert.match(source, /catch \{\s*setConcealed\(true\)/);
});