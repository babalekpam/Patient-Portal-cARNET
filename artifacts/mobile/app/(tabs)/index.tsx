import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const C = Colors.light;

interface MenuItem {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  route: string;
  description: string;
  color: string;
  bg: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    label: "Appointments",
    icon: "calendar",
    route: "/appointments",
    description: "View & manage visits",
    color: "#2563eb",
    bg: "#dbeafe",
  },
  {
    label: "Prescriptions",
    icon: "package",
    route: "/prescriptions",
    description: "Medications & refills",
    color: "#7c3aed",
    bg: "#ede9fe",
  },
  {
    label: "Lab Results",
    icon: "bar-chart-2",
    route: "/lab-results",
    description: "Tests & analysis",
    color: "#059669",
    bg: "#d1fae5",
  },
  {
    label: "Messages",
    icon: "message-circle",
    route: "/messages",
    description: "Care team inbox",
    color: "#0284c7",
    bg: "#e0f2fe",
  },
  {
    label: "Bills",
    icon: "credit-card",
    route: "/bills",
    description: "Payments & invoices",
    color: "#d97706",
    bg: "#fef3c7",
  },
];

function MenuCard({ item }: { item: MenuItem }) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(item.route as any);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.menuCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
      onPress={handlePress}
    >
      <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
        <Feather name={item.icon} size={22} color={item.color} />
      </View>
      <View style={styles.menuContent}>
        <Text style={styles.menuLabel}>{item.label}</Text>
        <Text style={styles.menuDesc}>{item.description}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={C.textTertiary} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile, isLoading, logout, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
    router.replace("/login");
  };

  const firstName = profile?.firstName || "Patient";
  const lastName = profile?.lastName || "";

  return (
    <View style={[styles.container]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : 20 }}
      >
        {/* Header */}
        <View style={[styles.headerSection, { paddingTop: topPad + 16 }]}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>Good day,</Text>
              <Text style={styles.patientName}>{`${firstName} ${lastName}`.trim()}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
              onPress={handleLogout}
            >
              <Feather name="log-out" size={20} color={C.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.patientCard}>
            <View style={styles.patientAvatar}>
              <Feather name="user" size={28} color={C.primary} />
            </View>
            <View style={styles.patientInfo}>
              <Text style={styles.patientInfoName}>{`${firstName} ${lastName}`.trim()}</Text>
              {profile?.dateOfBirth ? (
                <Text style={styles.patientInfoDetail}>DOB: {profile.dateOfBirth}</Text>
              ) : null}
              {profile?.bloodType ? (
                <View style={styles.bloodTypeRow}>
                  <Feather name="droplet" size={12} color={C.danger} />
                  <Text style={styles.bloodTypeText}>{profile.bloodType}</Text>
                </View>
              ) : null}
            </View>
            {isLoading ? <ActivityIndicator size="small" color={C.primary} /> : null}
          </View>
        </View>

        {/* Alerts */}
        {profile?.allergies && profile.allergies.length > 0 ? (
          <View style={styles.allergyAlert}>
            <View style={styles.allergyIconRow}>
              <Feather name="alert-triangle" size={16} color={C.danger} />
              <Text style={styles.allergyTitle}>Allergies on file</Text>
            </View>
            <Text style={styles.allergyText}>{profile.allergies.join(", ")}</Text>
          </View>
        ) : null}

        {/* Menu */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Health</Text>
        </View>
        <View style={styles.menuList}>
          {MENU_ITEMS.map((item) => (
            <MenuCard key={item.route} item={item} />
          ))}
        </View>

        <View style={styles.footer}>
          <Feather name="shield" size={13} color={C.textTertiary} />
          <Text style={styles.footerText}>CARNET · Powered by Navimedi</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  greeting: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: C.textSecondary,
  },
  patientName: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: C.text,
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  patientCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  patientAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: C.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  patientInfo: {
    flex: 1,
    gap: 2,
  },
  patientInfoName: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: C.text,
  },
  patientInfoDetail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: C.textSecondary,
  },
  bloodTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  bloodTypeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: C.danger,
  },
  allergyAlert: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: C.dangerLight,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fca5a5",
    gap: 6,
  },
  allergyIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  allergyTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: C.danger,
  },
  allergyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#991b1b",
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: C.text,
  },
  menuList: {
    paddingHorizontal: 20,
    gap: 10,
  },
  menuCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: C.text,
  },
  menuDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: C.textSecondary,
    marginTop: 2,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 28,
    marginBottom: 8,
  },
  footerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: C.textTertiary,
  },
});
