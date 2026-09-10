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
  TelehealthAppointment,
  TelehealthSession,
  VisitSummary,
} from "@/lib/api";
import { assertSession, notifySessionEnd, sessionGeneration } from "@/lib/session";
import { fhirPatientReference, requireFhirPatientContext } from "@/lib/sessionFHIR";

interface FHIRBundle {
  resourceType: "Bundle";
  entry?: Array<{ resource: any }>;
  total?: number;
}

export class FHIRAdapter implements EHRAdapter {
  readonly providerId: string;
  readonly sessionKey: string;
  private baseUrl: string;
  private token: string | null = null;
  private patientId: string | null = null;

  constructor(providerId: string, baseUrl: string) {
    this.providerId = providerId;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    const issuer = new URL(baseUrl);
    issuer.username = "";
    issuer.password = "";
    issuer.search = "";
    issuer.hash = "";
    issuer.pathname = issuer.pathname.replace(/\/+$/, "");
    this.sessionKey = `${providerId}|${issuer.toString().replace(/\/$/, "")}`;
  }

  setToken(token: string): void {
    this.token = token;
  }

  setLoginContext(response: LoginResponse): void {
    const patientId = requireFhirPatientContext({ patient: response.patientContext });
    this.token = response.token;
    this.patientId = patientId;
  }

  clearToken(): void {
    this.token = null;
    this.patientId = null;
  }

  private getHeaders(): HeadersInit {
    assertSession(this.sessionKey);
    const headers: HeadersInit = {
      "Content-Type": "application/fhir+json",
      Accept: "application/fhir+json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const generation = sessionGeneration();
    assertSession(this.sessionKey, generation);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...this.getHeaders(), ...(options?.headers || {}) },
    });
    assertSession(this.sessionKey, generation);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      assertSession(this.sessionKey, generation);
      const issue = body?.issue?.[0]?.diagnostics || body?.message;
      if (response.status === 401) {
        this.token = null;
        notifySessionEnd("unauthorized");
        throw new Error(issue || "Session expired. Please log in again.");
      }
      throw new Error(issue || `FHIR request failed (${response.status})`);
    }
    const body = await response.json();
    assertSession(this.sessionKey, generation);
    return body;
  }

  private extractResources<T>(bundle: FHIRBundle): T[] {
    return (bundle.entry || []).map((e) => e.resource) as T[];
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "password",
          username: credentials.email,
          password: credentials.password,
        }),
      });
    } catch (err: any) {
      throw new Error("Unable to connect to the FHIR server. Please check the endpoint URL and try again.");
    }

    if (response.status === 404) {
      throw new Error("This endpoint does not support password authentication. Please verify the FHIR server URL.");
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error("Invalid credentials. Please check your email and password.");
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const msg = errorBody.message || errorBody.error_description || "";
      throw new Error(msg || `Authentication failed (${response.status}). Please verify your endpoint and credentials.`);
    }

    const data = await response.json();
    const token = data.access_token || data.token;
    if (!token) {
      throw new Error("Server did not return an authentication token. This endpoint may not support this login method.");
    }
    const patientId = requireFhirPatientContext(data);
    return {
      token,
      user: { id: patientId, email: credentials.email },
      tenant: null,
      patientContext: patientId,
      expires_in: data.expires_in,
      expires_at: data.expires_at,
    };
  }

  async forgotPassword(email: string): Promise<any> {
    return { message: "Password reset is not supported via FHIR. Please contact your provider." };
  }

  async getProfile(): Promise<Profile> {
    const patientReference = this.getPatientReference();
    const patient = await this.request<any>(`/${patientReference}`);
    return this.mapPatientToProfile(patient);
  }

  private getPatientReference(): string {
    if (!this.patientId) {
      // A restored bearer token is insufficient: patient context is deliberately
      // not guessed or decoded. Cold-restored FHIR sessions require fresh login.
      throw new Error("A fresh FHIR sign in is required to establish patient context.");
    }
    return fhirPatientReference(this.patientId);
  }

  private mapPatientToProfile(patient: any): Profile {
    const name = patient.name?.[0] || {};
    const telecom = patient.telecom || [];
    const address = patient.address?.[0] || {};
    const phone = telecom.find((t: any) => t.system === "phone");
    const email = telecom.find((t: any) => t.system === "email");
    const emergency = patient.contact?.[0];

    return {
      firstName: name.given?.join(" ") || "",
      lastName: name.family || "",
      dateOfBirth: patient.birthDate || "",
      gender: patient.gender || "",
      phone: phone?.value || "",
      email: email?.value || "",
      address: [address.line?.join(", "), address.city, address.state, address.postalCode]
        .filter(Boolean)
        .join(", "),
      mrn:
        patient.identifier?.find((i: any) => i.type?.coding?.[0]?.code === "MR")?.value ||
        patient.id ||
        "",
      bloodType: "",
      allergies: [],
      emergencyContact: emergency?.name?.text || "",
      emergencyPhone:
        emergency?.telecom?.find((t: any) => t.system === "phone")?.value || "",
    };
  }

  async updateProfile(data: ProfileUpdateData): Promise<Profile> {
    const patientReference = this.getPatientReference();

    const current = await this.request<any>(`/${patientReference}`);

    if (data.firstName || data.lastName) {
      current.name = current.name || [{}];
      if (data.firstName) current.name[0].given = [data.firstName];
      if (data.lastName) current.name[0].family = data.lastName;
    }

    const telecom = current.telecom || [];
    if (data.phone) {
      const phoneEntry = telecom.find((t: any) => t.system === "phone");
      if (phoneEntry) phoneEntry.value = data.phone;
      else telecom.push({ system: "phone", value: data.phone });
    }
    if (data.email) {
      const emailEntry = telecom.find((t: any) => t.system === "email");
      if (emailEntry) emailEntry.value = data.email;
      else telecom.push({ system: "email", value: data.email });
    }
    current.telecom = telecom;

    if (data.gender) current.gender = data.gender;
    if (data.dateOfBirth) current.birthDate = data.dateOfBirth;

    const updated = await this.request<any>(`/${patientReference}`, {
      method: "PUT",
      body: JSON.stringify(current),
    });

    return this.mapPatientToProfile(updated);
  }

  async getAppointments(): Promise<Appointment[]> {
    const patientReference = this.getPatientReference();
    const bundle = await this.request<FHIRBundle>(
      `/Appointment?patient=${patientReference}&_sort=-date&_count=50`
    );
    return this.extractResources<any>(bundle).map((appt) => ({
      id: appt.id,
      appointmentType:
        appt.appointmentType?.coding?.[0]?.display ||
        appt.serviceType?.[0]?.coding?.[0]?.display ||
        "",
      appointmentDate: appt.start || "",
      status: appt.status || "",
      reason: appt.reasonCode?.[0]?.text || appt.reasonCode?.[0]?.coding?.[0]?.display || "",
      provider:
        appt.participant?.find((p: any) => p.actor?.reference?.startsWith("Practitioner"))?.actor
          ?.display || "",
      location:
        appt.participant?.find((p: any) => p.actor?.reference?.startsWith("Location"))?.actor
          ?.display || "",
      duration: appt.minutesDuration || undefined,
      notes: appt.comment || "",
    }));
  }

  async requestAppointment(data: AppointmentRequest): Promise<any> {
    const patientReference = this.getPatientReference();
    const resource = {
      resourceType: "Appointment",
      status: "proposed",
      appointmentType: {
        coding: [{ display: data.appointmentType.replace(/_/g, " ") }],
      },
      start: data.preferredDate,
      reasonCode: [{ text: data.reason }],
      comment: [data.doctorPreference, data.notes].filter(Boolean).join(" | "),
      participant: [
        {
          actor: { reference: patientReference },
          status: "accepted",
        },
      ],
    };
    return this.request("/Appointment", {
      method: "POST",
      body: JSON.stringify(resource),
    });
  }

  async getPrescriptions(): Promise<Prescription[]> {
    const patientReference = this.getPatientReference();
    const bundle = await this.request<FHIRBundle>(
      `/MedicationRequest?patient=${patientReference}&_sort=-date&_count=50`
    );
    return this.extractResources<any>(bundle).map((med) => ({
      id: med.id,
      medicationName:
        med.medicationCodeableConcept?.text ||
        med.medicationCodeableConcept?.coding?.[0]?.display ||
        "",
      dosage: med.dosageInstruction?.[0]?.text || "",
      frequency: med.dosageInstruction?.[0]?.timing?.code?.text || "",
      prescribedDate: med.authoredOn || "",
      status: med.status || "",
      refillsRemaining: med.dispenseRequest?.numberOfRepeatsAllowed,
      prescribingProvider: med.requester?.display || "",
      instructions: med.dosageInstruction?.[0]?.patientInstruction || "",
    }));
  }

  async getLabResults(): Promise<LabResult[]> {
    const patientReference = this.getPatientReference();
    const bundle = await this.request<FHIRBundle>(
      `/DiagnosticReport?patient=${patientReference}&_sort=-date&_count=50`
    );
    return this.extractResources<any>(bundle).map((report) => ({
      id: report.id,
      testName: report.code?.text || report.code?.coding?.[0]?.display || "",
      resultDate: report.effectiveDateTime || report.issued || "",
      status: report.status || "",
      category: report.category?.[0]?.coding?.[0]?.display || "",
      orderingProvider: report.performer?.[0]?.display || "",
      results: (report.result || []).map((r: any) => ({
        name: r.display || "",
        value: "",
        unit: "",
      })),
    }));
  }

  async getMessages(): Promise<Message[]> {
    const patientReference = this.getPatientReference();
    const bundle = await this.request<FHIRBundle>(
      `/Communication?patient=${patientReference}&_sort=-sent&_count=50`
    );
    return this.extractResources<any>(bundle).map((comm) => ({
      id: comm.id,
      type: comm.category?.[0]?.coding?.[0]?.code || "general",
      priority: comm.priority || "routine",
      originalContent: {
        subject: comm.topic?.text || "",
        message: comm.payload?.[0]?.contentString || "",
      },
      createdAt: comm.sent || "",
      status: comm.status || "",
      sender: comm.sender?.display || "",
    }));
  }

  async sendMessage(subject: string, message: string, recipientId?: string): Promise<any> {
    const patientReference = this.getPatientReference();
    const resource = {
      resourceType: "Communication",
      status: "completed",
      subject: { reference: patientReference },
      topic: { text: subject },
      payload: [{ contentString: message }],
      ...(recipientId && { recipient: [{ reference: recipientId }] }),
    };
    return this.request("/Communication", {
      method: "POST",
      body: JSON.stringify(resource),
    });
  }

  async getVisitSummaries(): Promise<VisitSummary[]> {
    const patientReference = this.getPatientReference();
    const bundle = await this.request<FHIRBundle>(
      `/Encounter?patient=${patientReference}&_sort=-date&_count=50`
    );
    return this.extractResources<any>(bundle).map((enc) => ({
      id: enc.id,
      visitDate: enc.period?.start || "",
      visitType: enc.type?.[0]?.coding?.[0]?.display || enc.class?.display || "",
      provider:
        enc.participant?.[0]?.individual?.display || "",
      diagnosis:
        enc.diagnosis?.[0]?.condition?.display || "",
      summary: enc.reasonCode?.[0]?.text || "",
      status: enc.status || "",
    }));
  }

  async getBills(): Promise<Bill[]> {
    const patientReference = this.getPatientReference();
    try {
      const bundle = await this.request<FHIRBundle>(
        `/Claim?patient=${patientReference}&_sort=-created&_count=50`
      );
      return this.extractResources<any>(bundle).map((claim) => ({
        id: claim.id,
        totalCharges: claim.total?.value || 0,
        status: claim.status || "",
        serviceDate: claim.billablePeriod?.start || claim.created || "",
        description: claim.type?.coding?.[0]?.display || "",
      }));
    } catch {
      return [];
    }
  }

  async bookAppointment(): Promise<Appointment> {
    throw new Error("Appointment booking is not supported by the FHIR provider");
  }

  async getTelehealthAppointments(): Promise<TelehealthAppointment[]> {
    throw new Error("Telehealth is not supported by the FHIR provider");
  }

  async createTelehealthSession(_appointmentId: string): Promise<TelehealthSession> {
    throw new Error("Telehealth is not supported by the FHIR provider");
  }

  async getTelehealthSession(_appointmentId: string): Promise<TelehealthSession> {
    throw new Error("Telehealth is not supported by the FHIR provider");
  }
}
