import assert from "node:assert/strict";
import test from "node:test";
import Colors from "../constants/colors";
import { accessibilityCopy } from "../lib/accessibilityCopy";

function luminance(hex: string) {
  assert.match(hex, /^#[\da-f]{6}$/i);
  const linear = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (values[1]! + 0.05) / (values[0]! + 0.05);
}

for (const [mode, colors] of Object.entries(Colors)) {
  test(`${mode}: normal and secondary text meet WCAG AA 4.5:1`, () => {
    for (const foreground of ["text", "textSecondary", "textTertiary", "tabIconDefault"] as const) {
      for (const background of ["surface", "background", "surfaceSecondary"] as const) {
        const ratio = contrast(colors[foreground], colors[background]);
        assert.ok(ratio >= 4.5, `${foreground}/${background}: ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`${mode}: status labels and links meet 4.5:1`, () => {
    for (const status of ["success", "danger", "warning", "info"] as const) {
      const ratio = contrast(colors[status], colors[`${status}Light`]);
      assert.ok(ratio >= 4.5, `${status} badge: ${ratio.toFixed(2)}:1`);
    }
    for (const background of ["surface", "surfaceSecondary", "primaryLight"] as const) {
      const ratio = contrast(colors.primary, colors[background]);
      assert.ok(ratio >= 4.5, `primary/${background}: ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${mode}: filled controls and header text meet 4.5:1`, () => {
    for (const fill of ["primary", "primaryDark", "success", "danger", "warning", "info", "coral", "brand"] as const) {
      const ratio = contrast(colors.onPrimary, colors[fill]);
      assert.ok(ratio >= 4.5, `onPrimary/${fill}: ${ratio.toFixed(2)}:1`);
    }
    for (const fill of ["gradientStart", "gradientEnd"] as const) {
      for (const foreground of ["whiteText", "onPrimaryMuted"] as const) {
        const ratio = contrast(colors[foreground], colors[fill]);
        assert.ok(ratio >= 4.5, `${foreground}/${fill}: ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`${mode}: controls and focus indicators meet 3:1`, () => {
    for (const background of ["surface", "background", "surfaceSecondary"] as const) {
      for (const foreground of ["controlBorder", "focusRing"] as const) {
        const ratio = contrast(colors[foreground], colors[background]);
        assert.ok(ratio >= 3, `${foreground}/${background}: ${ratio.toFixed(2)}:1`);
      }
    }
  });
}

test("assistive labels cover all ten languages without missing or empty keys", () => {
  assert.deepEqual(Object.keys(accessibilityCopy).sort(), ["ar", "de", "en", "es", "fr", "it", "ja", "ko", "pt", "zh"]);
  const keys = Object.keys(accessibilityCopy.en).sort();
  for (const [language, labels] of Object.entries(accessibilityCopy)) {
    assert.deepEqual(Object.keys(labels).sort(), keys, language);
    for (const [key, value] of Object.entries(labels)) {
      assert.ok(value.trim().length > 0, `${language}.${key}`);
    }
  }
});