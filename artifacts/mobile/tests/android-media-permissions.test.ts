import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import test from "node:test";
import ts from "typescript";

const config = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
const source = readFileSync(new URL("../app/documents.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("documents.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler: string | undefined;
function findHandler(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handlePickFromGallery") {
    handler = node.initializer?.getText(ast);
  }
  ts.forEachChild(node, findHandler);
}
findHandler(ast);

test("Android blocks broad photo/video access, including dependency permissions", () => {
  for (const permission of [
    "READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE",
  ]) {
    assert.ok(config.expo.android.blockedPermissions.includes(`android.permission.${permission}`));
    assert.ok(!config.expo.android.permissions.some((p: string) => p === permission || p.endsWith(`.${permission}`)));
  }
  assert.ok(config.expo.android.permissions.includes("CAMERA"));
});

async function runPicker(platform: string, permission: string) {
  assert.ok(handler, "Test must execute the real Documents gallery handler");
  const calls: string[] = [];
  let options: Record<string, unknown> | undefined;
  const javascript = ts.transpileModule(`const pick = ${handler};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const pick = new Function(
    "Platform", "ImagePicker", "capturePatientDataEpoch", "assertPatientDataEpoch",
    "isPatientDataEpochCurrent", "showAppAlert", "t",
    `${javascript}\nreturn pick;`,
  )(
    { OS: platform },
    {
      requestMediaLibraryPermissionsAsync: async () => {
        calls.push("permission");
        return { status: permission };
      },
      launchImageLibraryAsync: async (value: Record<string, unknown>) => {
        calls.push("picker");
        options = value;
        return { canceled: true, assets: [] };
      },
    },
    () => 1, () => {}, () => true,
    () => calls.push("alert"), (value: string) => value,
  );
  await pick();
  return { calls, options };
}

test("Android opens the system image picker without library permission", async () => {
  const { calls, options } = await runPicker("android", "denied");
  assert.deepEqual(calls, ["picker"]);
  assert.deepEqual(options?.mediaTypes, ["images"]);
  assert.equal(options?.legacy, false);
  assert.equal(options?.base64, true);
});

test("iOS retains its existing permission handling", async () => {
  assert.deepEqual((await runPicker("ios", "denied")).calls, ["permission", "alert"]);
  assert.deepEqual((await runPicker("ios", "granted")).calls, ["permission", "picker"]);
});