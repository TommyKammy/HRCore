import {
  assertMvpAOnboardingTenantEnvironmentBinding,
  assertMvpAOnboardingTrustedActorBinding,
  mvpAOnboardingBindingGate,
} from "./mvp-a-onboarding-binding-gate.js";

export type MvpAOnboardingEvidenceSurface =
  | "transaction_request"
  | "person"
  | "employment"
  | "assignment"
  | "lifecycle_event"
  | "apply_job_attempt"
  | "audit_event"
  | "okta_projection"
  | "work_email_evidence";

export type MvpAOnboardingFieldScope =
  | "request_metadata"
  | "person_identity"
  | "employment_status"
  | "assignment_reference"
  | "lifecycle_evidence"
  | "apply_job_attempt_evidence"
  | "audit_evidence"
  | "provider_projection"
  | "work_email_contact";

export type MvpAOnboardingDataScope =
  | "same_onboarding_request"
  | "same_person"
  | "same_employment"
  | "same_assignment"
  | "same_lifecycle_event"
  | "same_apply_job_attempt"
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

export interface MvpAOnboardingEvidenceRuntimeAccessInput {
  actorId: string | undefined;
  tenantEnvironmentId: string | undefined;
  requestOwnerActorId: string | undefined;
  requestedEvidenceSurfaces: readonly MvpAOnboardingEvidenceSurface[];
  requestedFieldScopes?: readonly MvpAOnboardingFieldScope[];
}

export interface MvpAOnboardingEvidenceRuntimeAccessContext {
  actorId: string;
  tenantEnvironmentId: string;
}

export interface MvpAOnboardingEvidenceRuntimeAccessDecision {
  decision: "allow";
  gateId: MvpAOnboardingEvidenceAuthorizationGate["gateId"];
  actorId: string;
  tenantEnvironmentId: string;
  evidenceSurfaces: readonly MvpAOnboardingEvidenceSurface[];
  fieldScopes: readonly MvpAOnboardingFieldScope[];
  dataScopes: readonly MvpAOnboardingDataScope[];
  auditCorrelation: "same_onboarding_request_or_linked_operation";
}

export class MvpAOnboardingEvidenceAccessError extends Error {
  override name = "MvpAOnboardingEvidenceAccessError";
}

const allowedFieldScopes: readonly MvpAOnboardingFieldScope[] = [
  "request_metadata",
  "person_identity",
  "employment_status",
  "assignment_reference",
  "lifecycle_evidence",
  "apply_job_attempt_evidence",
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
  "same_apply_job_attempt",
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

const expectedClassifications: readonly MvpAOnboardingEvidenceAuthorizationClassification[] =
  [
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
      evidenceSurface: "apply_job_attempt",
      fieldScopes: ["apply_job_attempt_evidence"],
      dataScopes: [
        "same_apply_job_attempt",
        "same_onboarding_request",
        "same_person",
        "same_correlation_id",
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
  ];

const requiredEvidenceSurfaces = expectedClassifications.map(
  (classification) => classification.evidenceSurface,
);

const expectedClassificationsBySurface = new Map(
  expectedClassifications.map((classification) => [
    classification.evidenceSurface,
    classification,
  ]),
);

const freezeClassification = (
  classification: MvpAOnboardingEvidenceAuthorizationClassification,
): MvpAOnboardingEvidenceAuthorizationClassification =>
  Object.freeze({
    ...classification,
    fieldScopes: Object.freeze([...classification.fieldScopes]),
    dataScopes: Object.freeze([...classification.dataScopes]),
  });

const freezeGate = (
  gate: MvpAOnboardingEvidenceAuthorizationGate,
): MvpAOnboardingEvidenceAuthorizationGate =>
  Object.freeze({
    ...gate,
    classifications: Object.freeze(
      gate.classifications.map((classification) =>
        freezeClassification(classification),
      ),
    ),
    outOfScope: Object.freeze([...gate.outOfScope]),
  });

export const mvpAOnboardingEvidenceAuthorizationGate: MvpAOnboardingEvidenceAuthorizationGate =
  freezeGate({
    gateId: "mvp_a_onboarding_evidence_authorization_v1",
    sourceAdr: "ADR 0011",
    classifications: expectedClassifications,
    outOfScope: requiredOutOfScopeBoundaries,
  });

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
    const expectedClassification = expectedClassificationsBySurface.get(
      classification.evidenceSurface,
    );
    if (
      expectedClassification === undefined ||
      !hasSameScopeSet(
        classification.fieldScopes,
        expectedClassification.fieldScopes,
      )
    ) {
      throw new Error(
        `MVP-A onboarding evidence authorization gate ${classification.evidenceSurface} classification must use field scopes ${expectedClassification?.fieldScopes.join(", ")}`,
      );
    }
    if (
      expectedClassification === undefined ||
      !hasSameScopeSet(
        classification.dataScopes,
        expectedClassification.dataScopes,
      )
    ) {
      throw new Error(
        `MVP-A onboarding evidence authorization gate ${classification.evidenceSurface} classification must use data scopes ${expectedClassification?.dataScopes.join(", ")}`,
      );
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

export function validateMvpAOnboardingEvidenceRuntimeAccessContext(input: {
  actorId: string | undefined;
  tenantEnvironmentId: string | undefined;
}): MvpAOnboardingEvidenceRuntimeAccessContext {
  try {
    return Object.freeze({
      actorId: assertMvpAOnboardingTrustedActorBinding(
        mvpAOnboardingBindingGate,
        input.actorId,
      ),
      tenantEnvironmentId: assertMvpAOnboardingTenantEnvironmentBinding(
        mvpAOnboardingBindingGate,
        input.tenantEnvironmentId,
      ),
    });
  } catch (error) {
    throw new MvpAOnboardingEvidenceAccessError(
      normalizeMvpAOnboardingEvidenceAccessError(error),
    );
  }
}

export function authorizeMvpAOnboardingEvidenceRuntimeAccess(
  gate: MvpAOnboardingEvidenceAuthorizationGate,
  input: MvpAOnboardingEvidenceRuntimeAccessInput,
): MvpAOnboardingEvidenceRuntimeAccessDecision {
  try {
    assertMvpAOnboardingEvidenceAuthorizationGate(gate);

    const { actorId, tenantEnvironmentId } =
      validateMvpAOnboardingEvidenceRuntimeAccessContext(input);
    const requestOwnerActorId = assertMvpAOnboardingTrustedActorBinding(
      mvpAOnboardingBindingGate,
      input.requestOwnerActorId,
    );
    if (actorId !== requestOwnerActorId) {
      throw new Error(
        "MVP-A onboarding evidence access requires actor to match the trusted request owner",
      );
    }

    if (input.requestedEvidenceSurfaces.length === 0) {
      throw new Error(
        "MVP-A onboarding evidence access requires at least one evidence surface",
      );
    }

    const classificationsBySurface = new Map(
      gate.classifications.map((classification) => [
        classification.evidenceSurface,
        classification,
      ]),
    );
    const requestedSurfaceSet = new Set<MvpAOnboardingEvidenceSurface>();
    const allowedFieldScopes = new Set<MvpAOnboardingFieldScope>();
    const allowedDataScopes = new Set<MvpAOnboardingDataScope>();
    for (const evidenceSurface of input.requestedEvidenceSurfaces) {
      if (requestedSurfaceSet.has(evidenceSurface)) {
        throw new Error(
          `MVP-A onboarding evidence access duplicates ${evidenceSurface} evidence surface`,
        );
      }
      requestedSurfaceSet.add(evidenceSurface);

      const classification = classificationsBySurface.get(evidenceSurface);
      if (classification === undefined) {
        throw new Error(
          `MVP-A onboarding evidence access rejects unclassified ${evidenceSurface} evidence surface`,
        );
      }
      for (const fieldScope of classification.fieldScopes) {
        allowedFieldScopes.add(fieldScope);
      }
      for (const dataScope of classification.dataScopes) {
        allowedDataScopes.add(dataScope);
      }
    }

    const requestedFieldScopes = input.requestedFieldScopes ?? [
      ...allowedFieldScopes,
    ];
    if (requestedFieldScopes.length === 0) {
      throw new Error(
        "MVP-A onboarding evidence access requires at least one field scope",
      );
    }

    const authorizedFieldScopes = new Set<MvpAOnboardingFieldScope>();
    for (const fieldScope of requestedFieldScopes) {
      if (!allowedFieldScopes.has(fieldScope)) {
        throw new Error(
          `MVP-A onboarding evidence access rejects forbidden ${fieldScope} field scope`,
        );
      }
      authorizedFieldScopes.add(fieldScope);
    }

    return Object.freeze({
      decision: "allow" as const,
      gateId: gate.gateId,
      actorId,
      tenantEnvironmentId,
      evidenceSurfaces: Object.freeze([...requestedSurfaceSet]),
      fieldScopes: Object.freeze([...authorizedFieldScopes]),
      dataScopes: Object.freeze([...allowedDataScopes]),
      auditCorrelation: "same_onboarding_request_or_linked_operation" as const,
    });
  } catch (error) {
    throw new MvpAOnboardingEvidenceAccessError(
      normalizeMvpAOnboardingEvidenceAccessError(error),
    );
  }
}

function hasSameScopeSet(
  actualScopes: readonly string[],
  expectedScopes: readonly string[],
): boolean {
  if (actualScopes.length !== expectedScopes.length) return false;

  const expectedScopeSet = new Set(expectedScopes);
  const actualScopeSet = new Set(actualScopes);
  if (actualScopeSet.size !== actualScopes.length) return false;

  return actualScopes.every((scope) => expectedScopeSet.has(scope));
}

function normalizeMvpAOnboardingEvidenceAccessError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message ===
    "MVP-A onboarding binding gate requires explicit trusted actor evidence"
  ) {
    return "MVP-A onboarding evidence access requires actor context";
  }
  if (
    message ===
    "MVP-A onboarding binding gate requires explicit tenant environment evidence"
  ) {
    return "MVP-A onboarding evidence access requires tenant environment context";
  }

  return message;
}
