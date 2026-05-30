import {
  type MvpAOnboardingEvidenceRuntimeAccessDecision,
  type MvpAOnboardingEvidenceSurface,
  type MvpAOnboardingFieldScope,
} from "../mvp-a-onboarding-evidence-authorization.js";
import { type MvpAOnboardingCorrelationTrace } from "../mvp-a-onboarding-traceability.js";

type MvpAOnboardingTraceEvidenceAuthorization = Pick<
  MvpAOnboardingEvidenceRuntimeAccessDecision,
  "evidenceSurfaces" | "fieldScopes"
>;

export function buildMvpAOnboardingCorrelationTraceResponse(
  correlationId: string,
  trace: MvpAOnboardingCorrelationTrace,
  accessDecision: MvpAOnboardingEvidenceRuntimeAccessDecision,
) {
  return {
    correlationId,
    evidenceType: "mvp_a_onboarding_correlation_trace" as const,
    authorization: {
      decision: accessDecision.decision,
      gateId: accessDecision.gateId,
      actorId: accessDecision.actorId,
      tenantEnvironmentId: accessDecision.tenantEnvironmentId,
      evidenceSurfaces: accessDecision.evidenceSurfaces,
      fieldScopes: accessDecision.fieldScopes,
      dataScopes: accessDecision.dataScopes,
      auditCorrelation: accessDecision.auditCorrelation,
    },
    trace: buildAuthorizedMvpAOnboardingCorrelationTraceSummary(
      trace,
      accessDecision,
    ),
    deferredProductionGates: trace.remainingP2A02Gates,
  };
}

export function buildAuthorizedMvpAOnboardingCorrelationTraceSummary(
  trace: MvpAOnboardingCorrelationTrace,
  accessDecision: MvpAOnboardingTraceEvidenceAuthorization,
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "transaction_request",
      "request_metadata",
    )
  ) {
    summary.transactionRequest =
      buildAuthorizedMvpAOnboardingTransactionRequestTrace(trace);
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "person",
      "person_identity",
    )
  ) {
    summary.person = buildAuthorizedMvpAOnboardingPersonTrace(trace);
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "employment",
      "employment_status",
    )
  ) {
    summary.employment = buildAuthorizedMvpAOnboardingEmploymentTrace(trace);
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "assignment",
      "assignment_reference",
    )
  ) {
    summary.assignment = buildAuthorizedMvpAOnboardingAssignmentTrace(trace);
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "audit_event",
      "audit_evidence",
    )
  ) {
    summary.approvalAuditEvent = trace.approvalAuditEvent;
    summary.applyAuditEvent = trace.applyAuditEvent;
    summary.auditEventCount = trace.auditEvents.length;
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "lifecycle_event",
      "lifecycle_evidence",
    )
  ) {
    summary.lifecycleEventId = trace.lifecycleEvent?.id ?? null;
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "apply_job_attempt",
      "apply_job_attempt_evidence",
    )
  ) {
    summary.applyJobAttemptCount = trace.applyJobAttempts.length;
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "work_email_evidence",
      "work_email_contact",
    )
  ) {
    summary.workEmailWritebackEventId =
      trace.workEmailWriteback?.eventId ?? null;
    summary.workEmailConflictId = trace.inboundWorkEmailConflict?.id ?? null;
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "okta_projection",
      "provider_projection",
    )
  ) {
    summary.providerRefreshId = trace.providerRefresh?.id ?? null;
    if (
      trace.providerRefresh === undefined &&
      trace.providerRefreshConflict !== undefined
    ) {
      summary.providerRefreshConflictId = trace.providerRefreshConflict.id;
    }
  }

  return summary;
}

export function buildMvpAOnboardingTraceVerificationRequirements(
  accessDecision: MvpAOnboardingTraceEvidenceAuthorization,
) {
  const requiresApplyEvidence =
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "audit_event",
      "audit_evidence",
    ) ||
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "lifecycle_event",
      "lifecycle_evidence",
    ) ||
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "apply_job_attempt",
      "apply_job_attempt_evidence",
    ) ||
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "employment",
      "employment_status",
    ) ||
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "assignment",
      "assignment_reference",
    );
  const requiresApplyJobAttemptEvidence =
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "apply_job_attempt",
      "apply_job_attempt_evidence",
    );
  const requiresWorkEmailEvidence = hasAuthorizedMvpAOnboardingTraceEvidence(
    accessDecision,
    "work_email_evidence",
    "work_email_contact",
  );
  const requiresProviderProjection = hasAuthorizedMvpAOnboardingTraceEvidence(
    accessDecision,
    "okta_projection",
    "provider_projection",
  );

  return {
    requireApproval: true,
    requireApply:
      requiresApplyEvidence ||
      requiresWorkEmailEvidence ||
      requiresProviderProjection,
    requireApplyJobAttempt: requiresApplyJobAttemptEvidence,
    requireWriteback: requiresWorkEmailEvidence || requiresProviderProjection,
    requireProviderRefresh: requiresProviderProjection,
  };
}

function buildAuthorizedMvpAOnboardingTransactionRequestTrace(
  trace: MvpAOnboardingCorrelationTrace,
): Record<string, string> {
  return {
    id: trace.transactionRequest.id,
    requestType: trace.transactionRequest.requestType,
    statusCode: trace.transactionRequest.statusCode,
    correlationId: trace.transactionRequest.correlationId,
  };
}

function buildAuthorizedMvpAOnboardingPersonTrace(
  trace: MvpAOnboardingCorrelationTrace,
): Record<string, string> {
  return {
    id: trace.transactionRequest.personId,
  };
}

function buildAuthorizedMvpAOnboardingEmploymentTrace(
  trace: MvpAOnboardingCorrelationTrace,
): Record<string, string | null> {
  const employment = trace.employment;
  if (employment === undefined) return {};

  return {
    id: employment.id,
    employmentCode: employment.employmentCode,
    statusCode: employment.statusCode,
    startDate: employment.startDate,
    endDate: employment.endDate,
  };
}

function buildAuthorizedMvpAOnboardingAssignmentTrace(
  trace: MvpAOnboardingCorrelationTrace,
): Record<string, string | null> {
  const assignment = trace.assignment;
  if (assignment === undefined) return {};

  return {
    id: assignment.id,
    employmentId: assignment.employmentId,
    assignmentCode: assignment.assignmentCode,
    organizationCode: assignment.organizationCode,
    positionCode: assignment.positionCode,
    startDate: assignment.startDate,
    endDate: assignment.endDate,
  };
}

function hasAuthorizedMvpAOnboardingTraceEvidence(
  accessDecision: MvpAOnboardingTraceEvidenceAuthorization,
  evidenceSurface: MvpAOnboardingEvidenceSurface,
  fieldScope: MvpAOnboardingFieldScope,
): boolean {
  return (
    accessDecision.evidenceSurfaces.includes(evidenceSurface) &&
    accessDecision.fieldScopes.includes(fieldScope)
  );
}
