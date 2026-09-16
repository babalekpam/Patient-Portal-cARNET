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

export interface EHRAdapter {
  readonly providerId: string;
  readonly sessionKey: string;

  login(credentials: LoginCredentials): Promise<LoginResponse>;
  forgotPassword(email: string): Promise<any>;

  getProfile(): Promise<Profile>;
  updateProfile(data: ProfileUpdateData): Promise<Profile>;

  getAppointments(): Promise<Appointment[]>;
  bookAppointment(data: AppointmentBookingData): Promise<Appointment>;
  requestAppointment(data: AppointmentRequest): Promise<any>;

  getPrescriptions(): Promise<Prescription[]>;
  getLabResults(): Promise<LabResult[]>;
  getMessages(): Promise<Message[]>;
  getLaboratoryMessages?(): Promise<LaboratoryMessage[]>;
  replyToLaboratoryMessage?(id: string, content: string): Promise<LaboratoryMessage>;
  markLaboratoryMessageRead?(id: string): Promise<LaboratoryMessage>;
  sendMessage(subject: string, message: string, recipientId?: string): Promise<any>;
  getVisitSummaries(): Promise<VisitSummary[]>;
  getBills(): Promise<Bill[]>;

  getTelehealthAppointments(): Promise<TelehealthAppointment[]>;
  createTelehealthSession(appointmentId: string): Promise<TelehealthSession>;
  getTelehealthSession(appointmentId: string): Promise<TelehealthSession>;

  setToken(token: string): void;
  setLoginContext(response: LoginResponse): void;
  clearToken(): void;
  verifyLoginProfile?(response: LoginResponse): Promise<Profile>;
  revokeToken?(token: string): Promise<void>;
  logout?(): Promise<void>;
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
