import React, { useEffect, useRef } from "react";
import { Animated, type ViewStyle } from "react-native";
import { useReducedMotion } from "@/lib/useReducedMotion";

interface AnimatedCardProps {
  index: number;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export function AnimatedCard({ index, children, style }: AnimatedCardProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const didEnter = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    if (didEnter.current) return;
    didEnter.current = true;
    const delay = Math.min(index * 80, 600);
    // Cards stay visible to assistive technology while animating position only.
    translateY.setValue(12);
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [index, opacity, translateY, reducedMotion]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
