import {
  assertMvpAOnboardingBindingGateEvidence,
  mvpAOnboardingBindingGate,
} from "./mvp-a-onboarding-binding-gate.js";
import {
  getErrorMessage,
  requireString,
  throwTraceError,
} from "./mvp-a-onboarding-traceability-row-guards.js";
import {
  type MvpAOnboardingApplyJobAttemptTrace,
  type MvpAOnboardingAuditTrace,
  type MvpAOnboardingPayload,
  type MvpAOnboardingTransactionRequestRow,
} from "./mvp-a-onboarding-traceability-types.js";

export function assertTraceBindingEvidence(input: {
  requestedCorrelationId: string;
  request: MvpAOnboardingTransactionRequestRow;
  payload: MvpAOnboardingPayload;
  approvalAuditEvent: MvpAOnboardingAuditTrace | undefined;
  auditEvents: readonly MvpAOnboardingAuditTrace[];
  applyJobAttempts: readonly MvpAOnboardingApplyJobAttemptTrace[];
}): void {
  try {
    assertMvpAOnboardingBindingGateEvidence(mvpAOnboardingBindingGate, {
      trustedActorId: input.approvalAuditEvent?.actorId,
      effectiveActorIds: [
        ...input.auditEvents.map((event) => event.actorId),
        ...input.applyJobAttempts.map((attempt) => attempt.workerId),
      ],
      subjectEmployeeId: input.request.person_id,
      tenantEnvironmentId: input.payload.tenantEnvironmentId,
      requestOwnerId: input.approvalAuditEvent?.actorId,
      requestedCorrelationId: input.requestedCorrelationId,
      rootCorrelationId: requireString(input.request.correlation_id),
      linkedCorrelationIds: [
        ...input.auditEvents.map((event) => event.correlationId),
        ...input.applyJobAttempts.map((attempt) => attempt.correlationId),
      ],
    });
  } catch (error) {
    throwTraceError(getErrorMessage(error));
  }
}
