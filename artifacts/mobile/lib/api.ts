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

const DIRECT_URL = "https://www.navimedi.org/api";

function getBaseUrl(): string {
  if (Platform.OS === "web") {
    const devDomain = process.env.EXPO_PUBLIC_DOMAIN;
    if (devDomain) {
      return `https://${devDomain}/api/navimedi`;
    }
  }
  return DIRECT_URL;
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
}

export interface LoginResponse {
  token: string;
  user: any;
  tenant: any;
  expires_in?: number;
  expiresIn?: number;
  expires_at?: number | string;
  expiresAt?: number | string;
  patientContext?: string;
}

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
  private responseGenerations = new WeakMap<Response, number>();

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

  private async protectedFetch(url: string, init?: RequestInit): Promise<Response> {
    const generation = sessionGeneration();
    assertSession(null, generation);
    const response = await fetch(url, init);
    assertSession(null, generation);
    this.responseGenerations.set(response, generation);
    return response;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const generation = sessionGeneration();
    assertSession(null, generation);
    const headers: HeadersInit = {
      "Content-Type": "application/json",
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
      });
      const generation = this.responseGenerations.get(response);
      if (!response.ok) return null;
      const data = await response.json().catch(() => ({}) as any);
      assertSession(null, generation);
      this.csrfToken = data?.csrfToken ?? null;
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
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    let response = await send();
    let generation = this.responseGenerations.get(response);
    assertSession(null, generation);
    if (response.status === 403) {
      const errBody = await response.clone().json().catch(() => ({}) as any);
      assertSession(null, generation);
      const csrfCodes = ["CSRF_TOKEN_MISSING", "CSRF_TOKEN_INVALID", "CSRF_SESSION_INVALID"];
      if (csrfCodes.includes(errBody?.code)) {
        await this.fetchCsrfToken();
        response = await send();
        generation = this.responseGenerations.get(response);
        assertSession(null, generation);
      }
    }
    return this.handleResponse<T>(response, isLogin);
  }

  private async handleResponse<T>(
    response: Response,
    isLogin = false,
    isProtected = !isLogin,
  ): Promise<T> {
    const generation = this.responseGenerations.get(response);
    if (isProtected) assertSession(this._adapter?.sessionKey ?? null, generation);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({
        message: `Request failed with status ${response.status}.`,
      }));
      if (isProtected) assertSession(this._adapter?.sessionKey ?? null, generation);
      const serverMessage = errorBody.message || "";

      if (response.status === 401) {
        if (isProtected) {
          await clearToken();
          this.csrfToken = null;
          this._adapter?.clearToken();
          notifySessionEnd("unauthorized");
        }
        throw new Error(serverMessage || (isLogin ? "Invalid credentials. Please check your email, password, and hospital." : "Session expired. Please log in again."));
      }
      if (response.status === 404) {
        throw new Error(serverMessage || "This feature is not yet available.");
      }
      if (response.status === 500) {
        throw new Error(serverMessage || "Server error. Please try again later.");
      }
      throw new Error(serverMessage || `Request failed with status ${response.status}.`);
    }
    const body = await response.json();
    if (isProtected) assertSession(this._adapter?.sessionKey ?? null, generation);
    return body;
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    if (this._adapter) {
      const result = await this._adapter.login(credentials);
      return result;
    }
    const body: Record<string, string> = {
      email: credentials.email,
      password: credentials.password,
    };
    if (credentials.tenantId) {
      body.tenantId = credentials.tenantId;
    }
    let response = await fetch(`${getBaseUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status === 404) {
      response = await fetch(`${getBaseUrl()}/auth/patient-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    return this.handleResponse<LoginResponse>(response, true);
  }

  async forgotPassword(email: string): Promise<any> {
    if (this._adapter) return this._adapter.forgotPassword(email);
    const response = await fetch(`${getBaseUrl()}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return this.handleResponse<any>(response, false, false);
  }

  async getProfile(): Promise<Profile> {
    const generation = sessionGeneration();
    if (this._adapter) {
      const profile = await this._adapter.getProfile();
      assertSession(this._adapter.sessionKey, generation);
      return profile;
    }
    const response = await this.protectedFetch(`${getBaseUrl()}/patient/profile`, {
      headers: await this.getHeaders(),
    });
    const profile = await this.handleResponse<Profile>(response);
    assertSession(null, generation);
    return profile;
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
