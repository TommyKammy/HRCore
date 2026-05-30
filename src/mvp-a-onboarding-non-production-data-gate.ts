export type MvpAOnboardingPracticalUseEvidenceType =
  | "repo_owned_synthetic_fixture"
  | "approved_non_production_dataset";

export interface MvpAOnboardingPracticalUseDataEvidence {
  evidenceType: string;
  datasetReference?: string;
  tenantEnvironmentId?: string;
  maskingProfileReference?: string;
  approvalReference?: string;
  privacyReviewReference?: string;
  dataOwnerApprovalReference?: string;
  approvedAt?: string;
  expiresAt?: string;
  containsRealPersonnelData?: boolean;
  productionLikeSource?: boolean;
}

export interface MvpAOnboardingNonProductionDataGate {
  gateId: "mvp_a_onboarding_non_production_data_handling_v1";
  sourceIssue: "#203";
  sourceGate: "mvp_a_onboarding_pii_export_closed_v1";
  readiness: "bounded_non_production_practical_use_only";
  acceptedEvidenceTypes: readonly MvpAOnboardingPracticalUseEvidenceType[];
  requiredSyntheticEvidence: readonly string[];
  requiredApprovedNonProductionEvidence: readonly string[];
  maskingRequiredFor: readonly string[];
  prohibitedPayloadKeys: readonly string[];
  prohibitedFixtureSeedTokens: readonly string[];
  prohibitedApiResponseFields: readonly string[];
  remainingApprovalBlockers: readonly string[];
  outOfScope: readonly string[];
}

export class MvpAOnboardingNonProductionDataGateError extends Error {
  override name = "MvpAOnboardingNonProductionDataGateError";
}

const acceptedEvidenceTypes = [
  "repo_owned_synthetic_fixture",
  "approved_non_production_dataset",
] as const;

const requiredSyntheticEvidence = [
  "evidenceType",
  "datasetReference",
  "tenantEnvironmentId",
] as const;

const requiredApprovedNonProductionEvidence = [
  "evidenceType",
  "datasetReference",
  "tenantEnvironmentId",
  "maskingProfileReference",
  "approvalReference",
  "privacyReviewReference",
  "dataOwnerApprovalReference",
  "approvedAt",
  "expiresAt",
  "containsRealPersonnelData",
  "productionLikeSource",
] as const;

const maskingRequiredFor = [
  "approved_non_production_dataset",
  "displayName",
  "workEmailExpectation.value",
  "providerSubjectId",
] as const;

const prohibitedPayloadKeys = [
  "realData",
  "real_data",
  "productionData",
  "production_data",
  "productionLikeData",
  "production_like_data",
  "approvedProductionData",
  "approved_production_data",
  "unmaskedPayload",
  "unmasked_payload",
  "unmaskedPerson",
  "unmasked_person",
  "rawEmployeeRecord",
  "raw_employee_record",
] as const;

const prohibitedFixtureSeedTokens = [
  "real employee",
  "production employee",
  "production-like employee",
  "unmasked employee",
  "actual personnel",
  "live personnel",
  "real personnel",
  "sample secret",
  "placeholder credential",
] as const;

const prohibitedApiResponseFields = [
  ...prohibitedPayloadKeys,
  "realPersonnelData",
  "real_personnel_data",
  "productionLikeSource",
  "production_like_source",
  "unmaskedDisplayName",
  "unmasked_display_name",
  "unmaskedEmail",
  "unmasked_email",
  "originalValue",
  "original_value",
] as const;

const concreteEvidenceFields = [
  "datasetReference",
  "tenantEnvironmentId",
  "maskingProfileReference",
  "approvalReference",
  "privacyReviewReference",
  "dataOwnerApprovalReference",
] as const;

const placeholderEvidenceTokens = [
  "placeholder",
  "todo",
  "tbd",
  "sample",
  "fake",
  "dummy",
  "example",
  "changeme",
  "replace-me",
  "redacted",
] as const;

const remainingApprovalBlockers = [
  "#202 P2A-02 bounded/non-production gate remains authoritative",
  "#203 legal/privacy approval evidence placeholder",
  "#203 independent data-owner approval placeholder",
  "#203 two-key approval record placeholder",
  "real personnel data processing remains blocked until later accepted evidence",
] as const;

const outOfScope = [
  "legal approval",
  "privacy approval",
  "two-key approval completion",
  "real personnel data processing",
  "production-like data processing",
  "raw payload viewing",
  "CSV/export",
  "download logs",
  "watermark or manifest generation",
  "My Number handling",
  "Specific Personal Information handling",
  "sensitive personal information handling",
] as const;

export const mvpAOnboardingNonProductionDataGate: MvpAOnboardingNonProductionDataGate =
  Object.freeze({
    gateId: "mvp_a_onboarding_non_production_data_handling_v1",
    sourceIssue: "#203",
    sourceGate: "mvp_a_onboarding_pii_export_closed_v1",
    readiness: "bounded_non_production_practical_use_only",
    acceptedEvidenceTypes: Object.freeze([...acceptedEvidenceTypes]),
    requiredSyntheticEvidence: Object.freeze([...requiredSyntheticEvidence]),
    requiredApprovedNonProductionEvidence: Object.freeze([
      ...requiredApprovedNonProductionEvidence,
    ]),
    maskingRequiredFor: Object.freeze([...maskingRequiredFor]),
    prohibitedPayloadKeys: Object.freeze([...prohibitedPayloadKeys]),
    prohibitedFixtureSeedTokens: Object.freeze([
      ...prohibitedFixtureSeedTokens,
    ]),
    prohibitedApiResponseFields: Object.freeze([
      ...prohibitedApiResponseFields,
    ]),
    remainingApprovalBlockers: Object.freeze([...remainingApprovalBlockers]),
    outOfScope: Object.freeze([...outOfScope]),
  });

export function assertMvpAOnboardingNonProductionDataGate(
  gate: MvpAOnboardingNonProductionDataGate,
): void {
  if (gate.gateId !== "mvp_a_onboarding_non_production_data_handling_v1") {
    throw new MvpAOnboardingNonProductionDataGateError(
      "MVP-A onboarding non-production data gate has an unsupported id",
    );
  }

  if (gate.sourceGate !== "mvp_a_onboarding_pii_export_closed_v1") {
    throw new MvpAOnboardingNonProductionDataGateError(
      "MVP-A onboarding non-production data gate must stay anchored to the P2A-02 closed raw/export gate",
    );
  }

  if (gate.readiness !== "bounded_non_production_practical_use_only") {
    throw new MvpAOnboardingNonProductionDataGateError(
      "MVP-A onboarding non-production data gate must remain bounded to non-production practical use",
    );
  }

  assertExactSet(
    "accepted evidence type",
    gate.acceptedEvidenceTypes,
    acceptedEvidenceTypes,
  );
  assertRequiredSet(
    "synthetic evidence field",
    gate.requiredSyntheticEvidence,
    requiredSyntheticEvidence,
  );
  assertRequiredSet(
    "approved non-production evidence field",
    gate.requiredApprovedNonProductionEvidence,
    requiredApprovedNonProductionEvidence,
  );
  assertRequiredSet("masking requirement", gate.maskingRequiredFor, [
    ...maskingRequiredFor,
  ]);
  assertRequiredSet("prohibited payload key", gate.prohibitedPayloadKeys, [
    ...prohibitedPayloadKeys,
  ]);
  assertRequiredSet(
    "prohibited fixture or seed token",
    gate.prohibitedFixtureSeedTokens,
    [...prohibitedFixtureSeedTokens],
  );
  assertRequiredSet(
    "prohibited API response field",
    gate.prohibitedApiResponseFields,
    [...prohibitedApiResponseFields],
  );
  assertRequiredSet(
    "remaining approval blocker",
    gate.remainingApprovalBlockers,
    [...remainingApprovalBlockers],
  );
  assertRequiredSet("out-of-scope boundary", gate.outOfScope, [...outOfScope]);
}

export function assertMvpAOnboardingPracticalUseDataEvidence(
  gate: MvpAOnboardingNonProductionDataGate,
  evidence: MvpAOnboardingPracticalUseDataEvidence,
): void {
  assertMvpAOnboardingNonProductionDataGate(gate);

  if (!isAcceptedEvidenceType(gate, evidence.evidenceType)) {
    throw new MvpAOnboardingNonProductionDataGateError(
      `MVP-A practical-use data evidence type ${evidence.evidenceType} is not accepted`,
    );
  }

  const requiredFields =
    evidence.evidenceType === "repo_owned_synthetic_fixture"
      ? gate.requiredSyntheticEvidence
      : gate.requiredApprovedNonProductionEvidence;
  const missingFields = requiredFields.filter(
    (field) => !hasRequiredEvidenceValue(evidence, field),
  );
  if (missingFields.length > 0) {
    throw new MvpAOnboardingNonProductionDataGateError(
      `MVP-A practical-use data evidence is missing required ${evidence.evidenceType} evidence: ${missingFields.join(
        ", ",
      )}`,
    );
  }

  if (
    evidence.evidenceType === "repo_owned_synthetic_fixture" &&
    evidence.tenantEnvironmentId !== "repo_owned_synthetic_mvp_a_onboarding"
  ) {
    throw new MvpAOnboardingNonProductionDataGateError(
      "MVP-A practical-use data evidence must bind to the repo-owned synthetic onboarding tenant/environment",
    );
  }

  if (evidence.evidenceType === "approved_non_production_dataset") {
    assertApprovedNonProductionEvidence(evidence);
  }

  if (
    evidence.containsRealPersonnelData === true ||
    evidence.productionLikeSource === true
  ) {
    throw new MvpAOnboardingNonProductionDataGateError(
      "MVP-A practical-use data evidence must not approve real personnel or production-like data",
    );
  }
}

export function assertMvpAOnboardingNonProductionPayloadKey(
  gate: MvpAOnboardingNonProductionDataGate,
  key: string,
): void {
  assertMvpAOnboardingNonProductionDataGate(gate);
  const normalizedKey = normalizeSurfaceName(key);
  for (const prohibitedKey of gate.prohibitedPayloadKeys) {
    if (normalizedKey.includes(normalizeSurfaceName(prohibitedKey))) {
      throw new MvpAOnboardingNonProductionDataGateError(
        `MVP-A onboarding payload key ${key} exposes prohibited non-production data surface ${prohibitedKey}`,
      );
    }
  }
}

export function assertMvpAOnboardingNonProductionApiResponseField(
  gate: MvpAOnboardingNonProductionDataGate,
  fieldName: string,
): void {
  assertMvpAOnboardingNonProductionDataGate(gate);
  const normalizedFieldName = normalizeSurfaceName(fieldName);
  for (const prohibitedField of gate.prohibitedApiResponseFields) {
    if (normalizedFieldName.includes(normalizeSurfaceName(prohibitedField))) {
      throw new MvpAOnboardingNonProductionDataGateError(
        `MVP-A onboarding API response field ${fieldName} exposes prohibited non-production data surface ${prohibitedField}`,
      );
    }
  }
}

export function assertMvpAOnboardingFixtureSeedText(
  gate: MvpAOnboardingNonProductionDataGate,
  path: string,
  text: string,
): void {
  assertMvpAOnboardingNonProductionDataGate(gate);
  const normalizedText = text.toLowerCase();
  for (const prohibitedToken of gate.prohibitedFixtureSeedTokens) {
    if (normalizedText.includes(prohibitedToken)) {
      throw new MvpAOnboardingNonProductionDataGateError(
        `MVP-A onboarding fixture or seed ${path} contains prohibited non-production data token ${prohibitedToken}`,
      );
    }
  }
}

function isAcceptedEvidenceType(
  gate: MvpAOnboardingNonProductionDataGate,
  evidenceType: string,
): evidenceType is MvpAOnboardingPracticalUseEvidenceType {
  return gate.acceptedEvidenceTypes.includes(
    evidenceType as MvpAOnboardingPracticalUseEvidenceType,
  );
}

function hasRequiredEvidenceValue(
  evidence: MvpAOnboardingPracticalUseDataEvidence,
  field: string,
): boolean {
  const value = evidence[field as keyof MvpAOnboardingPracticalUseDataEvidence];
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== undefined;
}

function assertApprovedNonProductionEvidence(
  evidence: MvpAOnboardingPracticalUseDataEvidence,
): void {
  for (const field of concreteEvidenceFields) {
    assertConcreteEvidenceReference(evidence, field);
  }

  const approvedAt = parseEvidenceInstant(evidence.approvedAt, "approvedAt");
  const expiresAt = parseEvidenceInstant(evidence.expiresAt, "expiresAt");
  if (approvedAt.getTime() > Date.now()) {
    throw new MvpAOnboardingNonProductionDataGateError(
      "MVP-A approved_non_production_dataset evidence approvedAt must not be in the future",
    );
  }

  if (expiresAt.getTime() <= approvedAt.getTime()) {
    throw new MvpAOnboardingNonProductionDataGateError(
      "MVP-A approved_non_production_dataset evidence expiresAt must be after approvedAt",
    );
  }

  if (expiresAt.getTime() <= Date.now()) {
    throw new MvpAOnboardingNonProductionDataGateError(
      "MVP-A approved_non_production_dataset evidence expiresAt must be in the future",
    );
  }
}

function assertConcreteEvidenceReference(
  evidence: MvpAOnboardingPracticalUseDataEvidence,
  field: (typeof concreteEvidenceFields)[number],
): void {
  const value = evidence[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MvpAOnboardingNonProductionDataGateError(
      `MVP-A approved_non_production_dataset evidence ${field} must be present`,
    );
  }

  const normalizedValue = normalizeSurfaceName(value);
  for (const placeholderToken of placeholderEvidenceTokens) {
    if (normalizedValue.includes(normalizeSurfaceName(placeholderToken))) {
      throw new MvpAOnboardingNonProductionDataGateError(
        `MVP-A approved_non_production_dataset evidence ${field} must not be placeholder-only approval evidence`,
      );
    }
  }
}

function parseEvidenceInstant(value: unknown, field: string): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
  ) {
    throw new MvpAOnboardingNonProductionDataGateError(
      `MVP-A approved_non_production_dataset evidence ${field} must be a valid ISO-8601 UTC instant`,
    );
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new MvpAOnboardingNonProductionDataGateError(
      `MVP-A approved_non_production_dataset evidence ${field} must be a valid ISO-8601 UTC instant`,
    );
  }

  return parsed;
}

function assertExactSet(
  label: string,
  actualValues: readonly string[],
  expectedValues: readonly string[],
): void {
  if (actualValues.length !== expectedValues.length) {
    throw new MvpAOnboardingNonProductionDataGateError(
      `MVP-A onboarding non-production data gate has wrong ${label} set`,
    );
  }

  assertRequiredSet(label, actualValues, expectedValues);
}

function assertRequiredSet(
  label: string,
  actualValues: readonly string[],
  requiredValues: readonly string[],
): void {
  const actualSet = new Set(actualValues);
  if (actualSet.size !== actualValues.length) {
    throw new MvpAOnboardingNonProductionDataGateError(
      `MVP-A onboarding non-production data gate duplicates a ${label}`,
    );
  }

  for (const requiredValue of requiredValues) {
    if (!actualSet.has(requiredValue)) {
      throw new MvpAOnboardingNonProductionDataGateError(
        `MVP-A onboarding non-production data gate is missing ${requiredValue} ${label}`,
      );
    }
  }
}

function normalizeSurfaceName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gu, "");
}
