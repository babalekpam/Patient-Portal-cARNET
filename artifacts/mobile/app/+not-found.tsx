import { Feather } from "@expo/vector-icons";
import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.surfaceSecondary }]}>
          <Feather name="map" size={32} color={colors.textTertiary} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Page not found</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>This screen doesn&apos;t exist.</Text>
        <Link href="/" style={[styles.link, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.linkText, { color: colors.primary }]}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 12,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  link: {
    marginTop: 15,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    justifyContent: "center",
  },
  linkText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
