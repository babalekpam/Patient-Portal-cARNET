import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "offline_cache_";
const PENDING_QUEUE_KEY = "offline_pending_queue";

interface CachedData {
  data: any;
  timestamp: number;
  key: string;
}

interface PendingAction {
  id: string;
  type: string;
  endpoint: string;
  method: string;
  body?: any;
  createdAt: string;
}

export async function isOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch("https://www.navimedi.org/api/health", {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export function subscribeToConnectivity(callback: (isConnected: boolean) => void) {
  let interval: ReturnType<typeof setInterval>;
  let lastState: boolean | null = null;

  const check = async () => {
    const online = await isOnline();
    if (online !== lastState) {
      lastState = online;
      callback(online);
    }
  };

  check();
  interval = setInterval(check, 30000);

  return () => clearInterval(interval);
}

export async function cacheData(key: string, data: any): Promise<void> {
  const cached: CachedData = { data, timestamp: Date.now(), key };
  await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cached));
}

export async function getCachedData<T>(key: string, maxAgeMs?: number): Promise<T | null> {
  const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
  if (!raw) return null;
  const cached: CachedData = JSON.parse(raw);
  if (maxAgeMs && Date.now() - cached.timestamp > maxAgeMs) return null;
  return cached.data as T;
}

export async function clearCache(key: string): Promise<void> {
  await AsyncStorage.removeItem(CACHE_PREFIX + key);
}

export async function addPendingAction(action: Omit<PendingAction, "id" | "createdAt">): Promise<void> {
  const queue = await getPendingActions();
  queue.push({
    ...action,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const raw = await AsyncStorage.getItem(PENDING_QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function removePendingAction(id: string): Promise<void> {
  const queue = await getPendingActions();
  await AsyncStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue.filter((a) => a.id !== id)));
}

export async function clearPendingActions(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_QUEUE_KEY);
}

export async function cacheEssentialData(apiCall: (endpoint: string) => Promise<any>): Promise<void> {
  const endpoints = ["prescriptions", "appointments", "labResults", "messages"];
  for (const endpoint of endpoints) {
    try {
      const data = await apiCall(endpoint);
      if (data) await cacheData(endpoint, data);
    } catch {}
  }
}

export async function getCacheAge(key: string): Promise<number | null> {
  const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
  if (!raw) return null;
  const cached: CachedData = JSON.parse(raw);
  return Date.now() - cached.timestamp;
}

export function formatCacheAge(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
