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

export interface EHRAdapter {
  readonly providerId: string;

  login(credentials: LoginCredentials): Promise<LoginResponse>;
  forgotPassword(email: string): Promise<any>;

  getProfile(): Promise<Profile>;
  updateProfile(data: ProfileUpdateData): Promise<Profile>;

  getAppointments(): Promise<Appointment[]>;
  requestAppointment(data: AppointmentRequest): Promise<any>;

  getPrescriptions(): Promise<Prescription[]>;
  getLabResults(): Promise<LabResult[]>;
  getMessages(): Promise<Message[]>;
  sendMessage(subject: string, message: string, recipientId?: string): Promise<any>;
  getVisitSummaries(): Promise<VisitSummary[]>;
  getBills(): Promise<Bill[]>;

  setToken(token: string): void;
  clearToken(): void;
}

export type EHRType = "navimedi" | "fhir" | "custom";

export interface EHRProviderConfig {
  id: string;
  name: string;
  type: EHRType;
  baseUrl: string;
  description?: string;
  region?: string;
  icon?: string;
  fhirVersion?: string;
  authType?: "bearer" | "oauth2" | "smart";
  clientId?: string;
  scopes?: string[];
  supportsMessaging?: boolean;
  supportsBilling?: boolean;
  supportsVisitSummaries?: boolean;
}

export interface EHRConnection {
  provider: EHRProviderConfig;
  adapter: EHRAdapter;
  isConnected: boolean;
}
