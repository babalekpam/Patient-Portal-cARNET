import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useTheme } from "@/context/ThemeContext";

interface AvatarProps {
  firstName?: string;
  lastName?: string;
  size?: number;
  style?: ViewStyle;
}

export function Avatar({ firstName, lastName, size = 56, style }: AvatarProps) {
  const { colors } = useTheme();
  const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const fontSize = size * 0.38;
  const borderRadius = size * 0.3;

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: colors.primary,
          shadowColor: colors.primary,
        },
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize, color: colors.onPrimary }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  text: {
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
});
