import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";

type StatusType = "success" | "warning" | "danger" | "info" | "default";

interface StatusBadgeProps {
  label: string;
  type?: StatusType;
}

function getStatusType(status: string): StatusType {
  const s = status?.toLowerCase() || "";
  if (["completed", "active", "paid", "filled", "normal", "final"].some((x) => s.includes(x))) return "success";
  if (["scheduled", "pending", "processing", "partial"].some((x) => s.includes(x))) return "info";
  if (["cancelled", "overdue", "abnormal", "high", "low"].some((x) => s.includes(x))) return "danger";
  if (["refill due", "expiring", "warning"].some((x) => s.includes(x))) return "warning";
  return "default";
}

export function StatusBadge({ label, type }: StatusBadgeProps) {
  const { colors: C } = useTheme();
  const resolvedType = type || getStatusType(label);
  const colorMap = {
    success: { bg: C.successLight, text: C.success },
    warning: { bg: C.warningLight, text: C.warning },
    danger: { bg: C.dangerLight, text: C.danger },
    info: { bg: C.infoLight, text: C.info },
    default: { bg: C.surfaceSecondary, text: C.textSecondary },
  };
  const c = colorMap[resolvedType];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },
});
