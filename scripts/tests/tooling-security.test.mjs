import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const mobileRequire = createRequire(
  new URL("../../artifacts/mobile/package.json", import.meta.url),
);
const cliRequire = createRequire(mobileRequire.resolve("@expo/cli"));
const configRequire = createRequire(cliRequire.resolve("@expo/config-plugins"));

test("xcode's patched UUID dependency retains its CommonJS v4 interface", () => {
  const xcode = configRequire("xcode");
  const xcodeRequire = createRequire(configRequire.resolve("xcode"));
  assert.equal(xcodeRequire("uuid/package.json").version, "11.1.1");
  const project = xcode.project("/tmp/carnet-synthetic-project.pbxproj");
  // This test generates identifiers only; it reads/writes no project or native
  // build files and never invokes Xcode or EAS.
  const identifiers = new Set();
  project.allUuids = () => [...identifiers];
  for (let index = 0; index < 100; index++) {
    const id = project.generateUuid();
    assert.match(id, /^[0-9A-F]{24}$/);
    assert.equal(identifiers.has(id), false);
    identifiers.add(id);
  }
});