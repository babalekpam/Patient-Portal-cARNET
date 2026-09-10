import React from "react";
import { Dimensions, Image, StyleSheet, View } from "react-native";

const logo = require("@/assets/images/navimed-icon-only.png");

const TILE_SIZE = 120;
const ICON_SIZE = 50;

export function LogoWatermark() {
  const { width, height } = Dimensions.get("window");
  const cols = Math.ceil(width / TILE_SIZE) + 1;
  const rows = Math.ceil(height / TILE_SIZE) + 1;

  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push(
        <View
          key={`${r}-${c}`}
          style={[
            styles.tile,
            {
              left: c * TILE_SIZE + (r % 2 === 1 ? TILE_SIZE / 2 : 0),
              top: r * TILE_SIZE,
            },
          ]}
        >
          <View style={styles.rotateWrap}>
            <Image source={logo} style={styles.icon} resizeMode="contain" />
          </View>
        </View>,
      );
    }
  }

  return (
    <View style={styles.container} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {tiles}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: "hidden",
  },
  tile: {
    position: "absolute",
    width: TILE_SIZE,
    height: TILE_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  rotateWrap: {
    transform: [{ rotate: "-30deg" }],
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    opacity: 0.04,
  },
});
