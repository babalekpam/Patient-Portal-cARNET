import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const C = Colors.light;

function InfoRow({ icon, label, value }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Feather name={icon} size={16} color={C.primary} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
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

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Patient";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.background }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : 20 }}
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* Profile Hero */}
      <View style={[styles.hero, { paddingTop: topPad + 20 }]}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Feather name="user" size={36} color={C.primary} />
          </View>
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
        </View>
        <Text style={styles.name}>{fullName}</Text>
        {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}
      </View>

      {/* Personal Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personal Information</Text>
        <View style={styles.card}>
          <InfoRow icon="calendar" label="Date of Birth" value={profile?.dateOfBirth} />
          <InfoRow icon="user" label="Gender" value={profile?.gender} />
          <InfoRow icon="droplet" label="Blood Type" value={profile?.bloodType} />
          <InfoRow icon="phone" label="Phone" value={profile?.phone} />
          <InfoRow icon="mail" label="Email" value={profile?.email} />
          <InfoRow icon="map-pin" label="Address" value={profile?.address} />
          {profile?.mrn ? <InfoRow icon="hash" label="Medical Record #" value={profile.mrn} /> : null}
        </View>
      </View>

      {/* Allergies */}
      {profile?.allergies && profile.allergies.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Allergies</Text>
          <View style={[styles.card, styles.allergyCard]}>
            <View style={styles.allergyHeader}>
              <Feather name="alert-triangle" size={18} color={C.danger} />
              <Text style={styles.allergyTitle}>Known Allergies</Text>
            </View>
            {profile.allergies.map((allergy, i) => (
              <View key={i} style={styles.allergyItem}>
                <View style={styles.allergyDot} />
                <Text style={styles.allergyText} testID={`text-allergies`}>{allergy}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Sign Out */}
      <View style={styles.section}>
        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.8 }]}
          onPress={handleLogout}
        >
          <Feather name="log-out" size={18} color={C.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 28,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 16,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: C.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: C.text,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: C.textSecondary,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: C.textSecondary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: C.textTertiary,
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: C.text,
  },
  allergyCard: {
    padding: 16,
    gap: 10,
  },
  allergyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  allergyTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: C.danger,
  },
  allergyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  allergyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.danger,
  },
  allergyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: C.text,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.dangerLight,
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  logoutText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: C.danger,
  },
});
