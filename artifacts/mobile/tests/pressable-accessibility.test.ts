import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node's native TypeScript test runner requires the file extension.
import {
  getWebAccessibilityState,
  shouldHandleSpaceActivation,
} from "../lib/pressableAccessibility";

test("supplements Space activation only for non-button ARIA control roles", () => {
  for (const role of ["checkbox", "radio", "switch", "menuitem", "tab"] as const) {
    assert.equal(shouldHandleSpaceActivation(role, false, false), true, role);
  }
  assert.equal(shouldHandleSpaceActivation("button", false, false), false);
  assert.equal(shouldHandleSpaceActivation("link", false, false), false);
  assert.equal(shouldHandleSpaceActivation(undefined, false, false), false);
});

test("leaves button keyboard activation, including Enter, to RN Web", () => {
  assert.equal(shouldHandleSpaceActivation("button", false, false), false);
});

test("ignores key repeat and disabled controls", () => {
  assert.equal(shouldHandleSpaceActivation("checkbox", false, true), false);
  assert.equal(shouldHandleSpaceActivation("checkbox", true, false), false);
  assert.equal(getWebAccessibilityState({ disabled: true })["aria-disabled"], true);
});

test("preserves explicit true and false ARIA state values", () => {
  assert.deepEqual(
    getWebAccessibilityState({
      checked: false,
      expanded: false,
      selected: false,
      busy: false,
      disabled: false,
    }),
    {
      "aria-busy": false,
      "aria-checked": false,
      "aria-disabled": false,
      "aria-expanded": false,
      "aria-selected": false,
    },
  );

  assert.deepEqual(
    getWebAccessibilityState({
      checked: true,
      expanded: true,
      selected: true,
      busy: true,
      disabled: true,
    }),
    {
      "aria-busy": true,
      "aria-checked": true,
      "aria-disabled": true,
      "aria-expanded": true,
      "aria-selected": true,
    },
  );
});

test("preserves the mixed checkbox state", () => {
  assert.equal(getWebAccessibilityState({ checked: "mixed" })["aria-checked"], "mixed");
});