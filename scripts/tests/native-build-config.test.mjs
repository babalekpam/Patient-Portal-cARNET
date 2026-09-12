import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const root = JSON.parse(read("package.json"));
const eas = JSON.parse(read("artifacts/mobile/eas.json"));

test("Expo production builds use the same pinned pnpm as the workspace", () => {
  assert.equal(root.packageManager, "pnpm@10.26.1");
  assert.equal(`pnpm@${eas.build.production.pnpm}`, root.packageManager);
  assert.ok(eas.build.production.ios.image);
});

test("workspace and lockfile preserve native macOS build dependencies", () => {
  for (const path of ["pnpm-workspace.yaml", "pnpm-lock.yaml"]) {
    assert.doesNotMatch(read(path), /^\s+.*darwin.*:\s*['"]-['"]\s*$/m);
  }
  for (const name of ["@esbuild/darwin-arm64", "@rollup/rollup-darwin-arm64", "lightningcss-darwin-arm64", "@tailwindcss/oxide-darwin-arm64"]) {
    assert.ok(read("pnpm-lock.yaml").includes(name), `${name} must be resolved`);
  }
});