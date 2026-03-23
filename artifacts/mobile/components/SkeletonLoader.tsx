import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@/context/ThemeContext";

function ShimmerBlock({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const { colors } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return <Animated.View style={[styles.block, { backgroundColor: colors.surfaceSecondary }, style, { opacity }]} />;
}

export function CardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
      <View style={styles.cardRow}>
        <ShimmerBlock style={styles.iconBlock} />
        <View style={styles.cardContent}>
          <ShimmerBlock style={styles.titleBlock} />
          <ShimmerBlock style={styles.badgeBlock} />
        </View>
      </View>
      <ShimmerBlock style={styles.lineBlock} />
      <ShimmerBlock style={styles.lineBlockShort} />
    </View>
  );
}

export function ProfileSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={styles.profileWrap}>
      <View style={[styles.profileHero, { backgroundColor: colors.surface }]}>
        <ShimmerBlock style={styles.avatarBlock} />
        <ShimmerBlock style={styles.nameBlock} />
        <ShimmerBlock style={styles.emailBlock} />
      </View>
      <View style={styles.profileSection}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.infoRowSkeleton}>
            <ShimmerBlock style={styles.infoIconBlock} />
            <View style={styles.infoContentBlock}>
              <ShimmerBlock style={styles.infoLabelBlock} />
              <ShimmerBlock style={styles.infoValueBlock} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function HomeSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={styles.homeWrap}>
      <View style={styles.homeHeader}>
        <ShimmerBlock style={styles.greetingBlock} />
        <ShimmerBlock style={styles.nameBlockLg} />
      </View>
      <View style={[styles.homeCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <ShimmerBlock style={styles.homeAvatarBlock} />
        <View style={{ flex: 1, gap: 8 }}>
          <ShimmerBlock style={styles.titleBlock} />
          <ShimmerBlock style={styles.lineBlockShort} />
        </View>
      </View>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.menuSkeleton, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <ShimmerBlock style={styles.menuIconBlock} />
          <View style={{ flex: 1, gap: 6 }}>
            <ShimmerBlock style={styles.menuLabelBlock} />
            <ShimmerBlock style={styles.menuDescBlock} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.listWrap}>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderRadius: 8,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
  },
  cardRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  cardContent: {
    flex: 1,
    gap: 8,
  },
  iconBlock: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  titleBlock: {
    height: 16,
    width: "70%",
    borderRadius: 8,
  },
  badgeBlock: {
    height: 22,
    width: 80,
    borderRadius: 11,
  },
  lineBlock: {
    height: 12,
    width: "100%",
    borderRadius: 6,
  },
  lineBlockShort: {
    height: 12,
    width: "60%",
    borderRadius: 6,
  },
  listWrap: {
    padding: 16,
    gap: 12,
  },
  profileWrap: {
    flex: 1,
  },
  profileHero: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 12,
  },
  avatarBlock: {
    width: 88,
    height: 88,
    borderRadius: 28,
  },
  nameBlock: {
    height: 20,
    width: 160,
    borderRadius: 10,
  },
  emailBlock: {
    height: 14,
    width: 200,
    borderRadius: 7,
  },
  profileSection: {
    padding: 20,
    gap: 0,
  },
  infoRowSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  infoIconBlock: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  infoContentBlock: {
    flex: 1,
    gap: 6,
  },
  infoLabelBlock: {
    height: 10,
    width: 80,
    borderRadius: 5,
  },
  infoValueBlock: {
    height: 14,
    width: "50%",
    borderRadius: 7,
  },
  homeWrap: {
    padding: 20,
    gap: 12,
  },
  homeHeader: {
    gap: 6,
    marginBottom: 8,
  },
  greetingBlock: {
    height: 14,
    width: 80,
    borderRadius: 7,
  },
  nameBlockLg: {
    height: 24,
    width: 180,
    borderRadius: 12,
  },
  homeCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  homeAvatarBlock: {
    width: 56,
    height: 56,
    borderRadius: 16,
  },
  menuSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
  },
  menuIconBlock: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  menuLabelBlock: {
    height: 14,
    width: 120,
    borderRadius: 7,
  },
  menuDescBlock: {
    height: 12,
    width: 160,
    borderRadius: 6,
  },
});
