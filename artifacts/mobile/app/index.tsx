import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
  Platform,
  useWindowDimensions,
  Easing,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/ThemeContext";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { Pressable } from "@/components/AccessiblePressable";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Path,
  G,
  Circle,
  Ellipse,
} from "react-native-svg";

export default function OpeningScreen() {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const useNative = Platform.OS !== "web";

  // Animations
  const logoFadeAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const logoSlideAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const carAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const cloud1Anim = useRef(new Animated.Value(reducedMotion ? 0.3 : 0)).current;
  const cloud2Anim = useRef(new Animated.Value(reducedMotion ? 0.7 : 0)).current;

  useEffect(() => {
    if (reducedMotion) return;

    const logoAnim = Animated.parallel([
      Animated.timing(logoFadeAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),
      Animated.timing(logoSlideAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),
    ]);

    const c1Anim = Animated.timing(cloud1Anim, {
      toValue: 1,
      duration: 35000,
      easing: Easing.linear,
      useNativeDriver: useNative,
    });

    const c2Anim = Animated.timing(cloud2Anim, {
      toValue: 1,
      duration: 45000,
      easing: Easing.linear,
      useNativeDriver: useNative,
    });

    const carA = Animated.timing(carAnim, {
      toValue: 1,
      duration: 3200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: useNative,
    });

    logoAnim.start();
    c1Anim.start();
    c2Anim.start();
    carA.start();

    return () => {
      logoAnim.stop();
      c1Anim.stop();
      c2Anim.stop();
      carA.stop();
    };
  }, [reducedMotion, useNative, logoFadeAnim, logoSlideAnim, cloud1Anim, cloud2Anim, carAnim]);

  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) {
        router.replace("/login");
      }
    }, 3200);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const sceneHeight = Math.min(width * 0.75, 400);
  const sceneScale = Math.min(width / 400, sceneHeight / 300);
  const sunCenterY = height * 0.35;

  // Cloud interpolations
  const c1X = cloud1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-150, width + 50],
  });
  const c2X = cloud2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [width + 50, -150],
  });

  // Car interpolations (along the road in viewBox coordinates)
  const carX = carAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20 * sceneScale, 185 * sceneScale],
  });
  const carY = carAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [310 * sceneScale, 195 * sceneScale],
  });
  const carScale = carAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.2 * sceneScale, 0.55 * sceneScale],
  });

  return (
    <View style={styles.container} accessible={false}>
      {/* Background Sky */}
      <View
        style={StyleSheet.absoluteFill}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden={true}
        pointerEvents="none"
      >
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#70C3D3" />
              <Stop offset="60%" stopColor="#A8DCCB" />
              <Stop offset="100%" stopColor="#FDF1B0" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#skyGrad)" />
        </Svg>
      </View>

      {/* Sun Glow */}
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.sunContainer,
          { top: sunCenterY - 150 },
        ]}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden={true}
        pointerEvents="none"
      >
        <Svg width={300} height={300}>
          <Circle cx={150} cy={150} r={120} fill="#FFFBE6" opacity={0.4} />
          <Circle cx={150} cy={150} r={80} fill="#FFF9D2" opacity={0.7} />
          <Circle cx={150} cy={150} r={50} fill="#FFFFFF" opacity={0.9} />
        </Svg>
      </View>

      {/* Clouds & Birds Layer */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden={true}
      >
        <Animated.View
          style={[styles.cloud, { top: height * 0.1, transform: [{ translateX: c1X }] }]}
        >
          <Svg width={120} height={70} viewBox="0 0 100 60">
            <Circle cx={30} cy={30} r={20} fill="#FFFFFF" opacity={0.85} />
            <Circle cx={55} cy={22} r={22} fill="#FFFFFF" opacity={0.85} />
            <Circle cx={75} cy={32} r={16} fill="#FFFFFF" opacity={0.85} />
            <Rect x={30} y={30} width={45} height={18} fill="#FFFFFF" opacity={0.85} />
          </Svg>
        </Animated.View>
        <Animated.View
          style={[styles.cloud, { top: height * 0.25, transform: [{ translateX: c2X }] }]}
        >
          <Svg width={90} height={50} viewBox="0 0 100 60">
            <Circle cx={30} cy={30} r={20} fill="#FFFFFF" opacity={0.7} />
            <Circle cx={50} cy={25} r={25} fill="#FFFFFF" opacity={0.7} />
            <Circle cx={75} cy={32} r={15} fill="#FFFFFF" opacity={0.7} />
            <Rect x={30} y={30} width={45} height={17} fill="#FFFFFF" opacity={0.7} />
          </Svg>
        </Animated.View>
        <Animated.View
          style={[styles.birds, { top: height * 0.18, transform: [{ translateX: c1X }] }]}
        >
          <Svg width={40} height={20} viewBox="0 0 40 20">
            <Path
              d="M 0 10 Q 5 5 10 10 Q 15 5 20 10"
              stroke="#7B8999"
              strokeWidth={1.5}
              fill="none"
              opacity={0.6}
            />
            <Path
              d="M 25 5 Q 30 0 35 5 Q 40 0 45 5"
              stroke="#7B8999"
              strokeWidth={1.5}
              fill="none"
              opacity={0.4}
            />
          </Svg>
        </Animated.View>
      </View>

      {/* Scenery Layer */}
      <View
        style={[styles.sceneryContainer, { height: sceneHeight }]}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden={true}
      >
        <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax meet">
          {/* Back Hill */}
          <Path d="M -50 150 Q 200 70 450 150 L 450 300 L -50 300 Z" fill="#B3E283" opacity={0.9} />

          {/* City Skyline */}
          <G>
            <Rect x={10} y={120} width={25} height={60} fill="#C1D5D9" />
            <Rect x={25} y={80} width={35} height={100} fill="#A8C0C6" />
            <Rect x={32} y={90} width={5} height={80} fill="#FFFFFF" opacity={0.4} />
            <Rect x={40} y={90} width={5} height={80} fill="#FFFFFF" opacity={0.4} />
            <Rect x={48} y={90} width={5} height={80} fill="#FFFFFF" opacity={0.4} />
            <Rect x={38} y={60} width={8} height={20} fill="#A8C0C6" />
            <Rect x={55} y={100} width={30} height={80} fill="#D0DEE1" />
            <Rect x={80} y={130} width={20} height={50} fill="#B6C9CD" />
          </G>

          {/* Barn & Silo */}
          <G>
            {/* Silo */}
            <Rect x={360} y={100} width={22} height={65} fill="#C94C4C" />
            <Path d="M 358 100 Q 371 85 384 100 Z" fill="#A83A3A" />
            {/* Barn Base */}
            <Path d="M 310 165 L 310 125 L 335 105 L 360 125 L 360 165 Z" fill="#D9534F" />
            {/* Barn Roof Edge */}
            <Path d="M 305 125 L 335 102 L 365 125" stroke="#A83A3A" strokeWidth={3} fill="none" />
            {/* Barn Door */}
            <Rect x={325} y={140} width={20} height={25} fill="#F9F0B8" />
            <Path d="M 325 140 L 345 165 M 345 140 L 325 165" stroke="#D9534F" strokeWidth={1.5} />
            {/* Little Cow Abstract */}
            <Rect x={285} y={155} width={14} height={9} rx={3} fill="#FFFFFF" />
            <Circle cx={283} cy={157} r={2.5} fill="#333333" />
            <Circle cx={290} cy={158} r={1.5} fill="#333333" />
            <Circle cx={294} cy={161} r={2} fill="#333333" />
            <Rect x={287} y={163} width={2} height={4} fill="#333333" />
            <Rect x={294} y={163} width={2} height={4} fill="#333333" />
          </G>

          {/* Front Hill */}
          <Path d="M -50 180 Q 200 250 450 160 L 450 300 L -50 300 Z" fill="#92D050" />

          {/* Road */}
          <Path d="M -10 300 Q 100 260 180 190 L 210 190 Q 120 280 40 300 Z" fill="#697C8C" />
          <Path
            d="M 15 300 Q 110 270 195 190"
            stroke="#FFFFFF"
            strokeWidth={1.5}
            strokeDasharray="6 6"
            fill="none"
            opacity={0.7}
          />

          {/* Trees & Flowers */}
          <G>
            <Path d="M 90 170 L 95 150 L 100 170 Z" fill="#367055" />
            <Path d="M 100 175 L 104 155 L 108 175 Z" fill="#2D5C46" />
            <Circle cx={330} cy={200} r={1.5} fill="#FFFFFF" />
            <Circle cx={332} cy={198} r={1} fill="#F9BB55" />
            <Circle cx={350} cy={190} r={1.5} fill="#FFFFFF" />
            <Circle cx={348} cy={192} r={1} fill="#F9BB55" />
            <Circle cx={270} cy={185} r={1.5} fill="#FFFFFF" />
          </G>

          {/* Clinic Centerpiece */}
          <G>
            {/* Shadow Base */}
            <Ellipse cx={200} cy={185} rx={75} ry={12} fill="#4B5D6D" opacity={0.15} />
            {/* Building Base */}
            <Rect x={140} y={130} width={120} height={55} rx={3} fill="#FFFFFF" />
            {/* Roof */}
            <Path d="M 135 130 L 265 130 L 255 115 L 145 115 Z" fill="#0B6DBD" />
            {/* Entrance Box */}
            <Rect x={180} y={145} width={40} height={40} rx={2} fill="#E8F4FD" />
            <Rect x={180} y={145} width={40} height={5} fill="#73B9ED" opacity={0.5} />
            {/* Doors */}
            <Rect x={185} y={155} width={13} height={30} fill="#73B9ED" />
            <Rect x={202} y={155} width={13} height={30} fill="#73B9ED" />
            {/* Windows */}
            <Rect x={152} y={145} width={18} height={18} fill="#BDD6EE" />
            <Rect x={230} y={145} width={18} height={18} fill="#BDD6EE" />
            {/* Medical Cross Sign */}
            <Circle cx={160} cy={115} r={10} fill="#FFFFFF" />
            <Path
              d="M 158 111 h 4 v 3 h 3 v 4 h -3 v 3 h -4 v -3 h -3 v -4 h 3 z"
              fill="#D9001B"
            />
          </G>

        </Svg>
        <Animated.View
          style={[
            styles.car,
            {
              transform: [
                { translateX: carX },
                { translateY: carY },
                { scale: carScale },
              ],
            },
          ]}
        >
          <Svg width={50} height={50} viewBox="-25 -25 50 50">
            <Ellipse cx={0} cy={6} rx={18} ry={4} fill="#4B5D6D" opacity={0.4} />
            <Rect x={-15} y={-10} width={30} height={14} rx={4} fill="#D9001B" />
            <Path d="M -10 -10 L -6 -18 L 6 -18 L 12 -10 Z" fill="#E8F4FD" />
            <Path d="M 0 -18 L 0 -10" stroke="#7B8999" strokeWidth={1} />
            <Circle cx={-8} cy={4} r={4.5} fill="#111111" />
            <Circle cx={8} cy={4} r={4.5} fill="#111111" />
            <Circle cx={-8} cy={4} r={2} fill="#FFFFFF" />
            <Circle cx={8} cy={4} r={2} fill="#FFFFFF" />
            <Rect x={-16} y={-6} width={3} height={5} fill="#FFC107" rx={1} />
            <Rect x={13} y={-6} width={3} height={5} fill="#FFFFFF" opacity={0.8} rx={1} />
          </Svg>
        </Animated.View>
      </View>

      {/* UI Overlay */}
      <View style={styles.overlay} pointerEvents="box-none">
        {/* Logo Text Hero */}
        <Animated.View
          style={[
            styles.heroTextContainer,
            {
              top: sunCenterY - 45,
              opacity: logoFadeAnim,
              transform: [
                {
                  translateY: logoSlideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [30, 0],
                  }),
                },
              ],
            },
          ]}
          accessible={true}
          accessibilityRole="header"
          accessibilityLabel="CARNET by NaviMED"
        >
          <Text style={styles.heroTitle} importantForAccessibility="no">
            CARNET
          </Text>
          <Text style={styles.heroSubtitle} importantForAccessibility="no">
            by NaviMED
          </Text>
        </Animated.View>

        {/* Footer Actions & Status */}
        <View
          style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
          pointerEvents="box-none"
        >
          <Text
            style={styles.statusText}
            accessibilityLiveRegion="polite"
          >
            Starting secure session...
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue to sign in"
            onPress={() => router.replace("/login")}
            style={[
              styles.skipButton,
              { backgroundColor: C.surface, borderColor: C.controlBorder },
            ]}
          >
            <Text style={[styles.skipButtonText, { color: C.primaryDark }]}>
              Continue to sign in
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FDF1B0",
  },
  sunContainer: {
    alignItems: "center",
  },
  cloud: {
    position: "absolute",
    left: 0,
  },
  birds: {
    position: "absolute",
    left: 40,
  },
  sceneryContainer: {
    position: "absolute",
    bottom: 0,
    width: "100%",
  },
  car: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 50,
    height: 50,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTextContainer: {
    position: "absolute",
    width: "100%",
    alignItems: "center",
  },
  heroTitle: {
    fontSize: 56,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 1.5,
    textShadowColor: "rgba(10, 37, 64, 0.15)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  heroSubtitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: "#0B6DBD",
    letterSpacing: 2.5,
    marginTop: -4,
    textShadowColor: "rgba(255, 255, 255, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  statusText: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  skipButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 48,
    minWidth: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  skipButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});