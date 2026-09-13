import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { EHRAdapter, EHRProviderConfig } from "@/lib/ehr/types";
import {
  createAdapter,
  getProviderById,
  getAllProviders,
  addCustomProvider,
  createCustomFHIRProvider,
  searchProviders,
} from "@/lib/ehr/registry";
import { api } from "@/lib/api";
import { hasCurrentSession, notifySessionEnd } from "@/lib/session";
import { AsyncOperationTimeoutError, withTimeout } from "@/lib/async";
import { commitProviderSelection } from "@/lib/providerTransition";

const EHR_PROVIDER_KEY = "ehr_active_provider";
const EHR_CUSTOM_PROVIDERS_KEY = "ehr_custom_providers";
const PROVIDER_STORAGE_TIMEOUT_MS = 8_000;

interface EHRContextType {
  activeProvider: EHRProviderConfig | null;
  adapter: EHRAdapter | null;
  providers: EHRProviderConfig[];
  isLoading: boolean;
  error: string | null;
  selectProvider: (provider: EHRProviderConfig) => Promise<void>;
  addCustomFHIREndpoint: (name: string, baseUrl: string) => EHRProviderConfig;
  search: (query: string) => EHRProviderConfig[];
  clearProvider: () => Promise<void>;
  retry: () => Promise<void>;
}

const EHRContext = createContext<EHRContextType | null>(null);

export function EHRProvider({ children }: { children: React.ReactNode }) {
  const [activeProvider, setActiveProvider] = useState<EHRProviderConfig | null>(null);
  const [adapter, setAdapter] = useState<EHRAdapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const providerPersistence = useRef<Promise<void> | null>(null);

  const persistProviderStorage = useCallback((write: () => Promise<void>, operationName: string) => {
    const previous = providerPersistence.current;
    const writeOperation = (previous ? previous.catch(() => {}) : Promise.resolve()).then(write);
    providerPersistence.current = writeOperation;
    void writeOperation
      .finally(() => {
        if (providerPersistence.current === writeOperation) providerPersistence.current = null;
      })
      .catch(() => {});
    // The queue remains blocked on the real operation even when the caller
    // receives a timeout, so an old destination write cannot overtake a new
    // provider selection.
    return withTimeout(writeOperation, PROVIDER_STORAGE_TIMEOUT_MS, operationName);
  }, []);

  const loadSavedProvider = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setIsLoading(true);
    setError(null);
    try {
      const customJson = await withTimeout(
        AsyncStorage.getItem(EHR_CUSTOM_PROVIDERS_KEY),
        PROVIDER_STORAGE_TIMEOUT_MS,
        "Saved provider loading",
      );
      if (customJson) {
        const customs: EHRProviderConfig[] = JSON.parse(customJson);
        customs.forEach((p) => addCustomProvider(p));
      }

      const savedId = await withTimeout(
        AsyncStorage.getItem(EHR_PROVIDER_KEY),
        PROVIDER_STORAGE_TIMEOUT_MS,
        "Active provider loading",
      );
      if (generation !== loadGeneration.current) return;
      if (savedId) {
        const provider = getProviderById(savedId);
        if (provider) {
          const newAdapter = createAdapter(provider);
          setActiveProvider(provider);
          setAdapter(newAdapter);
          api.setAdapter(newAdapter);
        }
      }
    } catch (loadError) {
      if (generation === loadGeneration.current) {
        setActiveProvider(null);
        setAdapter(null);
        api.setAdapter(null);
        setError(
          loadError instanceof AsyncOperationTimeoutError
            ? "Saved provider settings are taking too long to load. Retry when device storage is available."
            : "Saved provider settings could not be loaded. Retry to continue securely.",
        );
      }
    } finally {
      if (generation === loadGeneration.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedProvider();
  }, [loadSavedProvider]);

  const selectProvider = useCallback(async (provider: EHRProviderConfig) => {
    const newAdapter = createAdapter(provider);
    if (hasCurrentSession() && api.adapter?.sessionKey !== newAdapter.sessionKey) {
      notifySessionEnd("provider_changed");
    }
    await commitProviderSelection({
      persist: () => persistProviderStorage(
        () => AsyncStorage.setItem(EHR_PROVIDER_KEY, provider.id),
        "Provider selection",
      ),
      sessionIsCurrent: hasCurrentSession,
      destinationChanged: () => api.adapter?.sessionKey !== newAdapter.sessionKey,
      endSession: () => notifySessionEnd("provider_changed"),
      commit: () => {
        // Tokens are bound by AuthProvider only after a login/restore proves
        // the saved session belongs to this exact provider.
        setActiveProvider(provider);
        setAdapter(newAdapter);
        api.setAdapter(newAdapter);
      },
    });
  }, [persistProviderStorage]);

  const addCustomFHIREndpoint = useCallback((name: string, baseUrl: string) => {
    const provider = createCustomFHIRProvider(name, baseUrl);
    addCustomProvider(provider);
    void persistProviderStorage(
      () => AsyncStorage.setItem(
          EHR_CUSTOM_PROVIDERS_KEY,
          JSON.stringify(getAllProviders().filter((p) => p.id.startsWith("custom-"))),
        ),
      "Custom provider persistence",
    ).catch(() => {
      setError("The custom provider could not be saved. Check device storage and try again.");
    });
    return provider;
  }, [persistProviderStorage]);

  const search = useCallback((query: string) => {
    return searchProviders(query);
  }, []);

  const clearProvider = useCallback(async () => {
    if (adapter) adapter.clearToken();
    setActiveProvider(null);
    setAdapter(null);
    api.setAdapter(null);
    await persistProviderStorage(
      () => AsyncStorage.removeItem(EHR_PROVIDER_KEY),
      "Provider cleanup",
    );
  }, [adapter, persistProviderStorage]);

  return (
    <EHRContext.Provider
      value={{
        activeProvider,
        adapter,
        providers: getAllProviders(),
        isLoading,
        error,
        selectProvider,
        addCustomFHIREndpoint,
        search,
        clearProvider,
        retry: loadSavedProvider,
      }}
    >
      {children}
    </EHRContext.Provider>
  );
}

export function useEHR() {
  const ctx = useContext(EHRContext);
  if (!ctx) throw new Error("useEHR must be used within EHRProvider");
  return ctx;
}
