import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = "https://navimedi.org/api";
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
  tenantId: string;
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
}

class ApiClient {
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

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      if (response.status === 401) {
        await clearToken();
        throw new Error("Session expired. Please log in again.");
      }
      if (response.status === 404) {
        throw new Error("This feature is not yet available.");
      }
      if (response.status === 500) {
        throw new Error("Server error. Please try again later.");
      }
      const error = await response.json().catch(() => ({
        message: `Request failed with status ${response.status}.`,
      }));
      throw new Error(error.message || `Request failed with status ${response.status}.`);
    }
    return response.json();
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    return this.handleResponse<LoginResponse>(response);
  }

  async getProfile(): Promise<Profile> {
    const response = await fetch(`${BASE_URL}/patient/profile`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Profile>(response);
  }

  async getAppointments(): Promise<Appointment[]> {
    const response = await fetch(`${BASE_URL}/patient/appointments`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Appointment[]>(response);
  }

  async getPrescriptions(): Promise<Prescription[]> {
    const response = await fetch(`${BASE_URL}/patient/prescriptions`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Prescription[]>(response);
  }

  async getLabResults(): Promise<LabResult[]> {
    const response = await fetch(`${BASE_URL}/patient/lab-results`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<LabResult[]>(response);
  }

  async getMessages(): Promise<Message[]> {
    const response = await fetch(`${BASE_URL}/medical-communications`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Message[]>(response);
  }

  async sendMessage(subject: string, message: string, recipientId?: string): Promise<any> {
    const response = await fetch(`${BASE_URL}/medical-communications`, {
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

  async getBills(): Promise<Bill[]> {
    const response = await fetch(`${BASE_URL}/patient/bills`, {
      headers: await this.getHeaders(),
    });
    return this.handleResponse<Bill[]>(response);
  }
}

export const api = new ApiClient();
