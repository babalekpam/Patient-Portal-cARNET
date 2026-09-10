import { usePathname } from "expo-router";
import React, { useEffect } from "react";
import { Platform, View } from "react-native";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/context/ThemeContext";

export function AccessibilityRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { language } = useI18n();
  const labels = useAccessibilityLabels();
  const { colors } = useTheme();

  useEffect(() => {
    if (Platform.OS !== "web") return;
    document.documentElement.lang = language;
    document.title = "CARNET";
    const announcement = document.getElementById("route-announcement");
    if (announcement) {
      announcement.textContent = "";
      window.requestAnimationFrame(() => {
        announcement.textContent = labels.mainContent;
      });
    }
    const frame = window.requestAnimationFrame(() => {
      const main = document.getElementById("main-content");
      const headings = main?.querySelectorAll<HTMLElement>('[role="heading"], h1, h2') ?? [];
      const heading = Array.from(headings).find((element) =>
        element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true"
      );
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      } else {
        main?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [labels.mainContent, language, pathname]);

  if (Platform.OS === "web") {
    return (
      <>
        {React.createElement("style", { children: `
          .a11y-skip-link { position:absolute; left:8px; top:-60px; z-index:9999; padding:12px 16px; background:#fff; color:#102a43; border:2px solid #005fcc; border-radius:6px; }
          .a11y-skip-link:focus { top:8px; }
          *:focus-visible { outline:3px solid ${colors.focusRing} !important; outline-offset:3px; }
          @media (forced-colors: active) { *:focus-visible { outline:3px solid Highlight !important; } }
          @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration:.01ms !important; transition-duration:.01ms !important; scroll-behavior:auto !important; } }
        ` }) as any}
        {React.createElement("a", { className: "a11y-skip-link", href: "#main-content" }, labels.skipToContent)}
        {React.createElement("div", { id: "route-announcement", "aria-live": "polite", "aria-atomic": "true", style: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } })}
        <View nativeID="main-content" accessible={false} {...({ role: "main", tabIndex: -1 } as any)} style={{ flex: 1 }}>
          {children}
        </View>
      </>
    );
  }
  return <View style={{ flex: 1 }}>{children}</View>;
}