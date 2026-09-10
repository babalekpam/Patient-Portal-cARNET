import type { EHRAdapter, EHRProviderConfig } from "./types";
import { NavimediAdapter } from "./adapters/navimedi";
import { FHIRAdapter } from "./adapters/fhir";

const BUILT_IN_PROVIDERS: EHRProviderConfig[] = [
  {
    id: "navimedi",
    name: "Navimedi",
    type: "navimedi",
    baseUrl: "https://www.navimedi.org/api",
    description: "Navimedi EHR Platform",
    icon: "server",
    supportsMessaging: true,
    supportsBilling: true,
    supportsVisitSummaries: true,
  },
  {
    id: "hapi-fhir-public",
    name: "HAPI FHIR (Public Test)",
    type: "fhir",
    baseUrl: "https://hapi.fhir.org/baseR4",
    description: "Public FHIR R4 test server",
    fhirVersion: "R4",
    icon: "database",
    supportsMessaging: false,
    supportsBilling: false,
    supportsVisitSummaries: true,
  },
  {
    id: "smart-sandbox",
    name: "SMART Health IT Sandbox",
    type: "fhir",
    baseUrl: "https://launch.smarthealthit.org/v/r4/fhir",
    description: "SMART on FHIR sandbox for testing",
    fhirVersion: "R4",
    authType: "smart",
    icon: "zap",
    supportsMessaging: true,
    supportsBilling: true,
    supportsVisitSummaries: true,
  },
];

let customProviders: EHRProviderConfig[] = [];

export function validateProviderUrl(baseUrl: string): string {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error("Enter a valid HTTPS provider address."); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error("Provider addresses must use HTTPS without embedded credentials, query parameters or fragments.");
  }
  return url.toString().replace(/\/$/, "");
}

export function getBuiltInProviders(): EHRProviderConfig[] {
  return [...BUILT_IN_PROVIDERS];
}

export function getAllProviders(): EHRProviderConfig[] {
  return [...BUILT_IN_PROVIDERS, ...customProviders];
}

export function getProviderById(id: string): EHRProviderConfig | undefined {
  return getAllProviders().find((p) => p.id === id);
}

export function addCustomProvider(provider: EHRProviderConfig): void {
  if (!provider.id.startsWith("custom-") || !["fhir", "custom"].includes(provider.type)) {
    throw new Error("Custom endpoints cannot replace a built-in provider.");
  }
  const baseUrl = validateProviderUrl(provider.baseUrl);
  customProviders = customProviders.filter((p) => p.id !== provider.id);
  customProviders.push({ ...provider, baseUrl });
}

export function removeCustomProvider(id: string): void {
  customProviders = customProviders.filter((p) => p.id !== id);
}

export function searchProviders(query: string): EHRProviderConfig[] {
  const q = query.toLowerCase().trim();
  if (!q) return getAllProviders();
  return getAllProviders().filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.region?.toLowerCase().includes(q)
  );
}

export function createAdapter(provider: EHRProviderConfig): EHRAdapter {
  validateProviderUrl(provider.baseUrl);
  switch (provider.type) {
    case "navimedi":
      return new NavimediAdapter(provider.id, provider.baseUrl);
    case "fhir":
      return new FHIRAdapter(provider.id, provider.baseUrl);
    case "custom":
      return new FHIRAdapter(provider.id, provider.baseUrl);
    default:
      throw new Error(`Unknown EHR type: ${provider.type}`);
  }
}

export function createCustomFHIRProvider(
  name: string,
  baseUrl: string,
  options?: Partial<EHRProviderConfig>
): EHRProviderConfig {
  const id = `custom-${Date.now()}`;
  return {
    id,
    name,
    type: "fhir",
    baseUrl: validateProviderUrl(baseUrl),
    description: "Custom FHIR R4 endpoint",
    fhirVersion: "R4",
    icon: "link",
    supportsMessaging: false,
    supportsBilling: false,
    supportsVisitSummaries: true,
    ...options,
  };
}
