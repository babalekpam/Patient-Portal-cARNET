import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { EHRAdapter } from "@/lib/ehr/types";

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
  await AsyncStorage.setItem(TOKEN_KEY, token);
};

export const getToken = async (): Promise<string | null> => {
  return AsyncStorage.getItem(TOKEN_KEY);
};

export const clearToken = async (): Promise<void> => {
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

  setAdapter(adapter: EHRAdapter | null): void {
    this._adapter = adapter;
  }

  get adapter(): EHRAdapter | null {
    return this._adapter;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    const token = await getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
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
        if (!isLogin) {
          await clearToken();
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
    return response.json();
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    if (this._adapter) {
      const result = await this._adapter.login(credentials);
      this._adapter.setToken(result.token);
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
    return this.handleResponse<any>(response);
  }

  async getProfile(): Promise<Profile> {
    if (this._adapter) return this._adapter.getProfile();
    const response = await fetch(`${getBaseUrl()}/patient/profile`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Profile>(response);
  }

  async updateProfile(data: ProfileUpdateData): Promise<Profile> {
    if (this._adapter) return this._adapter.updateProfile(data);
    const response = await fetch(`${getBaseUrl()}/patient/profile`, {
      method: "PATCH",
      headers: await this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse<Profile>(response);
  }

  async getAppointments(): Promise<Appointment[]> {
    if (this._adapter) return this._adapter.getAppointments();
    const response = await fetch(`${getBaseUrl()}/patient/appointments`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Appointment[]>(response);
  }

  async getPrescriptions(): Promise<Prescription[]> {
    if (this._adapter) return this._adapter.getPrescriptions();
    const response = await fetch(`${getBaseUrl()}/patient/prescriptions`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Prescription[]>(response);
  }

  async getLabResults(): Promise<LabResult[]> {
    if (this._adapter) return this._adapter.getLabResults();
    const response = await fetch(`${getBaseUrl()}/patient/lab-results`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<LabResult[]>(response);
  }

  async getMessages(): Promise<Message[]> {
    if (this._adapter) return this._adapter.getMessages();
    const response = await fetch(`${getBaseUrl()}/medical-communications`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Message[]>(response);
  }

  async sendMessage(subject: string, message: string, recipientId?: string): Promise<any> {
    if (this._adapter) return this._adapter.sendMessage(subject, message, recipientId);
    const response = await fetch(`${getBaseUrl()}/medical-communications`, {
      method: "POST",
      headers: await this.getHeaders(),
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
    if (this._adapter) return this._adapter.getVisitSummaries();
    const response = await fetch(`${getBaseUrl()}/patient/visit-summaries`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<VisitSummary[]>(response);
  }

  async requestAppointment(data: AppointmentRequest): Promise<any> {
    if (this._adapter) return this._adapter.requestAppointment(data);
    const response = await fetch(`${getBaseUrl()}/patient/appointment-requests`, {
      method: "POST",
      headers: await this.getHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse(response);
  }

  async getBills(): Promise<Bill[]> {
    if (this._adapter) return this._adapter.getBills();
    const response = await fetch(`${getBaseUrl()}/patient/bills`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Bill[]>(response);
  }
}

export const api = new ApiClient();
