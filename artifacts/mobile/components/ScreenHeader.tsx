import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text, View, findNodeHandle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { Pressable } from "@/components/AccessiblePressable";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightElement?: React.ReactNode;
  rightIcon?: React.ComponentProps<typeof Feather>["name"];
  onRightPress?: () => void;
}

export function ScreenHeader({ title, subtitle, showBack = true, rightElement, rightIcon, onRightPress }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const labels = useAccessibilityLabels();
  const headingRef = useRef<Text>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const timer = setTimeout(() => {
      const tag = headingRef.current ? findNodeHandle(headingRef.current) : null;
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 100);
    return () => clearTimeout(timer);
  }, [title]);

  return (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insets.top + 12 }]}
    >
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
            testID="button-back"
            accessibilityLabel="Go back"
          >
            <Feather accessible={false} name="chevron-left" size={24} color={colors.whiteText} />
          </Pressable>
        ) : (
          <View style={styles.placeholder} />
        )}
        <View style={styles.titleContainer}>
          <Text ref={headingRef} accessibilityRole="header" style={[styles.title, { color: colors.whiteText }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.onPrimaryMuted }]}>{subtitle}</Text> : null}
        </View>
        {rightElement ? <View>{rightElement}</View> : rightIcon && onRightPress ? (
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            onPress={onRightPress}
            accessibilityLabel={rightIcon === "x" ? labels.closeDialog : title}
          >
            <Feather accessible={false} name={rightIcon} size={22} color={colors.whiteText} />
          </Pressable>
        ) : <View style={styles.placeholder} />}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    width: 44,
  },
  titleContainer: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
