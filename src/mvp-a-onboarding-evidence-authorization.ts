export type MvpAOnboardingEvidenceSurface =
  | "transaction_request"
  | "person"
  | "employment"
  | "assignment"
  | "lifecycle_event"
  | "audit_event"
  | "okta_projection"
  | "work_email_evidence";

export type MvpAOnboardingFieldScope =
  | "request_metadata"
  | "person_identity"
  | "employment_status"
  | "assignment_reference"
  | "lifecycle_evidence"
  | "audit_evidence"
  | "provider_projection"
  | "work_email_contact";

export type MvpAOnboardingDataScope =
  | "same_onboarding_request"
  | "same_person"
  | "same_employment"
  | "same_assignment"
  | "same_lifecycle_event"
  | "same_correlation_id"
  | "same_mock_okta_projection"
  | "same_work_email_evidence_chain";

export interface MvpAOnboardingEvidenceAuthorizationClassification {
  evidenceSurface: MvpAOnboardingEvidenceSurface;
  fieldScopes: readonly MvpAOnboardingFieldScope[];
  dataScopes: readonly MvpAOnboardingDataScope[];
  readiness: "mvp_a_poc_only";
  authorizationBoundary: "classified_evidence_only";
}

export interface MvpAOnboardingEvidenceAuthorizationGate {
  gateId: "mvp_a_onboarding_evidence_authorization_v1";
  sourceAdr: "ADR 0011";
  classifications: readonly MvpAOnboardingEvidenceAuthorizationClassification[];
  outOfScope: readonly string[];
}

const requiredEvidenceSurfaces: readonly MvpAOnboardingEvidenceSurface[] = [
  "transaction_request",
  "person",
  "employment",
  "assignment",
  "lifecycle_event",
  "audit_event",
  "okta_projection",
  "work_email_evidence",
];

const allowedFieldScopes: readonly MvpAOnboardingFieldScope[] = [
  "request_metadata",
  "person_identity",
  "employment_status",
  "assignment_reference",
  "lifecycle_evidence",
  "audit_evidence",
  "provider_projection",
  "work_email_contact",
];

const allowedDataScopes: readonly MvpAOnboardingDataScope[] = [
  "same_onboarding_request",
  "same_person",
  "same_employment",
  "same_assignment",
  "same_lifecycle_event",
  "same_correlation_id",
  "same_mock_okta_projection",
  "same_work_email_evidence_chain",
];

const requiredOutOfScopeBoundaries: readonly string[] = [
  "broad enterprise RBAC",
  "PostgreSQL RLS as source of truth",
  "production tenant roles",
  "real HR user provisioning",
  "legal acceptance",
  "live personal-data access paths",
  "production authorization policy engines",
];

export const mvpAOnboardingEvidenceAuthorizationGate: MvpAOnboardingEvidenceAuthorizationGate =
  {
    gateId: "mvp_a_onboarding_evidence_authorization_v1",
    sourceAdr: "ADR 0011",
    classifications: [
      {
        evidenceSurface: "transaction_request",
        fieldScopes: ["request_metadata"],
        dataScopes: ["same_onboarding_request", "same_correlation_id"],
        readiness: "mvp_a_poc_only",
        authorizationBoundary: "classified_evidence_only",
      },
      {
        evidenceSurface: "person",
        fieldScopes: ["person_identity"],
        dataScopes: ["same_person", "same_onboarding_request"],
        readiness: "mvp_a_poc_only",
        authorizationBoundary: "classified_evidence_only",
      },
      {
        evidenceSurface: "employment",
        fieldScopes: ["employment_status"],
        dataScopes: ["same_employment", "same_person"],
        readiness: "mvp_a_poc_only",
        authorizationBoundary: "classified_evidence_only",
      },
      {
        evidenceSurface: "assignment",
        fieldScopes: ["assignment_reference"],
        dataScopes: ["same_assignment", "same_employment", "same_person"],
        readiness: "mvp_a_poc_only",
        authorizationBoundary: "classified_evidence_only",
      },
      {
        evidenceSurface: "lifecycle_event",
        fieldScopes: ["lifecycle_evidence"],
        dataScopes: [
          "same_lifecycle_event",
          "same_onboarding_request",
          "same_person",
        ],
        readiness: "mvp_a_poc_only",
        authorizationBoundary: "classified_evidence_only",
      },
      {
        evidenceSurface: "audit_event",
        fieldScopes: ["audit_evidence"],
        dataScopes: ["same_correlation_id", "same_onboarding_request"],
        readiness: "mvp_a_poc_only",
        authorizationBoundary: "classified_evidence_only",
      },
      {
        evidenceSurface: "okta_projection",
        fieldScopes: ["provider_projection"],
        dataScopes: [
          "same_mock_okta_projection",
          "same_onboarding_request",
          "same_person",
        ],
        readiness: "mvp_a_poc_only",
        authorizationBoundary: "classified_evidence_only",
      },
      {
        evidenceSurface: "work_email_evidence",
        fieldScopes: ["work_email_contact"],
        dataScopes: [
          "same_work_email_evidence_chain",
          "same_mock_okta_projection",
          "same_person",
        ],
        readiness: "mvp_a_poc_only",
        authorizationBoundary: "classified_evidence_only",
      },
    ],
    outOfScope: requiredOutOfScopeBoundaries,
  };

export function assertMvpAOnboardingEvidenceAuthorizationGate(
  gate: MvpAOnboardingEvidenceAuthorizationGate,
): void {
  const requiredEvidenceSurfaceSet = new Set<string>(requiredEvidenceSurfaces);
  const allowedFieldScopeSet = new Set<string>(allowedFieldScopes);
  const allowedDataScopeSet = new Set<string>(allowedDataScopes);
  const requiredOutOfScopeBoundarySet = new Set<string>(
    requiredOutOfScopeBoundaries,
  );

  if (gate.gateId !== "mvp_a_onboarding_evidence_authorization_v1") {
    throw new Error(
      "MVP-A onboarding evidence authorization gate has an unsupported gate id",
    );
  }

  if (gate.sourceAdr !== "ADR 0011") {
    throw new Error(
      "MVP-A onboarding evidence authorization gate must stay anchored to ADR 0011",
    );
  }

  const outOfScopeBoundaries = new Set<string>();
  for (const boundary of gate.outOfScope) {
    if (!requiredOutOfScopeBoundarySet.has(boundary)) {
      throw new Error(
        `MVP-A onboarding evidence authorization gate contains unsupported ${boundary} out-of-scope boundary`,
      );
    }
    if (outOfScopeBoundaries.has(boundary)) {
      throw new Error(
        `MVP-A onboarding evidence authorization gate duplicates ${boundary} out-of-scope boundary`,
      );
    }
    outOfScopeBoundaries.add(boundary);
  }
  for (const requiredBoundary of requiredOutOfScopeBoundaries) {
    if (!outOfScopeBoundaries.has(requiredBoundary)) {
      throw new Error(
        `MVP-A onboarding evidence authorization gate is missing ${requiredBoundary} out-of-scope boundary`,
      );
    }
  }

  const classificationsBySurface = new Map<
    MvpAOnboardingEvidenceSurface,
    MvpAOnboardingEvidenceAuthorizationClassification
  >();
  for (const classification of gate.classifications) {
    if (!requiredEvidenceSurfaceSet.has(classification.evidenceSurface)) {
      throw new Error(
        `MVP-A onboarding evidence authorization gate contains unsupported ${classification.evidenceSurface} classification`,
      );
    }
    if (classificationsBySurface.has(classification.evidenceSurface)) {
      throw new Error(
        `MVP-A onboarding evidence authorization gate duplicates ${classification.evidenceSurface} classification`,
      );
    }
    if (classification.fieldScopes.length === 0) {
      throw new Error(
        `MVP-A onboarding evidence authorization gate ${classification.evidenceSurface} classification has no field scope`,
      );
    }
    if (classification.dataScopes.length === 0) {
      throw new Error(
        `MVP-A onboarding evidence authorization gate ${classification.evidenceSurface} classification has no data scope`,
      );
    }
    for (const fieldScope of classification.fieldScopes) {
      if (!allowedFieldScopeSet.has(fieldScope)) {
        throw new Error(
          `MVP-A onboarding evidence authorization gate ${classification.evidenceSurface} classification has unsupported ${fieldScope} field scope`,
        );
      }
    }
    for (const dataScope of classification.dataScopes) {
      if (!allowedDataScopeSet.has(dataScope)) {
        throw new Error(
          `MVP-A onboarding evidence authorization gate ${classification.evidenceSurface} classification has unsupported ${dataScope} data scope`,
        );
      }
    }
    if (classification.readiness !== "mvp_a_poc_only") {
      throw new Error(
        `MVP-A onboarding evidence authorization gate ${classification.evidenceSurface} classification must stay MVP-A PoC only`,
      );
    }
    if (classification.authorizationBoundary !== "classified_evidence_only") {
      throw new Error(
        `MVP-A onboarding evidence authorization gate ${classification.evidenceSurface} classification must not claim runtime policy enforcement`,
      );
    }
    classificationsBySurface.set(
      classification.evidenceSurface,
      classification,
    );
  }

  for (const requiredEvidenceSurface of requiredEvidenceSurfaces) {
    if (!classificationsBySurface.has(requiredEvidenceSurface)) {
      throw new Error(
        `MVP-A onboarding evidence authorization gate is missing ${requiredEvidenceSurface} classification`,
      );
    }
  }
}
