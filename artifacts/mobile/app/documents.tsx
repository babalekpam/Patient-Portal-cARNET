import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
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

const DOC_STORAGE_KEY = "scanned_documents";

interface ScannedDocument {
  id: string;
  name: string;
  category: string;
  imageUri: string;
  createdAt: string;
}

const CATEGORIES = [
  { key: "insurance", icon: "shield" as const, label: "Insurance Card" },
  { key: "prescription", icon: "file-text" as const, label: "Prescription" },
  { key: "labReport", icon: "bar-chart-2" as const, label: "Lab Report" },
  { key: "referral", icon: "send" as const, label: "Referral" },
  { key: "other", icon: "file" as const, label: "Other" },
];

export default function DocumentsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [docName, setDocName] = useState("");
  const [capturedUri, setCapturedUri] = useState("");
  const [viewDoc, setViewDoc] = useState<ScannedDocument | null>(null);

  const loadDocs = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(DOC_STORAGE_KEY);
      if (stored) setDocuments(JSON.parse(stored));
    } catch { setDocuments([]); }
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const saveDocs = async (docs: ScannedDocument[]) => {
    setDocuments(docs);
    await AsyncStorage.setItem(DOC_STORAGE_KEY, JSON.stringify(docs));
  };

  const handleCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("error"), t("cameraPermissionRequired"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri);
      setShowAddModal(true);
    }
  };

  const handlePickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("error"), t("galleryPermissionRequired"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri);
      setShowAddModal(true);
    }
  };

  const handleSave = async () => {
    if (!capturedUri || !selectedCategory) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newDoc: ScannedDocument = {
      id: Date.now().toString(),
      name: docName || CATEGORIES.find((c) => c.key === selectedCategory)?.label || "Document",
      category: selectedCategory,
      imageUri: capturedUri,
      createdAt: new Date().toISOString(),
    };
    await saveDocs([newDoc, ...documents]);
    setShowAddModal(false);
    setCapturedUri("");
    setDocName("");
    setSelectedCategory("");
  };

  const handleDelete = (id: string) => {
    Alert.alert(t("removeDocument"), t("removeDocumentConfirm"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("remove"), style: "destructive", onPress: async () => { await saveDocs(documents.filter((d) => d.id !== id)); } },
    ]);
  };

  const formatDate = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return dateStr; }
  };

  const getCategoryIcon = (cat: string) => CATEGORIES.find((c) => c.key === cat)?.icon || "file";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title={t("documents")} subtitle={documents.length > 0 ? `${documents.length} ${t("documentsSaved")}` : undefined} rightIcon="plus" onRightPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleCapture(); }} />

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <AnimatedCard index={Math.min(index, 8)}>
            <Pressable
              style={[styles.docCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
              onPress={() => setViewDoc(item)}
            >
              <Image source={{ uri: item.imageUri }} style={styles.docThumb} />
              <View style={styles.docInfo}>
                <View style={styles.docHeader}>
                  <Feather name={getCategoryIcon(item.category) as any} size={16} color={colors.primary} />
                  <Text style={[styles.docName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                </View>
                <Text style={[styles.docCategory, { color: colors.textSecondary }]}>
                  {CATEGORIES.find((c) => c.key === item.category)?.label || item.category}
                </Text>
                <Text style={[styles.docDate, { color: colors.textTertiary }]}>{formatDate(item.createdAt)}</Text>
              </View>
              <Pressable style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
                <Feather name="trash-2" size={18} color={colors.danger} />
              </Pressable>
            </Pressable>
          </AnimatedCard>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadDocs} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}>
              <Feather name="camera" size={36} color={colors.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("noDocuments")}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("noDocumentsText")}</Text>
            <View style={styles.addBtnsRow}>
              <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={handleCapture}>
                <Feather name="camera" size={18} color="#fff" />
                <Text style={styles.addBtnText}>{t("scanDocument")}</Text>
              </Pressable>
              <Pressable style={[styles.addBtn, { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border }]} onPress={handlePickFromGallery}>
                <Feather name="image" size={18} color={colors.text} />
                <Text style={[styles.addBtnTextAlt, { color: colors.text }]}>{t("fromGallery")}</Text>
              </Pressable>
            </View>
          </View>
        }
      />

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t("saveDocument")}</Text>
              <Pressable onPress={() => { setShowAddModal(false); setCapturedUri(""); }}>
                <Feather name="x" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            {capturedUri ? <Image source={{ uri: capturedUri }} style={styles.preview} /> : null}
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]}
              placeholder={t("documentName")}
              placeholderTextColor={colors.textTertiary}
              value={docName}
              onChangeText={setDocName}
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t("category")}</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.key}
                  style={[styles.catChip, { backgroundColor: selectedCategory === cat.key ? colors.primaryLight : colors.surfaceSecondary, borderColor: selectedCategory === cat.key ? colors.primary : colors.border }]}
                  onPress={() => setSelectedCategory(cat.key)}
                >
                  <Feather name={cat.icon} size={14} color={selectedCategory === cat.key ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.catText, { color: selectedCategory === cat.key ? colors.primary : colors.textSecondary }]}>{cat.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.saveBtn, { backgroundColor: selectedCategory ? colors.primary : colors.borderLight }]}
              disabled={!selectedCategory}
              onPress={handleSave}
            >
              <Text style={[styles.saveBtnText, { color: selectedCategory ? "#fff" : colors.textTertiary }]}>{t("saveDocument")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewDoc} animationType="fade" transparent>
        <Pressable style={styles.viewOverlay} onPress={() => setViewDoc(null)}>
          <View style={[styles.viewContainer, { backgroundColor: colors.surface }]}>
            {viewDoc && <Image source={{ uri: viewDoc.imageUri }} style={styles.viewImage} resizeMode="contain" />}
            <Text style={[styles.viewName, { color: colors.text }]}>{viewDoc?.name}</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  docCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  docThumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: "#e5e7eb" },
  docInfo: { flex: 1, gap: 3 },
  docHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  docName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  docCategory: { fontSize: 13, fontFamily: "Inter_400Regular" },
  docDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  deleteBtn: { padding: 8 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32 },
  addBtnsRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  addBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  addBtnTextAlt: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  preview: { width: "100%", height: 180, borderRadius: 12, backgroundColor: "#e5e7eb" },
  input: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular", borderWidth: 1 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  catText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  saveBtn: { padding: 16, borderRadius: 14, alignItems: "center" },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  viewOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.8)", padding: 20 },
  viewContainer: { borderRadius: 16, padding: 16, width: "100%", alignItems: "center", gap: 12 },
  viewImage: { width: "100%", height: 400, borderRadius: 12 },
  viewName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
