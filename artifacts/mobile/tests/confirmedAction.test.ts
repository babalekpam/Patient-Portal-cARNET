import assert from "node:assert/strict";
import test from "node:test";
import { runConfirmedAction } from "../lib/confirmedAction";

test("accepted web confirmation runs logout", async () => {
  let logoutCalls = 0;
  const completed = await runConfirmedAction(
    async () => true,
    async () => { logoutCalls += 1; },
  );
  assert.equal(completed, true);
  assert.equal(logoutCalls, 1);
});

test("cancelled web confirmation never clears or logs out", async () => {
  let logoutCalls = 0;
  const completed = await runConfirmedAction(
    async () => false,
    async () => { logoutCalls += 1; },
  );
  assert.equal(completed, false);
  assert.equal(logoutCalls, 0);
});