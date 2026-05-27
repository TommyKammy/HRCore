export interface MvpAOnboardingPiiExportGate {
  gateId: "mvp_a_onboarding_pii_export_closed_v1";
  sourceAdrs: readonly [
    "ADR 0005",
    "ADR 0007",
    "ADR 0014",
    "ADR 0015",
    "ADR 0016",
    "ADR 0020",
  ];
  readiness: "closed_until_later_two_key_acceptance";
  prohibitedPayloadKeys: readonly string[];
  prohibitedRouteTokens: readonly string[];
  prohibitedFieldNames: readonly string[];
  remainingDependencies: readonly string[];
  outOfScope: readonly string[];
}

export interface MvpAOnboardingPiiExportGateCheckInput {
  route?: string;
  fieldName?: string;
}

const prohibitedPayloadKeys = [
  "rawPayload",
  "raw_payload",
  "providerPayload",
  "provider_payload",
  "importPayload",
  "import_payload",
  "exportPayload",
  "export_payload",
  "csvExport",
  "csv_export",
  "exportTemplate",
  "export_template",
  "exportPermission",
  "export_permission",
  "metadata",
  "note",
  "memo",
  "jsonb",
  "attachment",
  "rawPayloadViewPermission",
  "raw_payload_view_permission",
  "downloadLog",
  "download_log",
  "exportDownloadLog",
  "export_download_log",
  "exportJob",
  "export_job",
  "exportFileManifest",
  "export_file_manifest",
  "watermarkToken",
  "watermark_token",
  "rawPayloadAccessLog",
  "raw_payload_access_log",
  "maskingProfile",
  "masking_profile",
  "redactionProfile",
  "redaction_profile",
  "fieldClassification",
  "field_classification",
  "privacyClassification",
  "privacy_classification",
  "processingPurpose",
  "processing_purpose",
  "consentBasis",
  "consent_basis",
  "lawfulBasis",
  "lawful_basis",
  "dsarHandling",
  "dsar_handling",
  "privacyEvidence",
  "privacy_evidence",
  "dataScopePolicy",
  "data_scope_policy",
  "myNumber",
  "my_number",
  "specificPersonalInformation",
  "specific_personal_information",
  "sensitivePersonalInformation",
  "sensitive_personal_information",
] as const;

const sourceAdrs = [
  "ADR 0005",
  "ADR 0007",
  "ADR 0014",
  "ADR 0015",
  "ADR 0016",
  "ADR 0020",
] as const;

const prohibitedRouteTokens = [
  "raw",
  "raw-payload",
  "raw/payload",
  "raw_payload",
  "raw-view",
  "raw/view",
  "raw_view",
  "csv",
  "csv/export",
  "export",
  "download",
] as const;

const prohibitedFieldNames = [
  ...prohibitedPayloadKeys,
  "csv",
  "export",
  "download",
  "nationalId",
  "national_id",
  "individualNumber",
  "individual_number",
  "medicalHistory",
  "medical_history",
  "disability",
  "biometric",
  "religion",
  "criminalRecord",
  "criminal_record",
  "laborUnionMembership",
  "labor_union_membership",
  "unionMembership",
  "union_membership",
  "harassmentInvestigation",
  "harassment_investigation",
  "disciplinaryInvestigation",
  "disciplinary_investigation",
  "familyOrigin",
  "family_origin",
  "permanentDomicile",
  "permanent_domicile",
] as const;

const remainingDependencies = [
  "Accepted two-key legal/privacy ADR for raw-payload viewing exceptions",
  "Accepted two-key legal/privacy ADR for CSV export and download behavior",
  "field classification, redaction, and masking profile design",
  "separate export permission and raw-view permission model",
  "watermark or manifest traceability design",
  "download-log and raw-payload access audit evidence design",
  "production real-data processing acceptance",
] as const;

const outOfScope = [
  "raw payload viewers",
  "CSV export runtime behavior",
  "download endpoints",
  "watermark generation",
  "production masking engine",
  "legal acceptance",
  "real-data processing",
] as const;

export const mvpAOnboardingPiiExportGate: MvpAOnboardingPiiExportGate =
  Object.freeze({
    gateId: "mvp_a_onboarding_pii_export_closed_v1",
    sourceAdrs,
    readiness: "closed_until_later_two_key_acceptance",
    prohibitedPayloadKeys: Object.freeze([...prohibitedPayloadKeys]),
    prohibitedRouteTokens: Object.freeze([...prohibitedRouteTokens]),
    prohibitedFieldNames: Object.freeze([...prohibitedFieldNames]),
    remainingDependencies: Object.freeze([...remainingDependencies]),
    outOfScope: Object.freeze([...outOfScope]),
  });

export function assertMvpAOnboardingPiiExportGate(
  gate: MvpAOnboardingPiiExportGate,
  input: MvpAOnboardingPiiExportGateCheckInput = {},
): void {
  assertClosedGateShape(gate);

  if (input.route !== undefined) {
    assertRouteHasNoProhibitedSurface(gate, input.route);
  }

  if (input.fieldName !== undefined) {
    assertFieldHasNoProhibitedSurface(gate, input.fieldName);
  }
}

function assertClosedGateShape(gate: MvpAOnboardingPiiExportGate): void {
  if (gate.gateId !== "mvp_a_onboarding_pii_export_closed_v1") {
    throw new Error("MVP-A onboarding PII/export gate has an unsupported id");
  }

  if (gate.readiness !== "closed_until_later_two_key_acceptance") {
    throw new Error(
      "MVP-A onboarding PII/export gate must stay closed until later two-key acceptance",
    );
  }

  assertExactSet("source ADR", gate.sourceAdrs, [
    "ADR 0005",
    "ADR 0007",
    "ADR 0014",
    "ADR 0015",
    "ADR 0016",
    "ADR 0020",
  ]);
  assertRequiredSet(
    "prohibited payload key",
    gate.prohibitedPayloadKeys,
    prohibitedPayloadKeys,
  );
  assertRequiredSet(
    "prohibited route token",
    gate.prohibitedRouteTokens,
    prohibitedRouteTokens,
  );
  assertRequiredSet(
    "prohibited field name",
    gate.prohibitedFieldNames,
    prohibitedFieldNames,
  );
  assertRequiredSet(
    "remaining dependency",
    gate.remainingDependencies,
    remainingDependencies,
  );
  assertRequiredSet("out-of-scope boundary", gate.outOfScope, outOfScope);
}

function assertRouteHasNoProhibitedSurface(
  gate: MvpAOnboardingPiiExportGate,
  route: string,
): void {
  const normalizedRouteSegments = route
    .split("/")
    .map((segment) => normalizeSurfaceName(segment))
    .filter((segment) => segment.length > 0);
  const normalizedRoute = normalizedRouteSegments.join("");
  for (const prohibitedToken of gate.prohibitedRouteTokens) {
    if (
      routeHasProhibitedToken(
        normalizedRoute,
        normalizedRouteSegments,
        prohibitedToken,
      )
    ) {
      throw new Error(
        `MVP-A onboarding route ${route} exposes prohibited ${prohibitedToken} surface`,
      );
    }
  }
}

function routeHasProhibitedToken(
  normalizedRoute: string,
  normalizedRouteSegments: readonly string[],
  prohibitedToken: string,
): boolean {
  const normalizedToken = normalizeSurfaceName(prohibitedToken);
  if (prohibitedToken === "raw") {
    return normalizedRouteSegments.includes(normalizedToken);
  }

  return normalizedRoute.includes(normalizedToken);
}

function assertFieldHasNoProhibitedSurface(
  gate: MvpAOnboardingPiiExportGate,
  fieldName: string,
): void {
  const normalizedFieldName = normalizeSurfaceName(fieldName);
  for (const prohibitedFieldName of gate.prohibitedFieldNames) {
    if (
      normalizedFieldName.includes(normalizeSurfaceName(prohibitedFieldName))
    ) {
      throw new Error(
        `MVP-A onboarding field ${fieldName} exposes prohibited ${prohibitedFieldName} surface`,
      );
    }
  }
}

function assertExactSet(
  label: string,
  actualValues: readonly string[],
  expectedValues: readonly string[],
): void {
  if (actualValues.length !== expectedValues.length) {
    throw new Error(`MVP-A onboarding PII/export gate has wrong ${label} set`);
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
    throw new Error(`MVP-A onboarding PII/export gate duplicates a ${label}`);
  }

  for (const requiredValue of requiredValues) {
    if (!actualSet.has(requiredValue)) {
      throw new Error(
        `MVP-A onboarding PII/export gate is missing ${requiredValue} ${label}`,
      );
    }
  }
}

function normalizeSurfaceName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gu, "");
}
