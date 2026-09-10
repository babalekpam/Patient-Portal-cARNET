import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/lib/i18n";

export default function TabLayout() {
  const isWeb = Platform.OS === "web";
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: colors.surface,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface + "F2" }]} />
          ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("home"),
          tabBarIcon: ({ color }) => (
            <Feather accessible={false} name="home" size={22} color={color} />
          ),
          tabBarAccessibilityLabel: t("home"),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: t("reminders"),
          tabBarIcon: ({ color }) => (
            <Feather accessible={false} name="bell" size={22} color={color} />
          ),
          tabBarAccessibilityLabel: t("reminders"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("profile"),
          tabBarIcon: ({ color }) => (
            <Feather accessible={false} name="user" size={22} color={color} />
          ),
          tabBarAccessibilityLabel: t("profile"),
        }}
      />
    </Tabs>
  );
}
