const FHIR_ID = /^[A-Za-z0-9.-]{1,64}$/;

/**
 * Accept only the patient context explicitly returned by the authenticated
 * token endpoint. Email addresses and token payloads are never used to infer it.
 */
export function requireFhirPatientContext(response: unknown): string {
  if (!response || typeof response !== "object") {
    throw new Error("The FHIR server did not provide an authenticated patient context.");
  }
  const patient = (response as Record<string, unknown>).patient;
  if (typeof patient !== "string" || !FHIR_ID.test(patient)) {
    throw new Error("The FHIR server did not provide a valid authenticated patient context.");
  }
  return patient;
}

export function fhirPatientReference(patientId: string): string {
  if (!FHIR_ID.test(patientId)) throw new Error("Invalid authenticated FHIR patient context.");
  return `Patient/${patientId}`;
}