import { Feather } from "@expo/vector-icons";
import React, { useRef, useEffect } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { Pressable } from "@/components/AccessiblePressable";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";

interface CalendarStripProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markedDates?: string[];
}

function getDaysAround(center: Date, range = 14): Date[] {
  const days: Date[] = [];
  for (let i = -range; i <= range; i++) {
    const d = new Date(center);
    d.setDate(center.getDate() + i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function CalendarStrip({ selectedDate, onSelectDate, markedDates = [] }: CalendarStripProps) {
  const { colors } = useTheme();
  const labels = useAccessibilityLabels();
  const days = getDaysAround(selectedDate);
  const flatRef = useRef<FlatList>(null);
  const markedSet = new Set(markedDates);

  useEffect(() => {
    const idx = days.findIndex((d) => isSameDay(d, selectedDate));
    if (idx >= 0 && flatRef.current) {
      setTimeout(() => {
        flatRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      }, 100);
    }
  }, [selectedDate]);

  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    onSelectDate(today);
  };
  const changeMonth = (offset: number) => {
    const next = new Date(selectedDate);
    next.setMonth(next.getMonth() + offset);
    onSelectDate(next);
  };

  const monthLabel = `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={[styles.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => changeMonth(-1)} accessibilityLabel={labels.previousMonth} style={styles.monthButton}>
            <Feather accessible={false} name="chevron-left" size={20} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => changeMonth(1)} accessibilityLabel={labels.nextMonth} style={styles.monthButton}>
            <Feather accessible={false} name="chevron-right" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={goToToday}
            accessibilityLabel="Go to today"
            style={({ pressed }) => [styles.todayBtn, { backgroundColor: colors.primaryLight }, pressed && { opacity: 0.7 }]}
          >
            <Feather accessible={false} name="calendar" size={14} color={colors.primary} />
            <Text style={[styles.todayText, { color: colors.primary }]}>Today</Text>
          </Pressable>
        </View>
      </View>
      <FlatList
        ref={flatRef}
        data={days}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(d) => toDateKey(d)}
        contentContainerStyle={styles.listContent}
        getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })}
        renderItem={({ item }) => {
          const isSelected = isSameDay(item, selectedDate);
          const isToday = isSameDay(item, new Date());
          const hasEvent = markedSet.has(toDateKey(item));
          return (
            <Pressable
              onPress={() => onSelectDate(item)}
              accessibilityLabel={`${DAY_NAMES[item.getDay()]}, ${MONTH_NAMES[item.getMonth()]} ${item.getDate()}, ${item.getFullYear()}${hasEvent ? ", has event" : ""}`}
              accessibilityState={{ selected: isSelected }}
              style={[
                styles.dayCell,
                { backgroundColor: isSelected ? colors.primary : "transparent" },
                isToday && !isSelected && { borderColor: colors.primary, borderWidth: 1.5 },
              ]}
            >
              <Text style={[styles.dayName, { color: isSelected ? colors.onPrimary : colors.textTertiary }]}>
                {DAY_NAMES[item.getDay()]}
              </Text>
              <Text style={[styles.dayNumber, { color: isSelected ? colors.onPrimary : colors.text }]}>
                {item.getDate()}
              </Text>
              {hasEvent ? (
                <View style={[styles.dot, { backgroundColor: isSelected ? colors.onPrimary : colors.primary }]} />
              ) : (
                <View style={styles.dotSpacer} />
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    gap: 4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  monthButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    flexShrink: 1,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  todayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  todayText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  listContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  dayCell: {
    width: 56,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 16,
    gap: 4,
  },
  dayName: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
  },
  dayNumber: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotSpacer: {
    width: 6,
    height: 6,
  },
});
