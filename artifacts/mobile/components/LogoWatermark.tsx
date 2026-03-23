import React from "react";
import { Image, StyleSheet, View } from "react-native";

const logo = require("@/assets/images/navimed-logo-watermark.jpeg");

export function LogoWatermark() {
  return (
    <View style={styles.container} pointerEvents="none">
      <Image source={logo} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 0,
    overflow: "hidden",
  },
  image: {
    width: 220,
    height: 220,
    opacity: 0.04,
    marginBottom: 40,
  },
});
