import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
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

const EHR_PROVIDER_KEY = "ehr_active_provider";
const EHR_CUSTOM_PROVIDERS_KEY = "ehr_custom_providers";

interface EHRContextType {
  activeProvider: EHRProviderConfig | null;
  adapter: EHRAdapter | null;
  providers: EHRProviderConfig[];
  isLoading: boolean;
  selectProvider: (provider: EHRProviderConfig) => Promise<void>;
  addCustomFHIREndpoint: (name: string, baseUrl: string) => EHRProviderConfig;
  search: (query: string) => EHRProviderConfig[];
  clearProvider: () => Promise<void>;
}

const EHRContext = createContext<EHRContextType | null>(null);

export function EHRProvider({ children }: { children: React.ReactNode }) {
  const [activeProvider, setActiveProvider] = useState<EHRProviderConfig | null>(null);
  const [adapter, setAdapter] = useState<EHRAdapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSavedProvider();
  }, []);

  const loadSavedProvider = async () => {
    try {
      const customJson = await AsyncStorage.getItem(EHR_CUSTOM_PROVIDERS_KEY);
      if (customJson) {
        const customs: EHRProviderConfig[] = JSON.parse(customJson);
        customs.forEach((p) => addCustomProvider(p));
      }

      const savedId = await AsyncStorage.getItem(EHR_PROVIDER_KEY);
      if (savedId) {
        const provider = getProviderById(savedId);
        if (provider) {
          const newAdapter = createAdapter(provider);
          setActiveProvider(provider);
          setAdapter(newAdapter);
          api.setAdapter(newAdapter);
        }
      }
    } catch {} finally {
      setIsLoading(false);
    }
  };

  const selectProvider = useCallback(async (provider: EHRProviderConfig) => {
    const newAdapter = createAdapter(provider);
    setActiveProvider(provider);
    setAdapter(newAdapter);
    api.setAdapter(newAdapter);
    await AsyncStorage.setItem(EHR_PROVIDER_KEY, provider.id);
  }, []);

  const addCustomFHIREndpoint = useCallback((name: string, baseUrl: string) => {
    const provider = createCustomFHIRProvider(name, baseUrl);
    addCustomProvider(provider);
    AsyncStorage.setItem(
      EHR_CUSTOM_PROVIDERS_KEY,
      JSON.stringify(getAllProviders().filter((p) => p.id.startsWith("custom-")))
    ).catch(() => {});
    return provider;
  }, []);

  const search = useCallback((query: string) => {
    return searchProviders(query);
  }, []);

  const clearProvider = useCallback(async () => {
    if (adapter) adapter.clearToken();
    setActiveProvider(null);
    setAdapter(null);
    api.setAdapter(null);
    await AsyncStorage.removeItem(EHR_PROVIDER_KEY);
  }, [adapter]);

  return (
    <EHRContext.Provider
      value={{
        activeProvider,
        adapter,
        providers: getAllProviders(),
        isLoading,
        selectProvider,
        addCustomFHIREndpoint,
        search,
        clearProvider,
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
