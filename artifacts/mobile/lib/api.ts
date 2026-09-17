import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { EHRAdapter } from "@/lib/ehr/types";
import { deleteSecureItem, getSecureItem, setSecureItem } from "@/lib/secureStorage";
import {
  assertSession,
  notifySessionEnd,
  sessionGeneration,
  StaleSessionRequestError,
} from "@/lib/session";
import {
  type BoundedResponse,
  MAX_AUTH_PROFILE_BODY_BYTES,
  captureAuthenticationToken,
  getServerErrorMessage,
  requestJson,
  requireCsrfToken,
  requireAuthenticationToken,
  requireJsonObject,
  requireMatchingPatientProfile,
  requirePatientLoginResponse,
  type PatientLoginResponse,
} from "@/lib/ehr/network";
import {
  insuranceHistoryQuery,
  normalizeInsuranceHistoryRequest,
  requireInsuranceHistoryPage,
  type InsuranceFilingType,
  type InsuranceHistoryPage,
  type InsuranceHistoryRequest,
} from "@/lib/insuranceHistory";
import {
  clearInsuranceHistoryCache,
  getInsuranceHistoryPage,
  setInsuranceHistoryPage,
} from "@/lib/insuranceHistoryCache";
import {
  getNavimediNativeApiBaseUrl,
  getNavimediWebRelayUpstreamBaseUrl,
  NAVIMEDI_EXPECTED_ISSUER_HEADER,
} from "@/lib/ehr/navimediConfig";
import { assertRestrictedProductionFeatureEnabled } from "@/lib/productionFeatures";

export type {
  InsuranceFilingType,
  InsuranceHistoryAmounts,
  InsuranceHistoryItem,
  InsuranceHistoryPage,
  InsuranceHistoryPagination,
  InsuranceHistoryRequest,
} from "@/lib/insuranceHistory";

function getBaseUrl(): string {
  if (Platform.OS === "web") {
    const devDomain = process.env.EXPO_PUBLIC_DOMAIN;
    if (devDomain) {
      return `https://${devDomain}/api/navimedi`;
    }
  }
  return getNavimediNativeApiBaseUrl();
}

function nativeCookieCredentials(): RequestCredentials | undefined {
  // The browser relay owns its own handshake. Native fetch needs explicit
  // cookie transport because the pre-auth CSRF token is bound to the cookie
  // set by the upstream response.
  return Platform.OS === "web" ? undefined : "include";
}

function relayIssuerHeaders(): Record<string, string> {
  return Platform.OS === "web"
    ? { [NAVIMEDI_EXPECTED_ISSUER_HEADER]: getNavimediWebRelayUpstreamBaseUrl() }
    : {};
}

function assertLoginGeneration(expectedGeneration: number): void {
  if (sessionGeneration() !== expectedGeneration) {
    throw new StaleSessionRequestError();
  }
}

function isCsrfFailure(value: unknown): boolean {
  const code =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).code
      : undefined;
  return (
    typeof code === "string" &&
    ["CSRF_TOKEN_MISSING", "CSRF_TOKEN_INVALID", "CSRF_SESSION_INVALID"].includes(code)
  );
}

function normalizedOptionalField(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

const LABORATORY_MESSAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireLaboratoryMessageId(value: string): string {
  if (!LABORATORY_MESSAGE_ID_PATTERN.test(value)) {
    throw new Error("A valid laboratory message ID is required.");
  }
  return value;
}

function requireLaboratoryMessageContent(value: string): string {
  const content = value.trim();
  if (!content || content.length > 10_000) {
    throw new Error("Laboratory message content must be between 1 and 10,000 characters.");
  }
  return content;
}

const TOKEN_KEY = "carnet_auth_token";

export const saveToken = async (token: string): Promise<void> => {
  await setSecureItem(TOKEN_KEY, token);
  await AsyncStorage.removeItem(TOKEN_KEY);
};

export const getToken = async (): Promise<string | null> => {
  const token = await getSecureItem(TOKEN_KEY);
  if (token) return token;

  // Never migrate legacy plaintext bearer tokens. Remove them and require a
  // fresh login so all future sessions begin in platform-backed secure storage.
  await AsyncStorage.removeItem(TOKEN_KEY);
  return null;
};

export const clearToken = async (): Promise<void> => {
  await deleteSecureItem(TOKEN_KEY);
  await AsyncStorage.removeItem(TOKEN_KEY);
};

export interface LoginCredentials {
  email: string;
  password: string;
  tenantId?: string;
  mfaCode?: string;
}

export interface LoginResponse {
  token: string;
  user: object;
  tenant: object | null;
  success?: boolean;
  patient?: object;
  expires_in?: number;
  expiresIn?: number;
  expires_at?: number | string;
  expiresAt?: number | string;
  patientContext?: string;
}

export type { PatientLoginResponse };

export interface Appointment {
  id?: string;
  appointmentType?: string;
  appointmentDate?: string;
  status?: string;
  reason?: string;
  provider?: string;
  location?: string;
  hospitalName?: string;
  doctorName?: string;
  duration?: number;
  notes?: string;
}

export interface Prescription {
  id?: string;
  medicationName?: string;
  dosage?: string;
  frequency?: string;
  prescribedDate?: string;
  status?: string;
  refillsRemaining?: number;
  prescribingProvider?: string;
  instructions?: string;
}

export interface LabResult {
  id?: string;
  testName?: string;
  resultDate?: string;
  status?: string;
  results?: Array<{ name: string; value: string; unit?: string; referenceRange?: string; flag?: string }>;
  orderingProvider?: string;
  category?: string;
}

export interface Message {
  id?: string;
  type?: string;
  priority?: string;
  originalContent?: { subject?: string; message?: string };
  createdAt?: string;
  status?: string;
  sender?: string;
}

export interface LaboratoryMessage {
  id?: string;
  patientTenantId?: string;
  laboratoryTenantId?: string;
  patientId?: string;
  labOrderId?: string;
  senderId?: string;
  recipientId?: string | null;
  direction?: string;
  subject?: string;
  content?: string;
  priority?: string;
  readByPatientAt?: string | null;
  readByLaboratoryAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface VisitSummary {
  id?: string;
  visitDate?: string;
  visitType?: string;
  provider?: string;
  doctorName?: string;
  hospitalName?: string;
  diagnosis?: string;
  summary?: string;
  notes?: string;
  followUpDate?: string;
  followUpInstructions?: string;
  vitals?: {
    bloodPressure?: string;
    heartRate?: string;
    temperature?: string;
    weight?: string;
  };
  prescriptions?: string[];
  labOrders?: string[];
  status?: string;
}

export interface AppointmentRequest {
  appointmentType: string;
  preferredDate: string;
  preferredTime?: string;
  reason: string;
  doctorPreference?: string;
  notes?: string;
}

export interface AppointmentBookingData {
  providerId: string;
  appointmentDate: string;
  type?: string;
  duration?: number;
  notes?: string;
  chiefComplaint?: string;
}

export interface Bill {
  id?: string;
  totalCharges?: number;
  insurancePaid?: number;
  patientResponsibility?: number;
  status?: string;
  serviceDate?: string;
  description?: string;
  billDate?: string;
}

export interface Profile {
  id?: string;
  patientId?: string;
  tenantId?: string;
  patient?: { id?: string; tenantId?: string };
  tenant?: { id?: string };
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  bloodType?: string;
  phone?: string;
  email?: string;
  allergies?: string[];
  gender?: string;
  address?: string;
  mrn?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
}

export interface TelehealthAppointment {
  id: string;
  appointmentDate?: string;
  appointmentType?: string;
  doctorName?: string;
  provider?: string;
  status?: string;
  notes?: string;
  sessionId?: string;
}

export interface TelehealthSession {
  sessionId: string;
  appointmentId: string;
  roomUrl: string;
  token?: string;
  status: "scheduled" | "waiting" | "in-progress" | "ended";
  providerName?: string;
  expiresAt?: string;
}

export interface ProfileUpdateData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  gender?: string;
  dateOfBirth?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}

class ApiClient {
  private _adapter: EHRAdapter | null = null;
  private csrfToken: string | null = null;
  private responseGenerations = new WeakMap<BoundedResponse, number>();

  setAdapter(adapter: EHRAdapter | null): void {
    if (this._adapter && this._adapter !== adapter) this._adapter.clearToken();
    this.csrfToken = null;
    this._adapter = adapter;
  }

  get adapter(): EHRAdapter | null {
    return this._adapter;
  }

  // Clears the in-memory CSRF token. Call on logout so a new session fetches a
  // fresh token tied to the new auth session.
  clearCsrfToken(): void {
    this.csrfToken = null;
  }

  private async protectedFetch(url: string, init?: RequestInit): Promise<BoundedResponse> {
    const generation = sessionGeneration();
    assertSession(null, generation);
    try {
      const response = await requestJson(url, init);
      assertSession(null, generation);
      this.responseGenerations.set(response, generation);
      return response;
    } catch (error) {
      // Do not turn an old request's timeout or transport failure into a
      // mutation of the replacement patient's session.
      assertSession(null, generation);
      throw error;
    }
  }

  private async getHeaders(): Promise<HeadersInit> {
    const generation = sessionGeneration();
    assertSession(null, generation);
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...relayIssuerHeaders(),
    };
    const token = await getToken();
    assertSession(null, generation);
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  // The server enforces CSRF protection on all mutating requests
  // (POST/PUT/PATCH/DELETE). The token is keyed to the auth session, so we fetch
  // it lazily and re-fetch once if a write is rejected with a CSRF-specific 403.
  private async fetchCsrfToken(): Promise<string | null> {
    try {
      const response = await this.protectedFetch(`${getBaseUrl()}/csrf-token`, {
        headers: await this.getHeaders(),
        credentials: nativeCookieCredentials(),
      });
      const generation = this.responseGenerations.get(response);
      if (!response.ok || response.bodyError) return null;
      assertSession(null, generation);
      try {
        this.csrfToken = requireCsrfToken(response.body);
      } catch {
        this.csrfToken = null;
      }
      return this.csrfToken;
    } catch (error) {
      if (error instanceof StaleSessionRequestError) throw error;
      return null;
    }
  }

  /**
   * Native login has to establish the upstream CSRF cookie before sending
   * credentials. Do not put this token in the authenticated CSRF state: it is
   * scoped to the anonymous pre-auth cookie and must not be reused after login.
   */
  private async fetchPreauthCsrfToken(expectedGeneration: number): Promise<string> {
    let response: BoundedResponse;
    try {
      response = await requestJson(
        `${getBaseUrl()}/csrf-token`,
        {
          method: "GET",
          headers: { Accept: "application/json", ...relayIssuerHeaders() },
          credentials: "include",
        },
        { maxBodyBytes: MAX_AUTH_PROFILE_BODY_BYTES },
      );
    } catch (error) {
      assertLoginGeneration(expectedGeneration);
      throw error;
    }
    assertLoginGeneration(expectedGeneration);
    if (!response.ok || response.bodyError) {
      throw new Error(
        getServerErrorMessage(response.body) ||
          "Unable to obtain a CSRF token. Please try again.",
      );
    }
    return requireCsrfToken(response.body);
  }

  private async getMutatingHeaders(): Promise<HeadersInit> {
    if (!this.csrfToken) {
      await this.fetchCsrfToken();
    }
    const headers = (await this.getHeaders()) as Record<string, string>;
    if (this.csrfToken) {
      headers["X-CSRF-Token"] = this.csrfToken;
    }
    return headers;
  }

  // Performs a mutating request, retrying once with a fresh CSRF token if the
  // server rejects it with a CSRF-specific 403. A plain 403 (genuine
  // authorization failure) is surfaced to the caller unchanged.
  private async mutate<T>(
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    body?: unknown,
    isLogin = false,
  ): Promise<T> {
    const send = async () =>
      this.protectedFetch(url, {
        method,
        headers: await this.getMutatingHeaders(),
        credentials: nativeCookieCredentials(),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    let response = await send();
    let generation = this.responseGenerations.get(response);
    assertSession(null, generation);
    if (response.status === 403) {
      assertSession(null, generation);
      const csrfCodes = ["CSRF_TOKEN_MISSING", "CSRF_TOKEN_INVALID", "CSRF_SESSION_INVALID"];
      const errorCode =
        response.body && typeof response.body === "object" && !Array.isArray(response.body)
          ? (response.body as Record<string, unknown>).code
          : undefined;
      if (typeof errorCode === "string" && csrfCodes.includes(errorCode)) {
        await this.fetchCsrfToken();
        response = await send();
        generation = this.responseGenerations.get(response);
        assertSession(null, generation);
      }
    }
    return this.handleResponse<T>(response, isLogin);
  }

  private async handleResponse<T>(
    response: BoundedResponse,
    isLogin = false,
    isProtected = !isLogin,
  ): Promise<T> {
    const generation = this.responseGenerations.get(response);
    if (isProtected) assertSession(this._adapter?.sessionKey ?? null, generation);
    if (!response.ok) {
      if (isProtected) assertSession(this._adapter?.sessionKey ?? null, generation);
      const serverMessage = getServerErrorMessage(response.body);

      if (response.status === 401) {
        if (isProtected) {
          await clearToken();
          this.csrfToken = null;
          this._adapter?.clearToken();
          notifySessionEnd("unauthorized");
        }
        throw new Error(serverMessage || (isLogin ? "Invalid credentials. Please check your email, password, and hospital." : "Session expired. Please log in again."));
      }
      if (response.status === 409 && isProtected) {
        await clearToken();
        this.csrfToken = null;
        this._adapter?.clearToken();
        notifySessionEnd("provider_changed");
        throw new Error(
          serverMessage || "The healthcare service session changed. Please sign in again.",
        );
      }
      if (response.status === 404) {
        throw new Error(serverMessage || "This feature is not yet available.");
      }
      if (response.status === 500) {
        throw new Error(serverMessage || "Server error. Please try again later.");
      }
      throw new Error(serverMessage || `Request failed with status ${response.status}.`);
    }
    if (response.bodyError) {
      throw new Error(
        isLogin
          ? "Server did not return a valid authentication token. Please try again."
          : "The server returned an invalid response. Please try again.",
      );
    }
    const body = response.body;
    if (isLogin) requireAuthenticationToken(body);
    if (isProtected) assertSession(this._adapter?.sessionKey ?? null, generation);
    return body as T;
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    if (this._adapter) {
      const result = await this._adapter.login(credentials);
      requireAuthenticationToken(result);
      return result;
    }
    const body: Record<string, string> = {
      email: credentials.email.trim(),
      password: credentials.password,
    };
    const tenantId = normalizedOptionalField(credentials.tenantId);
    if (tenantId) body.tenantId = tenantId;
    const mfaCode = normalizedOptionalField(credentials.mfaCode);
    if (mfaCode) body.mfaCode = mfaCode;

    // A login can follow a previous session in the same process. Never let an
    // authenticated CSRF token leak into this pre-auth exchange.
    this.csrfToken = null;
    const loginGeneration = sessionGeneration();
    let issuedToken: string | null = null;
    let csrfToken: string | null = Platform.OS === "web"
      ? null
      : await this.fetchPreauthCsrfToken(loginGeneration);
    const endpoint = "/auth/patient-login";

    const sendLogin = async (): Promise<BoundedResponse> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...relayIssuerHeaders(),
      };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      let response: BoundedResponse;
      try {
        response = await requestJson(`${getBaseUrl()}${endpoint}`, {
          method: "POST",
          headers,
          credentials: nativeCookieCredentials(),
          body: JSON.stringify(body),
        }, { maxBodyBytes: MAX_AUTH_PROFILE_BODY_BYTES });
      } catch (error) {
        assertLoginGeneration(loginGeneration);
        throw error;
      }
      if (response.ok && !response.bodyError) {
        issuedToken = captureAuthenticationToken(response.body) ?? issuedToken;
      }
      assertLoginGeneration(loginGeneration);
      return response;
    };

    try {
      let response = await sendLogin();

    // Only an explicit CSRF failure may replay credentials. A normal 401/403
    // is an authentication/authorization result and is surfaced unchanged.
    const csrfCodes = ["CSRF_TOKEN_MISSING", "CSRF_TOKEN_INVALID", "CSRF_SESSION_INVALID"];
    const errorCode =
      response.status === 403 &&
      response.body && typeof response.body === "object" && !Array.isArray(response.body)
        ? (response.body as Record<string, unknown>).code
        : undefined;
    if (typeof errorCode === "string" && csrfCodes.includes(errorCode)) {
      if (Platform.OS !== "web") {
        csrfToken = await this.fetchPreauthCsrfToken(loginGeneration);
      }
      response = await sendLogin();
    }

      const result = await this.handleResponse<LoginResponse>(response, true);
      const validated = requirePatientLoginResponse(result);
      // The anonymous token must never become the token used by authenticated
      // mutations. Authenticated writes will obtain a fresh token lazily.
      this.csrfToken = null;
      return validated;
    } catch (error) {
      if (issuedToken) await this.revokeTokenDirect(issuedToken).catch(() => {});
      throw error;
    }
  }

  /**
   * Verify a newly-issued NaviMED token against a fresh profile before any
   * token/session metadata is stored. The adapter argument lets a stale login
   * finish safely even when the selected provider has since changed.
   */
  async verifyLoginProfile(
    response: LoginResponse,
    expectedAdapter: EHRAdapter | null = this._adapter,
  ): Promise<Profile> {
    if (expectedAdapter?.verifyLoginProfile) {
      return expectedAdapter.verifyLoginProfile(response);
    }
    if (expectedAdapter) {
      throw new Error("This provider requires a fresh sign in to establish patient context.");
    }
    const token = requirePatientLoginResponse(response).token;
    const profileResponse = await requestJson(`${getBaseUrl()}/patient/profile`, {
      headers: { Authorization: `Bearer ${token}`, ...relayIssuerHeaders() },
    }, { maxBodyBytes: MAX_AUTH_PROFILE_BODY_BYTES });
    if (!profileResponse.ok || profileResponse.bodyError) {
      throw new Error(
        getServerErrorMessage(profileResponse.body) ||
          "Unable to verify the signed-in patient profile. Please try again.",
      );
    }
    const profile = requireMatchingPatientProfile(
      requireJsonObject<Profile>(
        profileResponse.body,
        "The server returned an invalid patient profile. Please try again.",
      ),
      requirePatientLoginResponse(response),
    );
    return profile as Profile;
  }

  /**
   * Revoke a captured token without consulting the current session. This is
   * intentionally an isolated request for stale login completions and failed
   * profile verification; it can never clear or mutate a replacement session.
   */
  async revokeToken(
    token: string,
    expectedAdapter: EHRAdapter | null = this._adapter,
  ): Promise<void> {
    if (expectedAdapter?.revokeToken) {
      await expectedAdapter.revokeToken(token);
      return;
    }
    if (expectedAdapter) return;
    await this.revokeTokenDirect(token);
  }

  private async revokeTokenDirect(token: string): Promise<void> {
    const requestCsrf = async (): Promise<string> => {
      const response = await requestJson(`${getBaseUrl()}/csrf-token`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...relayIssuerHeaders(),
        },
        credentials: nativeCookieCredentials(),
      }, { maxBodyBytes: MAX_AUTH_PROFILE_BODY_BYTES });
      if (!response.ok || response.bodyError) {
        throw new Error(getServerErrorMessage(response.body) || "Unable to revoke the sign-in session.");
      }
      return requireCsrfToken(response.body);
    };
    let csrf = await requestCsrf();
    const send = () => requestJson(`${getBaseUrl()}/auth/patient-logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-CSRF-Token": csrf,
        ...relayIssuerHeaders(),
      },
      credentials: nativeCookieCredentials(),
    }, { maxBodyBytes: MAX_AUTH_PROFILE_BODY_BYTES });
    let response = await send();
    if (response.status === 403 && isCsrfFailure(response.body)) {
      csrf = await requestCsrf();
      response = await send();
    }
    if (!response.ok) {
      throw new Error(getServerErrorMessage(response.body) || "Unable to revoke the sign-in session.");
    }
  }

  async logout(expectedAdapter: EHRAdapter | null = this._adapter): Promise<void> {
    if (expectedAdapter?.logout) {
      await expectedAdapter.logout();
      return;
    }
    if (expectedAdapter) return;
    const token = await getToken();
    if (token) await this.revokeTokenDirect(token);
  }

  async forgotPassword(email: string): Promise<any> {
    if (this._adapter) return this._adapter.forgotPassword(email);
    const response = await requestJson(`${getBaseUrl()}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...relayIssuerHeaders() },
      body: JSON.stringify({ email }),
    });
    return this.handleResponse<any>(response, false, false);
  }

  async getProfile(): Promise<Profile> {
    const generation = sessionGeneration();
    if (this._adapter) {
      const profile = await this._adapter.getProfile();
      assertSession(this._adapter.sessionKey, generation);
      return requireJsonObject<Profile>(
        profile,
        "The server returned an invalid profile response. Please try again.",
      );
    }
    const response = await this.protectedFetch(`${getBaseUrl()}/patient/profile`, {
      headers: await this.getHeaders(),
    });
    const profile = await this.handleResponse<Profile>(response);
    assertSession(null, generation);
    return requireJsonObject<Profile>(
      profile,
      "The server returned an invalid profile response. Please try again.",
    );
  }

  async updateProfile(data: ProfileUpdateData): Promise<Profile> {
    if (this._adapter) return this._adapter.updateProfile(data);
    return this.mutate<Profile>("PATCH", `${getBaseUrl()}/patient/profile`, data);
  }

  async getAppointments(): Promise<Appointment[]> {
    if (this._adapter) return this._adapter.getAppointments();
    const response = await this.protectedFetch(`${getBaseUrl()}/patient/appointments`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Appointment[]>(response);
  }

  // Book an appointment as the authenticated patient. Uses the PATIENT endpoint
  // (/patient/appointments), which derives patient + tenant from the auth token
  // and accepts any visit type — including "telehealth".
  async bookAppointment(data: AppointmentBookingData): Promise<Appointment> {
    if (this._adapter) return this._adapter.bookAppointment(data);
    return this.mutate<Appointment>("POST", `${getBaseUrl()}/patient/appointments`, data);
  }

  async getPrescriptions(): Promise<Prescription[]> {
    if (this._adapter) return this._adapter.getPrescriptions();
    const response = await this.protectedFetch(`${getBaseUrl()}/patient/prescriptions`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Prescription[]>(response);
  }

  async getLabResults(): Promise<LabResult[]> {
    if (this._adapter) return this._adapter.getLabResults();
    const response = await this.protectedFetch(`${getBaseUrl()}/patient/lab-results`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<LabResult[]>(response);
  }

  async getMessages(): Promise<Message[]> {
    if (this._adapter) return this._adapter.getMessages();
    const response = await this.protectedFetch(`${getBaseUrl()}/medical-communications`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Message[]>(response);
  }

  async getLaboratoryMessages(): Promise<LaboratoryMessage[]> {
    assertRestrictedProductionFeatureEnabled("laboratory-messages");
    if (this._adapter?.getLaboratoryMessages) return this._adapter.getLaboratoryMessages();
    if (this._adapter) {
      throw new Error("Laboratory handoff messages are only available for NaviMED sessions.");
    }
    const response = await this.protectedFetch(`${getBaseUrl()}/patient/laboratory-messages`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<LaboratoryMessage[]>(response);
  }

  async replyToLaboratoryMessage(
    id: string,
    content: string,
  ): Promise<LaboratoryMessage> {
    assertRestrictedProductionFeatureEnabled("laboratory-messages");
    if (this._adapter?.replyToLaboratoryMessage) {
      return this._adapter.replyToLaboratoryMessage(id, content);
    }
    if (this._adapter) {
      throw new Error("Laboratory handoff messages are only available for NaviMED sessions.");
    }
    const messageId = requireLaboratoryMessageId(id);
    return this.mutate<LaboratoryMessage>(
      "POST",
      `${getBaseUrl()}/patient/laboratory-messages/${encodeURIComponent(messageId)}/reply`,
      { content: requireLaboratoryMessageContent(content) },
    );
  }

  async markLaboratoryMessageRead(id: string): Promise<LaboratoryMessage> {
    assertRestrictedProductionFeatureEnabled("laboratory-messages");
    if (this._adapter?.markLaboratoryMessageRead) {
      return this._adapter.markLaboratoryMessageRead(id);
    }
    if (this._adapter) {
      throw new Error("Laboratory handoff messages are only available for NaviMED sessions.");
    }
    const messageId = requireLaboratoryMessageId(id);
    return this.mutate<LaboratoryMessage>(
      "POST",
      `${getBaseUrl()}/patient/laboratory-messages/${encodeURIComponent(messageId)}/read`,
    );
  }

  async sendMessage(subject: string, message: string, recipientId?: string): Promise<any> {
    if (this._adapter) return this._adapter.sendMessage(subject, message, recipientId);
    return this.mutate("POST", `${getBaseUrl()}/medical-communications`, {
      type: "general_message",
      priority: "normal",
      originalContent: { subject, message },
      ...(recipientId && { recipientId }),
    });
  }

  async getVisitSummaries(): Promise<VisitSummary[]> {
    if (this._adapter) return this._adapter.getVisitSummaries();
    const response = await this.protectedFetch(`${getBaseUrl()}/patient/visit-summaries`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<VisitSummary[]>(response);
  }

  async requestAppointment(data: AppointmentRequest): Promise<any> {
    if (this._adapter) return this._adapter.requestAppointment(data);
    return this.mutate("POST", `${getBaseUrl()}/patient/appointment-requests`, data);
  }

  async getBills(): Promise<Bill[]> {
    if (this._adapter) return this._adapter.getBills();
    const response = await this.protectedFetch(`${getBaseUrl()}/patient/bills`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Bill[]>(response);
  }

  async getInsuranceHistory(
    request: InsuranceHistoryRequest = {},
  ): Promise<InsuranceHistoryPage> {
    assertRestrictedProductionFeatureEnabled("insurance-history");
    const normalized = normalizeInsuranceHistoryRequest(request);
    const generation = sessionGeneration();
    const sessionKey = this._adapter?.sessionKey ?? "direct-navimedi";
    const cached = getInsuranceHistoryPage(
      generation,
      sessionKey,
      normalized.filingType,
      normalized.limit,
      normalized.offset,
    );
    if (cached) {
      assertSession(this._adapter?.sessionKey ?? null, generation);
      return cached;
    }

    let page: InsuranceHistoryPage;
    if (this._adapter) {
      if (!this._adapter.getInsuranceHistory) {
        throw new Error("Insurance history is not available for this provider.");
      }
      page = await this._adapter.getInsuranceHistory(normalized);
      assertSession(this._adapter.sessionKey, generation);
    } else {
      const response = await this.protectedFetch(
        `${getBaseUrl()}/patient/insurance-history?${insuranceHistoryQuery(normalized)}`,
        { headers: await this.getHeaders() },
      );
      page = requireInsuranceHistoryPage(await this.handleResponse<unknown>(response));
      assertSession(null, generation);
    }

    assertSession(this._adapter?.sessionKey ?? null, generation);
    setInsuranceHistoryPage(
      generation,
      sessionKey,
      normalized.filingType,
      normalized.limit,
      normalized.offset,
      page,
    );
    return page;
  }

  async getTelehealthAppointments(): Promise<TelehealthAppointment[]> {
    if (this._adapter) return this._adapter.getTelehealthAppointments();
    const response = await this.protectedFetch(`${getBaseUrl()}/patient/telehealth/appointments`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<TelehealthAppointment[]>(response);
  }

  async createTelehealthSession(appointmentId: string): Promise<TelehealthSession> {
    if (this._adapter) return this._adapter.createTelehealthSession(appointmentId);
    return this.mutate<TelehealthSession>(
      "POST",
      `${getBaseUrl()}/patient/telehealth/sessions/${appointmentId}`,
    );
  }

  async getTelehealthSession(appointmentId: string): Promise<TelehealthSession> {
    if (this._adapter) return this._adapter.getTelehealthSession(appointmentId);
    const response = await this.protectedFetch(`${getBaseUrl()}/patient/telehealth/sessions/${appointmentId}`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<TelehealthSession>(response);
  }
}

export const api = new ApiClient();

export { clearInsuranceHistoryCache };
