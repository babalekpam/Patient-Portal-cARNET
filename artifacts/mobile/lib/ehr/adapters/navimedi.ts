import { Platform } from "react-native";
import type { EHRAdapter } from "../types";
import type {
  Appointment,
  AppointmentRequest,
  Bill,
  LabResult,
  LoginCredentials,
  LoginResponse,
  Message,
  Prescription,
  Profile,
  ProfileUpdateData,
  VisitSummary,
} from "@/lib/api";

export class NavimediAdapter implements EHRAdapter {
  readonly providerId: string;
  private baseUrl: string;
  private token: string | null = null;

  constructor(providerId: string, baseUrl: string) {
    this.providerId = providerId;
    this.baseUrl = baseUrl;
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

  clearToken(): void {
    this.token = null;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async handleResponse<T>(response: Response, isLogin = false): Promise<T> {
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({
        message: `Request failed with status ${response.status}.`,
      }));
      const serverMessage = errorBody.message || "";
      if (response.status === 401) {
        if (!isLogin) this.token = null;
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
    return response.json();
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const body: Record<string, string> = {
      email: credentials.email,
      password: credentials.password,
    };
    if (credentials.tenantId) body.tenantId = credentials.tenantId;
    const response = await fetch(`${this.getUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.handleResponse<LoginResponse>(response, true);
  }

  async forgotPassword(email: string): Promise<any> {
    const response = await fetch(`${this.getUrl()}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return this.handleResponse<any>(response);
  }

  async getProfile(): Promise<Profile> {
    const response = await fetch(`${this.getUrl()}/patient/profile`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<Profile>(response);
  }

  async updateProfile(data: ProfileUpdateData): Promise<Profile> {
    const response = await fetch(`${this.getUrl()}/patient/profile`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<Profile>(response);
  }

  async getAppointments(): Promise<Appointment[]> {
    const response = await fetch(`${this.getUrl()}/patient/appointments`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<Appointment[]>(response);
  }

  async requestAppointment(data: AppointmentRequest): Promise<any> {
    const response = await fetch(`${this.getUrl()}/patient/appointment-requests`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse(response);
  }

  async getPrescriptions(): Promise<Prescription[]> {
    const response = await fetch(`${this.getUrl()}/patient/prescriptions`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<Prescription[]>(response);
  }

  async getLabResults(): Promise<LabResult[]> {
    const response = await fetch(`${this.getUrl()}/patient/lab-results`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<LabResult[]>(response);
  }

  async getMessages(): Promise<Message[]> {
    const response = await fetch(`${this.getUrl()}/medical-communications`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<Message[]>(response);
  }

  async sendMessage(subject: string, message: string, recipientId?: string): Promise<any> {
    const response = await fetch(`${this.getUrl()}/medical-communications`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        type: "general_message",
        priority: "normal",
        originalContent: { subject, message },
        ...(recipientId && { recipientId }),
      }),
    });
    return this.handleResponse(response);
  }

  async getVisitSummaries(): Promise<VisitSummary[]> {
    const response = await fetch(`${this.getUrl()}/patient/visit-summaries`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<VisitSummary[]>(response);
  }

  async getBills(): Promise<Bill[]> {
    const response = await fetch(`${this.getUrl()}/patient/bills`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<Bill[]>(response);
  }
}
