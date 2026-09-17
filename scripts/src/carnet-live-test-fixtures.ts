export type JsonRecord = Record<string, unknown>;
export type PatientRole = "A1" | "A2" | "B1";

export const PATIENT_ROLES: PatientRole[] = ["A1", "A2", "B1"];

export interface LocatedRecord {
  record: JsonRecord;
  parentArray?: unknown[];
  index?: number;
  path?: string[];
}

export interface FixtureExpectation {
  identity: { patientId: string; tenantId: string };
  labOrderId?: string;
  messageId?: string;
  resultIds: string[];
}

/**
 * Development-only references for records that already exist in NaviMED.
 *
 * These are deliberately separate from the credential/identity fixture
 * envelope.  The reference secret is an assertion about retained records,
 * not a second source of patient identity.  Callers must compare `owner` to
 * the independently resolved patient fixture before using any ID.
 */
export interface ClinicalRecordReferences {
  owner: { patientId: string; tenantId: string };
  labOrderId?: string;
  messageId?: string;
  releasedResultIds: string[];
  hasResultReference: boolean;
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
  path: string[] = [],
): void {
  if (depth > 16 || (!isRecord(value) && !Array.isArray(value))) return;
  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) return;
    seen.add(value);
  }
  if (isRecord(value)) {
    visit({ record: value, parentArray, index, path });
    for (const [key, child] of Object.entries(value)) {
      walkRecords(child, visit, seen, undefined, undefined, depth + 1, [...path, key]);
    }
    return;
  }
  for (const [childIndex, child] of value.entries()) {
    walkRecords(child, visit, seen, value, childIndex, depth + 1, [
      ...path,
      String(childIndex),
    ]);
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
    stringValue(record, "patientTenantId"),
    stringValue(record, "patient_tenant_id"),
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
        labOrderId: knownFixtureLabOrderId(value, role),
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
      labOrderId: knownFixtureLabOrderId(value, role),
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
    labOrderId: knownFixtureLabOrderId(value, role),
    messageId: knownFixtureMessageId(value, role),
    resultIds: knownFixtureResultIds(value, role),
  };
}

const MAX_EXPECTED_CLINICAL_ID_CHARS = 256;
const MAX_EXPECTED_RESULT_IDS = 128;

function isSafeExpectedClinicalId(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    value.length <= MAX_EXPECTED_CLINICAL_ID_CHARS &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function roleMarker(value: string): PatientRole | undefined {
  const normalized = value.toLowerCase();
  for (const role of PATIENT_ROLES) {
    const marker = `patient${role.toLowerCase()}`;
    if (
      normalized === role.toLowerCase() ||
      normalized === marker ||
      normalized === `${marker}credentials`
    ) {
      return role;
    }
  }
  return undefined;
}

function markedRoles(value: unknown): Set<PatientRole> {
  const roles = new Set<PatientRole>();
  walkRecords(value, ({ path }) => {
    for (const segment of path || []) {
      const role = roleMarker(segment);
      if (role) roles.add(role);
    }
  });
  return roles;
}

function roleSpecificKey(value: string, role: PatientRole): boolean {
  return value.toLowerCase().startsWith(`patient${role.toLowerCase()}`);
}

function roleFromClinicalKey(value: string): PatientRole | undefined {
  for (const role of PATIENT_ROLES) {
    if (roleSpecificKey(value, role)) return role;
  }
  return undefined;
}

function isInOtherRolePath(path: string[] | undefined, role: PatientRole): boolean {
  return Boolean(
    path?.some((segment) => {
      const marker = roleMarker(segment);
      return marker !== undefined && marker !== role;
    }),
  );
}

/**
 * Only consume the documented expected-key names. A generic recursive search
 * must not treat an arbitrary clinical-looking value as ownership evidence.
 * Role-labelled records are excluded from another role, so A1's expected
 * marker cannot accidentally become B1's marker.
 */
function knownFixtureValues(
  value: unknown,
  role: PatientRole,
  keys: readonly string[],
  arraysAllowed: boolean,
): string[] {
  const keySet = new Set(keys);
  const values: string[] = [];
  const rolesInEnvelope = markedRoles(value);
  walkRecords(value, ({ record, path }) => {
    for (const key of keySet) {
      if (!(key in record) || isInOtherRolePath(path, role)) continue;
      const keyRole = roleFromClinicalKey(key);
      if (keyRole !== undefined && keyRole !== role) continue;
      const hasCurrentRolePath = path?.some((segment) => roleMarker(segment) === role);
      if (!roleSpecificKey(key, role) && !hasCurrentRolePath && rolesInEnvelope.size > 1) {
        // A global marker cannot be safely assigned to one of several
        // retained patients without a role-labelled path.
        continue;
      }

      const candidate = record[key];
      if (isSafeExpectedClinicalId(candidate)) {
        values.push(candidate);
        continue;
      }
      if (arraysAllowed && Array.isArray(candidate)) {
        if (
          candidate.length > MAX_EXPECTED_RESULT_IDS ||
          !candidate.every(isSafeExpectedClinicalId)
        ) {
          invalid();
        }
        values.push(...candidate);
        continue;
      }
      invalid();
    }
  });
  return [...new Set(values)];
}

function knownFixtureLabOrderId(value: unknown, role: PatientRole): string | undefined {
  const values = knownFixtureValues(
    value,
    role,
    [
      "initialLabOrderId",
      "labOrderId",
      "laboratoryOrderId",
      "expectedLabOrderId",
      `patient${role}InitialLabOrderId`,
      `patient${role}LabOrderId`,
      `patient${role}ExpectedLabOrderId`,
    ],
    false,
  );
  if (values.length > 1) invalid();
  return values[0];
}

function knownFixtureMessageId(value: unknown, role: PatientRole): string | undefined {
  const values = knownFixtureValues(
    value,
    role,
    [
      "initialLaboratoryMessageId",
      "laboratoryMessageId",
      "expectedLaboratoryMessageId",
      "initialMessageId",
      `patient${role}InitialLaboratoryMessageId`,
      `patient${role}LaboratoryMessageId`,
      `patient${role}ExpectedLaboratoryMessageId`,
    ],
    false,
  );
  if (values.length > 1) invalid();
  return values[0];
}

function knownFixtureResultIds(value: unknown, role: PatientRole): string[] {
  return knownFixtureValues(
    value,
    role,
    [
      "initialLabResultId",
      "labResultId",
      "expectedLabResultId",
      "laboratoryResultId",
      "initialLabResultIds",
      "labResultIds",
      "expectedLabResultIds",
      "laboratoryResultIds",
      `patient${role}InitialLabResultId`,
      `patient${role}LabResultId`,
      `patient${role}ExpectedLabResultId`,
      `patient${role}InitialLabResultIds`,
      `patient${role}LabResultIds`,
      `patient${role}ExpectedLabResultIds`,
    ],
    true,
  );
}

const REFERENCE_ORDER_KEYS = [
  "existingLabOrderId",
  "existingLaboratoryOrderId",
  "existingOrderId",
  "initialLabOrderId",
  "initialLaboratoryOrderId",
  "labOrderId",
  "laboratoryOrderId",
  "orderId",
  "pendingLabOrderId",
  "pendingLaboratoryOrderId",
  "pendingOrderId",
  "patientA1ExistingLabOrderId",
  "patientA2ExistingLabOrderId",
  "patientB1ExistingLabOrderId",
  "patientA1PendingLabOrderId",
  "patientA2PendingLabOrderId",
  "patientB1PendingLabOrderId",
] as const;

const REFERENCE_MESSAGE_KEYS = [
  "existingLaboratoryMessageId",
  "existingLabMessageId",
  "existingMessageId",
  "initialLaboratoryMessageId",
  "initialLabMessageId",
  "initialMessageId",
  "laboratoryMessageId",
  "labMessageId",
  "messageId",
  "patientA1ExistingLaboratoryMessageId",
  "patientA2ExistingLaboratoryMessageId",
  "patientB1ExistingLaboratoryMessageId",
  "patientA1ExistingMessageId",
  "patientA2ExistingMessageId",
  "patientB1ExistingMessageId",
] as const;

const REFERENCE_RESULT_KEYS = [
  "resultId",
  "labResultId",
  "laboratoryResultId",
  "resultIds",
  "labResultIds",
  "laboratoryResultIds",
  "releasedResultId",
  "releasedLabResultId",
  "releasedLaboratoryResultId",
  "releasedResultIds",
  "releasedLabResultIds",
  "releasedLaboratoryResultIds",
  "expectedReleasedResultId",
  "expectedReleasedResultIds",
  "patientA1ReleasedResultId",
  "patientA2ReleasedResultId",
  "patientB1ReleasedResultId",
  "patientA1ReleasedResultIds",
  "patientA2ReleasedResultIds",
  "patientB1ReleasedResultIds",
] as const;

const RELEASED_RESULT_KEYS = [
  "releasedResultId",
  "releasedLabResultId",
  "releasedLaboratoryResultId",
  "releasedResultIds",
  "releasedLabResultIds",
  "releasedLaboratoryResultIds",
  "expectedReleasedResultId",
  "expectedReleasedResultIds",
  "patientA1ReleasedResultId",
  "patientA2ReleasedResultId",
  "patientB1ReleasedResultId",
  "patientA1ReleasedResultIds",
  "patientA2ReleasedResultIds",
  "patientB1ReleasedResultIds",
] as const;

function optionalReferenceValues(
  value: unknown,
  role: PatientRole,
  keys: readonly string[],
  arraysAllowed: boolean,
): { values: string[]; present: boolean } {
  const keySet = new Set(keys);
  const values: string[] = [];
  let present = false;
  const rolesInEnvelope = markedRoles(value);
  walkRecords(value, ({ record, path }) => {
    for (const key of keySet) {
      if (!(key in record) || isInOtherRolePath(path, role)) continue;
      const keyRole = roleFromClinicalKey(key);
      if (keyRole !== undefined && keyRole !== role) continue;
      const hasCurrentRolePath = path?.some((segment) => roleMarker(segment) === role);
      if (!roleSpecificKey(key, role) && !hasCurrentRolePath && rolesInEnvelope.size > 1) {
        continue;
      }
      const candidate = record[key];
      if (candidate === null) continue;
      present = true;
      if (isSafeExpectedClinicalId(candidate)) {
        values.push(candidate);
        continue;
      }
      if (
        arraysAllowed &&
        Array.isArray(candidate) &&
        candidate.length <= MAX_EXPECTED_RESULT_IDS &&
        candidate.every(isSafeExpectedClinicalId)
      ) {
        values.push(...candidate);
        continue;
      }
      invalid();
    }
  });
  return { values: [...new Set(values)], present };
}

function referenceOwner(value: unknown, role: PatientRole): {
  patientId: string;
  tenantId: string;
} {
  const candidates: Array<{ patientId: string; tenantId: string }> = [];
  walkRecords(value, ({ record, path }) => {
    if (!path?.some((segment) => roleMarker(segment) === role)) {
      return;
    }
    const explicitOwnerPath = path.some((segment) =>
      /^(owner|ownership|patient|subject)$/i.test(segment),
    );
    const explicitRoleEnvelope =
      "patientId" in record &&
      ("tenantId" in record || "patientTenantId" in record || "patient_tenant_id" in record) &&
      Object.keys(record).some((key) =>
        /(?:order|message|result)/i.test(key),
      );
    if (!explicitOwnerPath && !explicitRoleEnvelope) return;
    const identity = directIdentity(record);
    if (hasCompleteIdentity(identity)) candidates.push(identity);
  });
  const distinct = candidates.filter(
    (identity, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.patientId === identity.patientId && candidate.tenantId === identity.tenantId,
      ) === index,
  );
  if (distinct.length !== 1) invalid();
  return distinct[0];
}

/**
 * Parse only the bounded, role-labelled expected-record keys.  In
 * particular, this never promotes an arbitrary ID returned by NaviMED to an
 * ownership assertion.  A role must have an explicit owner object and
 * explicit order/message/result reference keys in the secret.
 */
export function clinicalRecordReferences(
  value: unknown,
  role: PatientRole,
): ClinicalRecordReferences {
  if (!isRecord(value)) invalid();
  const owner = referenceOwner(value, role);
  const order = optionalReferenceValues(value, role, REFERENCE_ORDER_KEYS, false);
  const message = optionalReferenceValues(value, role, REFERENCE_MESSAGE_KEYS, false);
  const results = optionalReferenceValues(value, role, REFERENCE_RESULT_KEYS, true);
  const releasedResults = optionalReferenceValues(value, role, RELEASED_RESULT_KEYS, true);
  if (order.values.length > 1 || message.values.length > 1 || releasedResults.values.length > MAX_EXPECTED_RESULT_IDS) {
    invalid();
  }
  if (message.present && message.values.length === 0) invalid();
  if (order.present && order.values.length === 0) invalid();
  if (results.present && results.values.length > 0 && releasedResults.values.length === 0) {
    // A result reference without a released-result marker is not sufficient
    // for the clinical proof requested by this harness.
    invalid();
  }
  return {
    owner,
    labOrderId: order.values[0],
    messageId: message.values[0],
    releasedResultIds: releasedResults.values,
    hasResultReference: results.present && results.values.length > 0,
  };
}