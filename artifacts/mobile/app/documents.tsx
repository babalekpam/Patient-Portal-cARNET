import { Feather } from "@expo/vector-icons";
import { impactLight, impactMedium, impactHeavy, notificationSuccess, notificationError, selectionClick } from "@/lib/haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Pressable } from "@/components/AccessiblePressable";
import { Modal } from "@/components/AccessibleModal";
import { useAccessibilityLabels } from "@/lib/accessibilityLabels";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AnimatedCard } from "@/components/AnimatedCard";
import { useTheme } from "@/context/ThemeContext";
import { useI18n } from "@/lib/i18n";
import { LogoWatermark } from "@/components/LogoWatermark";
import {
  assertPatientDataEpoch,
  capturePatientDataEpoch,
  getSecureItem,
  isPatientDataEpochCurrent,
  registerSecureCleanup,
  setSecureItem,
  subscribeToPatientDataClear,
} from "@/lib/secureStorage";
import { confirmAppAction, showAppAlert } from "@/lib/privacyAlerts";

const DOC_STORAGE_KEY = "scanned_documents";

interface ScannedDocument {
  id: string;
  name: string;
  category: string;
  createdAt: string;
}

const sessionPreviews = new Map<string, string>();
const appOwnedTemporaryUris = new Set<string>();

function isAppOwnedCacheUri(uri: string): boolean {
  if (!FileSystem.cacheDirectory) return false;
  const pickerRoot = `${FileSystem.cacheDirectory.replace(/\/+$/, "")}/ImagePicker/`;
  if (!uri.startsWith(pickerRoot)) return false;
  const basename = uri.slice(pickerRoot.length);
  if (
    !basename ||
    basename === "." ||
    basename === ".." ||
    basename.includes("/") ||
    basename.includes("\\") ||
    basename.includes("?") ||
    basename.includes("#")
  ) return false;
  try {
    const decoded = decodeURIComponent(basename);
    return decoded === basename && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(basename);
  } catch {
    return false;
  }
}

async function removeAppOwnedTemporaryFile(uri: string) {
  if (!isAppOwnedCacheUri(uri)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
  appOwnedTemporaryUris.delete(uri);
}

registerSecureCleanup(async () => {
  sessionPreviews.clear();
  const files = Array.from(appOwnedTemporaryUris).filter(isAppOwnedCacheUri);
  await Promise.all(files.map((uri) => removeAppOwnedTemporaryFile(uri)));
});

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
  const a11y = useAccessibilityLabels();
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [docName, setDocName] = useState("");
  const [capturedUri, setCapturedUri] = useState("");
  const [capturedPreview, setCapturedPreview] = useState("");
  const [viewDoc, setViewDoc] = useState<ScannedDocument | null>(null);

  const loadDocs = useCallback(async () => {
    const expectedEpoch = capturePatientDataEpoch();
    try {
      const stored = await getSecureItem(DOC_STORAGE_KEY);
      await AsyncStorage.removeItem(DOC_STORAGE_KEY).catch(() => {});
      assertPatientDataEpoch(expectedEpoch);
      if (stored) {
        const parsed = JSON.parse(stored) as Array<ScannedDocument & { imageUri?: string }>;
        parsed.forEach((doc) => {
          if (doc.imageUri && isAppOwnedCacheUri(doc.imageUri)) {
            appOwnedTemporaryUris.add(doc.imageUri);
            removeAppOwnedTemporaryFile(doc.imageUri).catch(() => {});
          }
        });
        setDocuments(parsed.map(({ imageUri: _legacyUri, ...metadata }) => metadata));
      }
    } catch {
      if (!isPatientDataEpochCurrent(expectedEpoch)) return;
      setDocuments([]);
      showAppAlert(t("error"), "CARNET could not load document metadata from secure storage.");
    }
  }, [t]);

  useEffect(() => { loadDocs(); }, [loadDocs]);
  useEffect(() => subscribeToPatientDataClear(() => {
    sessionPreviews.clear();
    setDocuments([]);
    setViewDoc(null);
    setShowAddModal(false);
    setCapturedUri("");
    setCapturedPreview("");
    setDocName("");
    setSelectedCategory("");
  }), []);

  const saveDocs = async (docs: ScannedDocument[]) => {
    await setSecureItem(DOC_STORAGE_KEY, JSON.stringify(docs));
    await AsyncStorage.removeItem(DOC_STORAGE_KEY).catch(() => {});
  };

  const prepareAsset = async (asset: ImagePicker.ImagePickerAsset, expectedEpoch: number) => {
    const safePickerCopy = isAppOwnedCacheUri(asset.uri);
    if (safePickerCopy) appOwnedTemporaryUris.add(asset.uri);
    try {
      assertPatientDataEpoch(expectedEpoch);
    } catch {
      if (safePickerCopy) await removeAppOwnedTemporaryFile(asset.uri).catch(() => {});
      return;
    }
    if (!asset.base64) {
      if (safePickerCopy) await removeAppOwnedTemporaryFile(asset.uri).catch(() => {});
      showAppAlert(t("error"), "This image could not be loaded safely. No document was saved.");
      return;
    }
    const preview = `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`;
    if (safePickerCopy) {
      try {
        await removeAppOwnedTemporaryFile(asset.uri);
      } catch {
        showAppAlert(t("error"), "The temporary image could not be removed safely. No document was saved.");
        return;
      }
    }
    try { assertPatientDataEpoch(expectedEpoch); } catch { return; }
    setCapturedUri("");
    setCapturedPreview(preview);
    setShowAddModal(true);
  };

  const handleCapture = async () => {
    const expectedEpoch = capturePatientDataEpoch();
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      assertPatientDataEpoch(expectedEpoch);
      if (status !== "granted") {
        showAppAlert(t("error"), t("cameraPermissionRequired"));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
        base64: true,
      });
      try { assertPatientDataEpoch(expectedEpoch); } catch {
        if (!result.canceled && result.assets[0] && isAppOwnedCacheUri(result.assets[0].uri)) {
          appOwnedTemporaryUris.add(result.assets[0].uri);
          await removeAppOwnedTemporaryFile(result.assets[0].uri).catch(() => {});
        }
        return;
      }
      if (!result.canceled && result.assets[0]) await prepareAsset(result.assets[0], expectedEpoch);
    } catch {
      if (isPatientDataEpochCurrent(expectedEpoch)) {
        showAppAlert(t("error"), "The camera could not be opened. No document was saved.");
      }
    }
  };

  const handlePickFromGallery = async () => {
    const expectedEpoch = capturePatientDataEpoch();
    try {
      // Android's system picker grants access only to the selected image.
      if (Platform.OS !== "android") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        assertPatientDataEpoch(expectedEpoch);
        if (status !== "granted") {
          showAppAlert(t("error"), t("galleryPermissionRequired"));
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        legacy: false,
        quality: 0.8,
        allowsEditing: true,
        aspect: [4, 3],
        base64: true,
      });
      try { assertPatientDataEpoch(expectedEpoch); } catch {
        if (!result.canceled && result.assets[0] && isAppOwnedCacheUri(result.assets[0].uri)) {
          appOwnedTemporaryUris.add(result.assets[0].uri);
          await removeAppOwnedTemporaryFile(result.assets[0].uri).catch(() => {});
        }
        return;
      }
      if (!result.canceled && result.assets[0]) await prepareAsset(result.assets[0], expectedEpoch);
    } catch {
      if (isPatientDataEpochCurrent(expectedEpoch)) {
        showAppAlert(t("error"), "The photo library could not be opened. No document was saved.");
      }
    }
  };

  const handleSave = async () => {
    if (!capturedPreview || !selectedCategory) return;
    impactMedium();
    const expectedEpoch = capturePatientDataEpoch();
    const newDoc: ScannedDocument = {
      id: Date.now().toString(),
      name: docName || CATEGORIES.find((c) => c.key === selectedCategory)?.label || "Document",
      category: selectedCategory,
      createdAt: new Date().toISOString(),
    };
    try {
      const updated = [newDoc, ...documents];
      await saveDocs(updated);
      assertPatientDataEpoch(expectedEpoch);
      sessionPreviews.set(newDoc.id, capturedPreview);
      setDocuments(updated);
      setShowAddModal(false);
      setCapturedUri("");
      setCapturedPreview("");
      setDocName("");
      setSelectedCategory("");
    } catch {
      if (!isPatientDataEpochCurrent(expectedEpoch)) return;
      notificationError();
      showAppAlert(t("error"), "Document metadata could not be saved securely. Your photo was not retained.");
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAppAction(t("removeDocument"), t("removeDocumentConfirm"), t("remove"), t("cancel"), true);
    if (!confirmed) return;
    const expectedEpoch = capturePatientDataEpoch();
    try {
      const updated = documents.filter((d) => d.id !== id);
      await saveDocs(updated);
      assertPatientDataEpoch(expectedEpoch);
      sessionPreviews.delete(id);
      setDocuments(updated);
      setViewDoc(null);
    } catch {
      if (!isPatientDataEpochCurrent(expectedEpoch)) return;
      showAppAlert(t("error"), "The document could not be removed from secure storage.");
    }
  };

  const formatDate = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return dateStr; }
  };

  const getCategoryIcon = (cat: string) => CATEGORIES.find((c) => c.key === cat)?.icon || "file";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LogoWatermark />
      <ScreenHeader title={t("documents")} subtitle={documents.length > 0 ? `${documents.length} ${t("documentsSaved")}` : undefined} rightIcon="plus" onRightPress={() => { impactLight(); handleCapture(); }} />

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <AnimatedCard index={Math.min(index, 8)}>
            <View style={[styles.docCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
              <Pressable
                style={styles.docOpenButton}
                onPress={() => setViewDoc(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${CATEGORIES.find((c) => c.key === item.category)?.label || item.category}, ${formatDate(item.createdAt)}`}
              >
              {sessionPreviews.get(item.id) ? (
                <Image source={{ uri: sessionPreviews.get(item.id) }} style={styles.docThumb} />
              ) : (
                <View style={[styles.docThumb, styles.previewUnavailable, { backgroundColor: colors.surfaceSecondary }]}>
                  <Feather name="image" size={20} color={colors.textTertiary} />
                </View>
              )}
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
              </Pressable>
              <Pressable style={styles.deleteBtn} onPress={() => handleDelete(item.id)} accessibilityRole="button" accessibilityLabel={`${t("removeDocument")}: ${item.name}`}>
                <Feather name="trash-2" size={18} color={colors.danger} />
              </Pressable>
            </View>
          </AnimatedCard>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadDocs} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={[styles.noticeCard, { backgroundColor: colors.infoLight }]}>
            <Feather name="shield" size={16} color={colors.info} />
            <Text style={[styles.noticeText, { color: colors.info }]}>
              Photos are available as in-memory previews for this session only. Only document names, categories, and dates are saved.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}>
              <Feather name="camera" size={36} color={colors.textTertiary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t("noDocuments")}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t("noDocumentsText")}</Text>
            <Text style={[styles.sessionNotice, { color: colors.textTertiary }]}>
              Photos are previewed in memory for this session only. CARNET saves document metadata, not the photo.
            </Text>
            <View style={styles.addBtnsRow}>
              <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={handleCapture} accessibilityRole="button">
                <Feather name="camera" size={18} color={colors.onPrimary} />
                <Text style={[styles.addBtnText, { color: colors.onPrimary }]}>{t("scanDocument")}</Text>
              </Pressable>
              <Pressable style={[styles.addBtn, { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.controlBorder }]} onPress={handlePickFromGallery} accessibilityRole="button">
                <Feather name="image" size={18} color={colors.text} />
                <Text style={[styles.addBtnTextAlt, { color: colors.text }]}>{t("fromGallery")}</Text>
              </Pressable>
            </View>
          </View>
        }
      />

      <Modal visible={showAddModal} animationType="slide" transparent accessibilityLabel={t("saveDocument")} onRequestClose={() => {
        if (capturedUri) removeAppOwnedTemporaryFile(capturedUri);
        setShowAddModal(false);
        setCapturedUri("");
        setCapturedPreview("");
      }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t("saveDocument")}</Text>
              <Pressable onPress={() => {
                if (capturedUri) removeAppOwnedTemporaryFile(capturedUri);
                setShowAddModal(false);
                setCapturedUri("");
                setCapturedPreview("");
              }} accessibilityRole="button" accessibilityLabel={a11y.closeDialog}>
                <Feather name="x" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            {capturedPreview ? <Image source={{ uri: capturedPreview }} style={styles.preview} /> : null}
            <Text style={[styles.sessionNotice, { color: colors.textTertiary }]}>
              Session-only preview: the photo itself is not saved by CARNET.
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.controlBorder }]}
              placeholder={t("documentName")}
              placeholderTextColor={colors.textTertiary}
              value={docName}
              onChangeText={setDocName}
              accessibilityLabel={t("documentName")}
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>{t("category")}</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.key}
                  style={[styles.catChip, { backgroundColor: selectedCategory === cat.key ? colors.primaryLight : colors.surfaceSecondary, borderColor: selectedCategory === cat.key ? colors.primary : colors.border }]}
                  onPress={() => setSelectedCategory(cat.key)}
                  accessibilityRole="radio"
                  accessibilityLabel={cat.label}
                  accessibilityState={{ checked: selectedCategory === cat.key }}
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
              accessibilityRole="button"
              accessibilityState={{ disabled: !selectedCategory }}
            >
              <Text style={[styles.saveBtnText, { color: selectedCategory ? colors.onPrimary : colors.textTertiary }]}>{t("saveDocument")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewDoc} animationType="fade" transparent accessibilityLabel={viewDoc ? viewDoc.name : t("documents")} onRequestClose={() => setViewDoc(null)}>
        <Pressable style={styles.viewOverlay} onPress={() => setViewDoc(null)} accessible={false} focusable={false}>
          <View style={[styles.viewContainer, { backgroundColor: colors.surface }]}>
            {viewDoc && sessionPreviews.get(viewDoc.id) ? (
              <Image source={{ uri: sessionPreviews.get(viewDoc.id) }} style={styles.viewImage} resizeMode="contain" />
            ) : (
              <View style={[styles.viewImage, styles.previewUnavailable, { backgroundColor: colors.surfaceSecondary }]}>
                <Feather name="eye-off" size={32} color={colors.textTertiary} />
                <Text style={[styles.sessionNotice, { color: colors.textSecondary }]}>Preview ended with the prior session.</Text>
              </View>
            )}
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
  noticeCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 12, marginBottom: 4 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  docCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  docOpenButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  docThumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: "#e5e7eb" },
  previewUnavailable: { alignItems: "center", justifyContent: "center", gap: 8 },
  sessionNotice: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, textAlign: "center" },
  docInfo: { flex: 1, gap: 3 },
  docHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  docName: { fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  docCategory: { fontSize: 13, fontFamily: "Inter_400Regular" },
  docDate: { fontSize: 12, fontFamily: "Inter_400Regular" },
  deleteBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32 },
  addBtnsRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  addBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  addBtnTextAlt: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  preview: { width: "100%", height: 180, borderRadius: 12, backgroundColor: "#e5e7eb" },
  input: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Inter_400Regular", borderWidth: 1 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 44, borderRadius: 10, borderWidth: 1 },
  catText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  saveBtn: { padding: 16, borderRadius: 14, alignItems: "center" },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  viewOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.8)", padding: 20 },
  viewContainer: { borderRadius: 16, padding: 16, width: "100%", alignItems: "center", gap: 12 },
  viewImage: { width: "100%", height: 400, borderRadius: 12 },
  viewName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
