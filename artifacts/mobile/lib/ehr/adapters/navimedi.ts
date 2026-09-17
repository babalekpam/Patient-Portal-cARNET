import { Platform } from "react-native";
import type { EHRAdapter } from "../types";
import type {
  Appointment,
  AppointmentBookingData,
  AppointmentRequest,
  Bill,
  LabResult,
  LaboratoryMessage,
  LoginCredentials,
  LoginResponse,
  Message,
  Prescription,
  Profile,
  ProfileUpdateData,
  TelehealthAppointment,
  TelehealthSession,
  VisitSummary,
} from "@/lib/api";
import {
  insuranceHistoryQuery,
  normalizeInsuranceHistoryRequest,
  requireInsuranceHistoryPage,
  type InsuranceHistoryPage,
  type InsuranceHistoryRequest,
} from "@/lib/insuranceHistory";
import {
  assertSession,
  notifySessionEnd,
  sessionGeneration,
  StaleSessionRequestError,
} from "@/lib/session";
import {
  MAX_AUTH_PROFILE_BODY_BYTES,
  type BoundedResponse,
  type FetchTransport,
  captureAuthenticationToken,
  getServerErrorMessage,
  requestJson,
  requireCsrfToken,
  requireAuthenticationToken,
  requireJsonObject,
  requireMatchingPatientProfile,
  requirePatientLoginResponse,
} from "../network";
import {
  getNavimediWebRelayUpstreamBaseUrl,
  NAVIMEDI_EXPECTED_ISSUER_HEADER,
  resolveNavimediNativeBaseUrl,
  resolveNavimediSessionBaseUrl,
} from "../navimediConfig";
import { assertRestrictedProductionFeatureEnabled } from "@/lib/productionFeatures";

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

export class NavimediAdapter implements EHRAdapter {
  readonly providerId: string;
  readonly sessionKey: string;
  private baseUrl: string;
  private token: string | null = null;
  private csrfToken: string | null = null;
  private responseGenerations = new WeakMap<BoundedResponse, number>();
  private readonly fetchImpl?: FetchTransport;

  constructor(providerId: string, baseUrl: string, fetchImpl?: FetchTransport) {
    this.providerId = providerId;
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    const issuer = new URL(resolveNavimediSessionBaseUrl(baseUrl));
    issuer.username = "";
    issuer.password = "";
    issuer.search = "";
    issuer.hash = "";
    issuer.pathname = issuer.pathname.replace(/\/+$/, "");
    this.sessionKey = `${providerId}|${issuer.toString().replace(/\/$/, "")}`;
  }

  private getUrl(): string {
    if (Platform.OS === "web") {
      const devDomain = process.env.EXPO_PUBLIC_DOMAIN;
      if (devDomain) {
        return `https://${devDomain}/api/navimedi`;
      }
    }
    return resolveNavimediNativeBaseUrl(this.baseUrl);
  }

  private relayIssuerHeaders(): Record<string, string> {
    return Platform.OS === "web"
      ? { [NAVIMEDI_EXPECTED_ISSUER_HEADER]: getNavimediWebRelayUpstreamBaseUrl() }
      : {};
  }

  private nativeCookieCredentials(): RequestCredentials | undefined {
    // The web relay owns its CSRF handshake. Native fetch must explicitly
    // retain the upstream cookie set by the pre-auth CSRF response.
    return Platform.OS === "web" ? undefined : "include";
  }

  private assertLoginGeneration(expectedGeneration: number): void {
    if (sessionGeneration() !== expectedGeneration) {
      throw new StaleSessionRequestError();
    }
  }

  setToken(token: string): void {
    this.token = token;
  }

  setLoginContext(response: LoginResponse): void {
    requireAuthenticationToken(response);
    this.setToken(response.token);
  }

  clearToken(): void {
    this.token = null;
    this.csrfToken = null;
  }

  private getHeaders(): HeadersInit {
    assertSession(this.sessionKey);
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...this.relayIssuerHeaders(),
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async protectedFetch(url: string, init?: RequestInit): Promise<BoundedResponse> {
    const generation = sessionGeneration();
    assertSession(this.sessionKey, generation);
    try {
      const response = await requestJson(url, init, { fetchImpl: this.fetchImpl });
      assertSession(this.sessionKey, generation);
      this.responseGenerations.set(response, generation);
      return response;
    } catch (error) {
      // A failed request is still session-bound. Do not let an old timeout or
      // network failure clear or replace a newer patient's session.
      assertSession(this.sessionKey, generation);
      throw error;
    }
  }

  // The server enforces CSRF protection on all mutating requests
  // (POST/PUT/PATCH/DELETE). The token is keyed to the auth session, so we fetch
  // it lazily and re-fetch once if a write is rejected with a CSRF-specific 403.
  private async fetchCsrfToken(): Promise<string | null> {
    try {
      const response = await this.protectedFetch(`${this.getUrl()}/csrf-token`, {
        headers: this.getHeaders(),
        credentials: this.nativeCookieCredentials(),
      });
      const generation = this.responseGenerations.get(response);
      if (!response.ok || response.bodyError) return null;
      assertSession(this.sessionKey, generation);
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
   * Fetch the anonymous CSRF token only for native direct requests. The token
   * is intentionally returned to the caller instead of being stored in the
   * authenticated CSRF slot: the upstream binds it to the pre-auth cookie.
   */
  private async fetchPreauthCsrfToken(expectedGeneration: number): Promise<string> {
    let response: BoundedResponse;
    try {
      response = await requestJson(
        `${this.getUrl()}/csrf-token`,
        {
          method: "GET",
          headers: { Accept: "application/json", ...this.relayIssuerHeaders() },
          credentials: "include",
        },
        {
          fetchImpl: this.fetchImpl,
          maxBodyBytes: MAX_AUTH_PROFILE_BODY_BYTES,
        },
      );
    } catch (error) {
      this.assertLoginGeneration(expectedGeneration);
      throw error;
    }
    this.assertLoginGeneration(expectedGeneration);
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
    const headers = { ...(this.getHeaders() as Record<string, string>) };
    if (this.csrfToken) {
      headers["X-CSRF-Token"] = this.csrfToken;
    }
    return headers;
  }

  private isCsrfFailure(value: unknown): boolean {
    const code =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>).code
        : undefined;
    return (
      typeof code === "string" &&
      ["CSRF_TOKEN_MISSING", "CSRF_TOKEN_INVALID", "CSRF_SESSION_INVALID"].includes(code)
    );
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
        credentials: this.nativeCookieCredentials(),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    let response = await send();
    let generation = this.responseGenerations.get(response);
    assertSession(this.sessionKey, generation);
    if (response.status === 403) {
      assertSession(this.sessionKey, generation);
      const csrfCodes = ["CSRF_TOKEN_MISSING", "CSRF_TOKEN_INVALID", "CSRF_SESSION_INVALID"];
      const errorCode =
        response.body && typeof response.body === "object" && !Array.isArray(response.body)
          ? (response.body as Record<string, unknown>).code
          : undefined;
      if (typeof errorCode === "string" && csrfCodes.includes(errorCode)) {
        await this.fetchCsrfToken();
        response = await send();
        generation = this.responseGenerations.get(response);
        assertSession(this.sessionKey, generation);
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
    if (isProtected) assertSession(this.sessionKey, generation);
    if (!response.ok) {
      if (isProtected) assertSession(this.sessionKey, generation);
      const serverMessage = getServerErrorMessage(response.body);
      if (response.status === 401) {
        if (isProtected) {
          this.token = null;
          this.csrfToken = null;
          notifySessionEnd("unauthorized");
        }
        throw new Error(
          serverMessage ||
            (isLogin
              ? "Invalid credentials. Please check your email, password, and hospital."
              : "Session expired. Please log in again.")
        );
      }
      if (response.status === 409 && isProtected) {
        this.token = null;
        this.csrfToken = null;
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
    if (isProtected) assertSession(this.sessionKey, generation);
    return body as T;
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const body: Record<string, string> = {
      email: credentials.email.trim(),
      password: credentials.password,
    };
    const tenantId = normalizedOptionalField(credentials.tenantId);
    if (tenantId) body.tenantId = tenantId;
    const mfaCode = normalizedOptionalField(credentials.mfaCode);
    if (mfaCode) body.mfaCode = mfaCode;

    // Do not carry an authenticated CSRF token into a new pre-auth exchange.
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
        ...this.relayIssuerHeaders(),
      };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      let response: BoundedResponse;
      try {
        response = await requestJson(`${this.getUrl()}${endpoint}`, {
          method: "POST",
          headers,
          credentials: this.nativeCookieCredentials(),
          body: JSON.stringify(body),
        }, {
          fetchImpl: this.fetchImpl,
          maxBodyBytes: MAX_AUTH_PROFILE_BODY_BYTES,
        });
      } catch (error) {
        this.assertLoginGeneration(loginGeneration);
        throw error;
      }
      if (response.ok && !response.bodyError) {
        issuedToken = captureAuthenticationToken(response.body) ?? issuedToken;
      }
      this.assertLoginGeneration(loginGeneration);
      return response;
    };

    try {
      let response = await sendLogin();

    // Only retry a request after an explicit CSRF failure. Credential errors
    // and ordinary authorization failures must never be replayed.
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
      // Never reuse the anonymous pre-auth token for authenticated writes.
      this.csrfToken = null;
      return validated;
    } catch (error) {
      if (issuedToken) await this.revokeToken(issuedToken).catch(() => {});
      throw error;
    }
  }

  /**
   * Profile verification is deliberately isolated from the active session.
   * Login callers use it before storing a token or creating session metadata.
   */
  async verifyLoginProfile(response: LoginResponse): Promise<Profile> {
    const login = requirePatientLoginResponse(response);
    const profileResponse = await requestJson(`${this.getUrl()}/patient/profile`, {
      headers: {
        Authorization: `Bearer ${login.token}`,
        ...this.relayIssuerHeaders(),
      },
    }, {
      fetchImpl: this.fetchImpl,
      maxBodyBytes: MAX_AUTH_PROFILE_BODY_BYTES,
    });
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
      login,
    );
    return profile as Profile;
  }

  /**
   * Revoke an issued token even when no local session exists yet. This method
   * intentionally does not call protectedFetch/assertSession: a stale login
   * must still be able to revoke its own captured token without touching a
   * newer patient's session.
   */
  async revokeToken(token: string): Promise<void> {
    const requestCsrf = async (): Promise<string> => {
      const response = await requestJson(`${this.getUrl()}/csrf-token`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...this.relayIssuerHeaders(),
        },
        credentials: this.nativeCookieCredentials(),
      }, {
        fetchImpl: this.fetchImpl,
        maxBodyBytes: MAX_AUTH_PROFILE_BODY_BYTES,
      });
      if (!response.ok || response.bodyError) {
        throw new Error(getServerErrorMessage(response.body) || "Unable to revoke the sign-in session.");
      }
      return requireCsrfToken(response.body);
    };

    let csrf = await requestCsrf();
    const send = () => requestJson(`${this.getUrl()}/auth/patient-logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-CSRF-Token": csrf,
        ...this.relayIssuerHeaders(),
      },
      credentials: this.nativeCookieCredentials(),
    }, {
      fetchImpl: this.fetchImpl,
      maxBodyBytes: MAX_AUTH_PROFILE_BODY_BYTES,
    });
    let response = await send();
    if (response.status === 403 && this.isCsrfFailure(response.body)) {
      csrf = await requestCsrf();
      response = await send();
    }
    if (!response.ok) {
      throw new Error(getServerErrorMessage(response.body) || "Unable to revoke the sign-in session.");
    }
  }

  async logout(): Promise<void> {
    if (!this.token) return;
    await this.revokeToken(this.token);
  }

  async forgotPassword(email: string): Promise<any> {
    const response = await requestJson(`${this.getUrl()}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.relayIssuerHeaders() },
      body: JSON.stringify({ email }),
    }, { fetchImpl: this.fetchImpl });
    return this.handleResponse<any>(response, false, false);
  }

  async getProfile(): Promise<Profile> {
    const response = await this.protectedFetch(`${this.getUrl()}/patient/profile`, {
      headers: this.getHeaders(),
    });
    const profile = await this.handleResponse<Profile>(response);
    return requireJsonObject<Profile>(
      profile,
      "The server returned an invalid profile response. Please try again.",
    );
  }

  async updateProfile(data: ProfileUpdateData): Promise<Profile> {
    return this.mutate<Profile>("PATCH", `${this.getUrl()}/patient/profile`, data);
  }

  async getAppointments(): Promise<Appointment[]> {
    const response = await this.protectedFetch(`${this.getUrl()}/patient/appointments`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<Appointment[]>(response);
  }

  // Book an appointment as the authenticated patient. Uses the PATIENT endpoint
  // (/patient/appointments), which derives patient + tenant from the auth token
  // and accepts any visit type — including "telehealth".
  async bookAppointment(data: AppointmentBookingData): Promise<Appointment> {
    return this.mutate<Appointment>("POST", `${this.getUrl()}/patient/appointments`, data);
  }

  async requestAppointment(data: AppointmentRequest): Promise<any> {
    return this.mutate("POST", `${this.getUrl()}/patient/appointment-requests`, data);
  }

  async getPrescriptions(): Promise<Prescription[]> {
    const response = await this.protectedFetch(`${this.getUrl()}/patient/prescriptions`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<Prescription[]>(response);
  }

  async getLabResults(): Promise<LabResult[]> {
    const response = await this.protectedFetch(`${this.getUrl()}/patient/lab-results`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<LabResult[]>(response);
  }

  async getMessages(): Promise<Message[]> {
    const response = await this.protectedFetch(`${this.getUrl()}/medical-communications`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<Message[]>(response);
  }

  async getLaboratoryMessages(): Promise<LaboratoryMessage[]> {
    assertRestrictedProductionFeatureEnabled("laboratory-messages");
    const response = await this.protectedFetch(`${this.getUrl()}/patient/laboratory-messages`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<LaboratoryMessage[]>(response);
  }

  async replyToLaboratoryMessage(
    id: string,
    content: string,
  ): Promise<LaboratoryMessage> {
    assertRestrictedProductionFeatureEnabled("laboratory-messages");
    const messageId = requireLaboratoryMessageId(id);
    return this.mutate<LaboratoryMessage>(
      "POST",
      `${this.getUrl()}/patient/laboratory-messages/${encodeURIComponent(messageId)}/reply`,
      { content: requireLaboratoryMessageContent(content) },
    );
  }

  async markLaboratoryMessageRead(id: string): Promise<LaboratoryMessage> {
    assertRestrictedProductionFeatureEnabled("laboratory-messages");
    const messageId = requireLaboratoryMessageId(id);
    return this.mutate<LaboratoryMessage>(
      "POST",
      `${this.getUrl()}/patient/laboratory-messages/${encodeURIComponent(messageId)}/read`,
    );
  }

  async sendMessage(subject: string, message: string, recipientId?: string): Promise<any> {
    return this.mutate("POST", `${this.getUrl()}/medical-communications`, {
      type: "general_message",
      priority: "normal",
      originalContent: { subject, message },
      ...(recipientId && { recipientId }),
    });
  }

  async getVisitSummaries(): Promise<VisitSummary[]> {
    const response = await this.protectedFetch(`${this.getUrl()}/patient/visit-summaries`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<VisitSummary[]>(response);
  }

  async getBills(): Promise<Bill[]> {
    const response = await this.protectedFetch(`${this.getUrl()}/patient/bills`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<Bill[]>(response);
  }

  async getInsuranceHistory(
    request: InsuranceHistoryRequest = {},
  ): Promise<InsuranceHistoryPage> {
    assertRestrictedProductionFeatureEnabled("insurance-history");
    const normalized = normalizeInsuranceHistoryRequest(request);
    const response = await this.protectedFetch(
      `${this.getUrl()}/patient/insurance-history?${insuranceHistoryQuery(normalized)}`,
      { headers: this.getHeaders() },
    );
    const body = await this.handleResponse<unknown>(response);
    return requireInsuranceHistoryPage(body);
  }

  async getTelehealthAppointments(): Promise<TelehealthAppointment[]> {
    const response = await this.protectedFetch(`${this.getUrl()}/patient/telehealth/appointments`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<TelehealthAppointment[]>(response);
  }

  async createTelehealthSession(appointmentId: string): Promise<TelehealthSession> {
    return this.mutate<TelehealthSession>(
      "POST",
      `${this.getUrl()}/patient/telehealth/sessions/${appointmentId}`,
    );
  }

  async getTelehealthSession(appointmentId: string): Promise<TelehealthSession> {
    const response = await this.protectedFetch(`${this.getUrl()}/patient/telehealth/sessions/${appointmentId}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<TelehealthSession>(response);
  }
}
