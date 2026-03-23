const primary = "#1a6fbf";
const primaryDark = "#1557a0";
const primaryLight = "#e8f2fd";

const light = {
  primary,
  primaryDark,
  primaryLight,
  text: "#0f1923",
  textSecondary: "#5a6a7a",
  textTertiary: "#8a9aaa",
  background: "#f5f7fa",
  surface: "#ffffff",
  surfaceSecondary: "#f0f4f8",
  border: "#e2e8f0",
  borderLight: "#edf2f7",
  tint: primary,
  tabIconDefault: "#8a9aaa",
  tabIconSelected: primary,
  success: "#16a34a",
  successLight: "#dcfce7",
  warning: "#d97706",
  warningLight: "#fef3c7",
  danger: "#dc2626",
  dangerLight: "#fee2e2",
  info: "#0284c7",
  infoLight: "#e0f2fe",
  gradientStart: "#1a6fbf",
  gradientEnd: "#1557a0",
};

const dark: typeof light = {
  primary: "#4a9ede",
  primaryDark: "#3b8fd0",
  primaryLight: "#1a2d42",
  text: "#e8edf2",
  textSecondary: "#94a3b8",
  textTertiary: "#64748b",
  background: "#0c1219",
  surface: "#151e28",
  surfaceSecondary: "#1e2a36",
  border: "#2a3a4a",
  borderLight: "#1e2a36",
  tint: "#4a9ede",
  tabIconDefault: "#64748b",
  tabIconSelected: "#4a9ede",
  success: "#22c55e",
  successLight: "#052e16",
  warning: "#f59e0b",
  warningLight: "#451a03",
  danger: "#ef4444",
  dangerLight: "#450a0a",
  info: "#38bdf8",
  infoLight: "#082f49",
  gradientStart: "#0c1a2a",
  gradientEnd: "#0a1420",
};

export default { light, dark };
