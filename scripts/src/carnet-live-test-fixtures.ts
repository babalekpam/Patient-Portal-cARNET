export type JsonRecord = Record<string, unknown>;
export type PatientRole = "A1" | "A2" | "B1";

export const PATIENT_ROLES: PatientRole[] = ["A1", "A2", "B1"];

export interface LocatedRecord {
  record: JsonRecord;
  parentArray?: unknown[];
  index?: number;
}

export interface FixtureExpectation {
  identity: { patientId: string; tenantId: string };
  messageId?: string;
  resultIds: string[];
}

export class FixtureSchemaError extends Error {
  constructor() {
    super("fixture schema");
    this.name = "FixtureSchemaError";
  }
}

function invalid(): never {
  throw new FixtureSchemaError();
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  // Do not trim this value. In particular, password bytes must be sent
  // exactly as retained in the secret.
  return typeof value === "string" && value.length > 0;
}

export function stringValue(record: JsonRecord | undefined, key: string): string | undefined {
  const value = record?.[key];
  return isNonEmptyString(value) ? value : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))];
}

function recordAtPath(value: unknown, path: string[]): JsonRecord | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return isRecord(current) ? current : undefined;
}

function walkRecords(
  value: unknown,
  visit: (located: LocatedRecord) => void,
  seen = new Set<object>(),
  parentArray?: unknown[],
  index?: number,
  depth = 0,
): void {
  if (depth > 16 || (!isRecord(value) && !Array.isArray(value))) return;
  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) return;
    seen.add(value);
  }
  if (isRecord(value)) {
    visit({ record: value, parentArray, index });
    for (const child of Object.values(value)) {
      walkRecords(child, visit, seen, undefined, undefined, depth + 1);
    }
    return;
  }
  for (const [childIndex, child] of value.entries()) {
    walkRecords(child, visit, seen, value, childIndex, depth + 1);
  }
}

function dedupeLocatedRecords(records: LocatedRecord[]): LocatedRecord[] {
  const seen = new Set<object>();
  return records.filter(({ record }) => {
    if (seen.has(record)) return false;
    seen.add(record);
    return true;
  });
}

function roleFromEmail(email: string): PatientRole | undefined {
  const localPart = email.split("@", 1)[0].toLowerCase();
  for (const role of PATIENT_ROLES) {
    const marker = role.toLowerCase();
    if (
      localPart.includes(`patient${marker}`) ||
      localPart === marker ||
      new RegExp(`(?:^|[^a-z0-9])${marker}(?:[^a-z0-9]|$)`).test(localPart)
    ) {
      return role;
    }
  }
  return undefined;
}

function patientRolePaths(role: PatientRole): string[][] {
  const marker = `patient${role}`;
  return [
    [marker],
    [`${marker}Credentials`],
    ["credentials", marker],
    ["credentials", `${marker}Credentials`],
    ["patients", marker],
    ["patient", marker],
    ["identity", marker],
    ["retained", marker],
    ["data", marker],
  ];
}

function credentialRecord(record: JsonRecord): boolean {
  return isNonEmptyString(record.email) && isNonEmptyString(record.password);
}

export function findCredentialRecord(value: unknown, role: PatientRole): LocatedRecord {
  if (!isRecord(value)) invalid();

  const knownPathCandidates = dedupeLocatedRecords(
    patientRolePaths(role)
      .map((path) => recordAtPath(value, path))
      .filter((record): record is JsonRecord => record !== undefined)
      .filter(credentialRecord)
      .map((record) => ({ record })),
  );
  if (knownPathCandidates.length === 1) return knownPathCandidates[0];
  if (knownPathCandidates.length > 1) invalid();

  const candidates: LocatedRecord[] = [];
  walkRecords(value, (located) => {
    if (credentialRecord(located.record)) candidates.push(located);
  });
  const uniqueCandidates = dedupeLocatedRecords(candidates);
  const targetCandidates = uniqueCandidates.filter(({ record }) =>
    roleFromEmail(record.email as string) === role,
  );
  if (targetCandidates.length === 1) return targetCandidates[0];
  // A single unlabelled credential is safe; multiple retained patients are
  // never guessed at.
  if (uniqueCandidates.length === 1) return uniqueCandidates[0];
  invalid();
}

function directIdentity(record: JsonRecord): {
  patientId?: string;
  tenantId?: string;
} {
  const patient = isRecord(record.patient) ? record.patient : undefined;
  const tenant = isRecord(record.tenant) ? record.tenant : undefined;

  const patientId = uniqueStrings([
    stringValue(record, "patientId"),
    stringValue(patient, "patientId"),
    stringValue(patient, "id"),
  ]);
  const tenantId = uniqueStrings([
    stringValue(record, "tenantId"),
    stringValue(patient, "tenantId"),
    stringValue(tenant, "tenantId"),
    stringValue(tenant, "id"),
  ]);

  return {
    patientId: patientId.length === 1 ? patientId[0] : undefined,
    tenantId: tenantId.length === 1 ? tenantId[0] : undefined,
  };
}

function hasCompleteIdentity(identity: {
  patientId?: string;
  tenantId?: string;
}): identity is { patientId: string; tenantId: string } {
  return Boolean(identity.patientId && identity.tenantId);
}

function collectArrays(value: unknown): unknown[][] {
  const arrays: unknown[][] = [];
  const seen = new Set<object>();
  const visit = (current: unknown, depth: number): void => {
    if (depth > 16 || (!isRecord(current) && !Array.isArray(current))) return;
    if (typeof current === "object" && current !== null) {
      if (seen.has(current)) return;
      seen.add(current);
    }
    if (Array.isArray(current)) {
      arrays.push(current);
      for (const child of current) visit(child, depth + 1);
    } else {
      for (const child of Object.values(current)) visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return arrays;
}

export function fixtureRecord(
  value: unknown,
  credential: LocatedRecord,
  role: PatientRole,
): FixtureExpectation {
  if (!isRecord(value)) invalid();

  const knownPathCandidates = dedupeLocatedRecords(
    patientRolePaths(role)
      .map((path) => recordAtPath(value, path))
      .filter((record): record is JsonRecord => record !== undefined)
      .map((record) => ({ record })),
  );
  for (const candidate of knownPathCandidates) {
    const identity = directIdentity(candidate.record);
    if (hasCompleteIdentity(identity)) {
      return {
        identity,
        messageId: knownFixtureMessageId(value, role),
        resultIds: knownFixtureResultIds(value, role),
      };
    }
  }

  const identityArrays = collectArrays(value).filter((array) =>
    array.some((entry) => isRecord(entry) && hasCompleteIdentity(directIdentity(entry))),
  );
  const aligned = credential.parentArray
    ? identityArrays.filter((array) => array.length === credential.parentArray?.length)
    : [];
  const alignedCandidates = aligned
    .map((array) => array[credential.index ?? -1])
    .filter((entry): entry is JsonRecord => isRecord(entry))
    .map((record) => ({ record, identity: directIdentity(record) }))
    .filter(({ record, identity }) =>
      hasCompleteIdentity(identity) &&
      (typeof record.role !== "string" || record.role.toLowerCase() === "patient"),
    );
  const distinctAligned = alignedCandidates.filter(({ identity }, index, all) =>
    all.findIndex((candidate) =>
      candidate.identity.patientId === identity.patientId &&
      candidate.identity.tenantId === identity.tenantId,
    ) === index,
  );
  if (distinctAligned.length === 1) {
    const alignedIdentity = distinctAligned[0].identity;
    if (!hasCompleteIdentity(alignedIdentity)) invalid();
    return {
      identity: {
        patientId: alignedIdentity.patientId,
        tenantId: alignedIdentity.tenantId,
      },
      messageId: knownFixtureMessageId(value, role),
      resultIds: knownFixtureResultIds(value, role),
    };
  }

  const candidates: Array<{ patientId: string; tenantId: string }> = [];
  walkRecords(value, ({ record }) => {
    const identity = directIdentity(record);
    if (
      hasCompleteIdentity(identity) &&
      (typeof record.role !== "string" || record.role.toLowerCase() === "patient")
    ) {
      candidates.push(identity);
    }
  });
  const distinctCandidates = candidates.filter((identity, index, all) =>
    all.findIndex((candidate) =>
      candidate.patientId === identity.patientId && candidate.tenantId === identity.tenantId,
    ) === index,
  );
  if (distinctCandidates.length !== 1) invalid();
  const candidateIdentity = distinctCandidates[0];
  return {
    identity: candidateIdentity,
    messageId: knownFixtureMessageId(value, role),
    resultIds: knownFixtureResultIds(value, role),
  };
}

function knownFixtureMessageId(value: unknown, role: PatientRole): string | undefined {
  const keys = new Set([
    "initialLaboratoryMessageId",
    "laboratoryMessageId",
    "expectedLaboratoryMessageId",
    "initialMessageId",
    `patient${role}InitialLaboratoryMessageId`,
    `patient${role}LaboratoryMessageId`,
    `patient${role}ExpectedLaboratoryMessageId`,
  ]);
  const values: string[] = [];
  walkRecords(value, ({ record }) => {
    for (const key of keys) {
      const candidate = stringValue(record, key);
      if (candidate) values.push(candidate);
    }
  });
  const distinct = [...new Set(values)];
  if (distinct.length > 1) invalid();
  return distinct[0];
}

function knownFixtureResultIds(value: unknown, role: PatientRole): string[] {
  const keys = new Set([
    "initialLabResultId",
    "labResultId",
    "expectedLabResultId",
    "laboratoryResultId",
    `patient${role}InitialLabResultId`,
    `patient${role}LabResultId`,
    `patient${role}ExpectedLabResultId`,
  ]);
  const values: string[] = [];
  walkRecords(value, ({ record }) => {
    for (const key of keys) {
      const candidate = stringValue(record, key);
      if (candidate) values.push(candidate);
    }
  });
  const distinct = [...new Set(values)];
  if (distinct.length > 1) invalid();
  return distinct;
}