import { Feather } from "@expo/vector-icons";
import { impactLight, impactMedium, impactHeavy, notificationSuccess, notificationError, selectionClick } from "@/lib/haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AnimatedCard } from "@/components/AnimatedCard";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";

const FAMILY_KEY = "family_members";

interface FamilyMember {
  id: string;
  firstName: string;
  lastName: string;
  relationship: string;
  dateOfBirth: string;
  bloodType: string;
  allergies: string;
  medications: string;
  notes: string;
}

const RELATIONSHIPS = ["Child", "Spouse", "Parent", "Sibling", "Grandparent", "Other"];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];

export default function FamilyScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FamilyMember | null>(null);
  const [form, setForm] = useState<Partial<FamilyMember>>({});
  const [viewMember, setViewMember] = useState<FamilyMember | null>(null);

  const load = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(FAMILY_KEY);
      if (stored) setMembers(JSON.parse(stored));
    } catch { setMembers([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (list: FamilyMember[]) => {
    setMembers(list);
    await AsyncStorage.setItem(FAMILY_KEY, JSON.stringify(list));
  };

  const openAdd = () => {
    setEditing(null);
    setForm({});
    setShowModal(true);
  };

  const openEdit = (m: FamilyMember) => {
    setEditing(m);
    setForm(m);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.firstName || !form.relationship) return;
    impactMedium();
    if (editing) {
      const updated = members.map((m) => m.id === editing.id ? { ...m, ...form } as FamilyMember : m);
      await save(updated);
    } else {
      const newMember: FamilyMember = {
        id: Date.now().toString(),
        firstName: form.firstName || "",
        lastName: form.lastName || "",
        relationship: form.relationship || "",
        dateOfBirth: form.dateOfBirth || "",
        bloodType: form.bloodType || "",
        allergies: form.allergies || "",
        medications: form.medications || "",
        notes: form.notes || "",
      };
      await save([...members, newMember]);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert(t("removeFamilyMember"), t("removeFamilyConfirm"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("remove"), style: "destructive", onPress: async () => { await save(members.filter((m) => m.id !== id)); setViewMember(null); } },
    ]);
  };

  const getInitials = (m: FamilyMember) => `${m.firstName.charAt(0)}${m.lastName.charAt(0)}`.toUpperCase() || "?";
  const getRelColor = (r: string) => {
    const map: Record<string, string> = { Child: "#7c3aed", Spouse: "#dc2626", Parent: "#059669", Sibling: "#d97706", Grandparent: "#1a6fbf", Other: "#6b7280" };
    return map[r] || "#6b7280";
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title={t("familyMembers")} subtitle={members.length > 0 ? `${members.length} ${t("members")}` : undefined} rightIcon="user-plus" onRightPress={openAdd} />

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <AnimatedCard index={Math.min(index, 8)}>
            <Pressable
              style={[styles.memberCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
              onPress={() => setViewMember(item)}
            >
              <View style={[styles.avatar, { backgroundColor: getRelColor(item.relationship) + "20" }]}>
                <Text style={[styles.avatarText, { color: getRelColor(item.relationship) }]}>{getInitials(item)}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={[styles.memberName, { color: colors.text }]}>{item.firstName} {item.lastName}</Text>
                <View style={[styles.relBadge, { backgroundColor: getRelColor(item.relationship) + "15" }]}>
                  <Text style={[styles.relText, { color: getRelColor(item.relationship) }]}>{item.relationship}</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textTertiary} />
            </Pressable>
          </AnimatedCard>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}>
              <Feather name="users" size={36} color={colors.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("noFamilyMembers")}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("noFamilyText")}</Text>
            <Pressable style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
              <Feather name="user-plus" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>{t("addFamilyMember")}</Text>
            </Pressable>
          </View>
        }
      />

      <Modal visible={!!viewMember} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            {viewMember && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{viewMember.firstName} {viewMember.lastName}</Text>
                  <Pressable onPress={() => setViewMember(null)}>
                    <Feather name="x" size={24} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <View style={[styles.detailRow, { borderBottomColor: colors.borderLight }]}>
                  <Text style={[styles.detailLabel, { color: colors.textTertiary }]}>{t("relationship")}</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{viewMember.relationship}</Text>
                </View>
                {viewMember.dateOfBirth ? <View style={[styles.detailRow, { borderBottomColor: colors.borderLight }]}><Text style={[styles.detailLabel, { color: colors.textTertiary }]}>{t("dateOfBirth")}</Text><Text style={[styles.detailValue, { color: colors.text }]}>{viewMember.dateOfBirth}</Text></View> : null}
                {viewMember.bloodType ? <View style={[styles.detailRow, { borderBottomColor: colors.borderLight }]}><Text style={[styles.detailLabel, { color: colors.textTertiary }]}>{t("bloodType")}</Text><Text style={[styles.detailValue, { color: colors.text }]}>{viewMember.bloodType}</Text></View> : null}
                {viewMember.allergies ? <View style={[styles.detailRow, { borderBottomColor: colors.borderLight }]}><Text style={[styles.detailLabel, { color: colors.textTertiary }]}>{t("allergies")}</Text><Text style={[styles.detailValue, { color: colors.text }]}>{viewMember.allergies}</Text></View> : null}
                {viewMember.medications ? <View style={[styles.detailRow, { borderBottomColor: colors.borderLight }]}><Text style={[styles.detailLabel, { color: colors.textTertiary }]}>{t("medications")}</Text><Text style={[styles.detailValue, { color: colors.text }]}>{viewMember.medications}</Text></View> : null}
                {viewMember.notes ? <View style={[styles.detailRow, { borderBottomColor: colors.borderLight }]}><Text style={[styles.detailLabel, { color: colors.textTertiary }]}>{t("notes")}</Text><Text style={[styles.detailValue, { color: colors.text }]}>{viewMember.notes}</Text></View> : null}
                <View style={styles.actionRow}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: colors.primaryLight }]} onPress={() => { setViewMember(null); openEdit(viewMember); }}>
                    <Feather name="edit-2" size={16} color={colors.primary} />
                    <Text style={[styles.actionBtnText, { color: colors.primary }]}>{t("editProfile")}</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, { backgroundColor: colors.dangerLight }]} onPress={() => handleDelete(viewMember.id)}>
                    <Feather name="trash-2" size={16} color={colors.danger} />
                    <Text style={[styles.actionBtnText, { color: colors.danger }]}>{t("remove")}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{editing ? t("editFamilyMember") : t("addFamilyMember")}</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <Feather name="x" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]} placeholder={t("firstName") + " *"} placeholderTextColor={colors.textTertiary} value={form.firstName || ""} onChangeText={(v) => setForm({ ...form, firstName: v })} />
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]} placeholder={t("lastName")} placeholderTextColor={colors.textTertiary} value={form.lastName || ""} onChangeText={(v) => setForm({ ...form, lastName: v })} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>{t("relationship")} *</Text>
            <View style={styles.chipsRow}>
              {RELATIONSHIPS.map((r) => (
                <Pressable key={r} style={[styles.chip, { backgroundColor: form.relationship === r ? colors.primaryLight : colors.surfaceSecondary, borderColor: form.relationship === r ? colors.primary : colors.border }]} onPress={() => setForm({ ...form, relationship: r })}>
                  <Text style={[styles.chipText, { color: form.relationship === r ? colors.primary : colors.textSecondary }]}>{r}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]} placeholder={t("dateOfBirth") + " (MM/DD/YYYY)"} placeholderTextColor={colors.textTertiary} value={form.dateOfBirth || ""} onChangeText={(v) => setForm({ ...form, dateOfBirth: v })} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>{t("bloodType")}</Text>
            <View style={styles.chipsRow}>
              {BLOOD_TYPES.map((bt) => (
                <Pressable key={bt} style={[styles.chip, { backgroundColor: form.bloodType === bt ? colors.primaryLight : colors.surfaceSecondary, borderColor: form.bloodType === bt ? colors.primary : colors.border }]} onPress={() => setForm({ ...form, bloodType: bt })}>
                  <Text style={[styles.chipText, { color: form.bloodType === bt ? colors.primary : colors.textSecondary }]}>{bt}</Text>
                </Pressable>
              ))}
            </View>

            <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]} placeholder={t("allergies")} placeholderTextColor={colors.textTertiary} value={form.allergies || ""} onChangeText={(v) => setForm({ ...form, allergies: v })} />
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]} placeholder={t("medications")} placeholderTextColor={colors.textTertiary} value={form.medications || ""} onChangeText={(v) => setForm({ ...form, medications: v })} />
            <TextInput style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]} placeholder={t("notes")} placeholderTextColor={colors.textTertiary} value={form.notes || ""} onChangeText={(v) => setForm({ ...form, notes: v })} multiline />

            <Pressable style={[styles.saveBtn, { backgroundColor: form.firstName && form.relationship ? colors.primary : colors.borderLight }]} disabled={!form.firstName || !form.relationship} onPress={handleSave}>
              <Text style={[styles.saveBtnText, { color: form.firstName && form.relationship ? "#fff" : colors.textTertiary }]}>{editing ? t("saveChanges") : t("addFamilyMember")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  memberCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  memberInfo: { flex: 1, gap: 4 },
  memberName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  relBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  relText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32 },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, marginTop: 8 },
  primaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  input: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular", borderWidth: 1 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  saveBtn: { padding: 16, borderRadius: 14, alignItems: "center" },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1 },
  detailLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  detailValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "right" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, borderRadius: 12 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
