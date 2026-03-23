import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Avatar } from "@/components/Avatar";
import { AnimatedCard } from "@/components/AnimatedCard";
import { HomeSkeleton } from "@/components/SkeletonLoader";

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

function MenuCard({ item, index }: { item: MenuItem; index: number }) {
  const { colors } = useTheme();
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(item.route as any);
  };

  return (
    <AnimatedCard index={index}>
      <Pressable
        style={({ pressed }) => [
          styles.menuCard,
          { backgroundColor: colors.surface, borderColor: colors.borderLight },
          pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        ]}
        onPress={handlePress}
      >
        <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
          <Feather name={item.icon} size={22} color={item.color} />
        </View>
        <View style={styles.menuContent}>
          <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
          <Text style={[styles.menuDesc, { color: colors.textSecondary }]}>{item.description}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textTertiary} />
      </Pressable>
    </AnimatedCard>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile, isLoading, logout, refreshProfile } = useAuth();
  const { colors } = useTheme();
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

  if (isLoading && !profile) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad + 16 }]}>
        <HomeSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : 20 }}
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerGradient, { paddingTop: topPad + 16 }]}
        >
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greetingWhite}>Good day,</Text>
              <Text style={styles.patientNameWhite}>{`${firstName} ${lastName}`.trim()}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
              onPress={handleLogout}
            >
              <Feather name="log-out" size={20} color="rgba(255,255,255,0.8)" />
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.cardOverlap}>
          <View style={[styles.patientCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Avatar firstName={firstName} lastName={lastName} size={56} />
            <View style={styles.patientInfo}>
              <Text style={[styles.patientInfoName, { color: colors.text }]}>{`${firstName} ${lastName}`.trim()}</Text>
              {profile?.dateOfBirth ? (
                <Text style={[styles.patientInfoDetail, { color: colors.textSecondary }]}>DOB: {profile.dateOfBirth}</Text>
              ) : null}
              {profile?.bloodType ? (
                <View style={styles.bloodTypeRow}>
                  <Feather name="droplet" size={12} color={colors.danger} />
                  <Text style={[styles.bloodTypeText, { color: colors.danger }]}>{profile.bloodType}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {profile?.allergies && profile.allergies.length > 0 ? (
          <View style={[styles.allergyAlert, { backgroundColor: colors.dangerLight }]}>
            <View style={styles.allergyIconRow}>
              <Feather name="alert-triangle" size={16} color={colors.danger} />
              <Text style={[styles.allergyTitle, { color: colors.danger }]}>Allergies on file</Text>
            </View>
            <Text style={styles.allergyText}>{profile.allergies.join(", ")}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>My Health</Text>
        </View>
        <View style={styles.menuList}>
          {MENU_ITEMS.map((item, i) => (
            <MenuCard key={item.route} item={item} index={i} />
          ))}
        </View>

        <View style={styles.footer}>
          <Feather name="shield" size={13} color={colors.textTertiary} />
          <Text style={[styles.footerText, { color: colors.textTertiary }]}>CARNET · Powered by Navimedi</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  greetingWhite: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
  },
  patientNameWhite: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardOverlap: {
    marginTop: -30,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  patientCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
  },
  patientInfo: {
    flex: 1,
    gap: 2,
  },
  patientInfoName: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  patientInfoDetail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
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
  },
  allergyAlert: {
    marginHorizontal: 20,
    marginBottom: 8,
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
  },
  menuList: {
    paddingHorizontal: 20,
    gap: 10,
  },
  menuCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    borderWidth: 1,
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
  },
  menuDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
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
  },
});
