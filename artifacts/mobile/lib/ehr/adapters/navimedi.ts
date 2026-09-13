import { Platform } from "react-native";
import type { EHRAdapter } from "../types";
import type {
  Appointment,
  AppointmentBookingData,
  AppointmentRequest,
  Bill,
  LabResult,
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
  assertSession,
  notifySessionEnd,
  sessionGeneration,
  StaleSessionRequestError,
} from "@/lib/session";
import {
  type BoundedResponse,
  type FetchTransport,
  requestJson,
  requireAuthenticationToken,
  requireJsonObject,
} from "../network";

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
    const issuer = new URL(baseUrl);
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
    return this.baseUrl;
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
    const headers: HeadersInit = { "Content-Type": "application/json" };
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
      });
      const generation = this.responseGenerations.get(response);
      if (!response.ok) return null;
      assertSession(this.sessionKey, generation);
      const data = response.body;
      this.csrfToken =
        data && typeof data === "object" && !Array.isArray(data) &&
        typeof (data as Record<string, unknown>).csrfToken === "string"
          ? (data as Record<string, string>).csrfToken
          : null;
      return this.csrfToken;
    } catch (error) {
      if (error instanceof StaleSessionRequestError) throw error;
      return null;
    }
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
      const serverMessage =
        response.body && typeof response.body === "object" && !Array.isArray(response.body) &&
        typeof (response.body as Record<string, unknown>).message === "string"
          ? (response.body as Record<string, string>).message
          : "";
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
      email: credentials.email,
      password: credentials.password,
    };
    if (credentials.tenantId) body.tenantId = credentials.tenantId;
    let response: BoundedResponse;
    response = await requestJson(`${this.getUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, { fetchImpl: this.fetchImpl });
    if (response.status === 404) {
      response = await requestJson(`${this.getUrl()}/auth/patient-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, { fetchImpl: this.fetchImpl });
    }
    return this.handleResponse<LoginResponse>(response, true);
  }

  async forgotPassword(email: string): Promise<any> {
    const response = await requestJson(`${this.getUrl()}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
