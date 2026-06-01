import type { TerminationTransactionRequestPayload } from "./termination-transaction-request-contract.js";
import type { OktaTerminationProjectionImpactEvidence } from "./termination-okta-projection-integration.js";

export class MvpCTerminationCorrelationTraceError extends Error {
  override name = "MvpCTerminationCorrelationTraceError";
}

export interface VerifyMvpCTerminationCorrelationTraceInput {
  correlationId: string;
  requireApproval: boolean;
  requireApply: boolean;
  requireApplyJobAttempt?: boolean;
  requireOktaProjection?: boolean;
  oktaProjection?: OktaTerminationProjectionImpactEvidence;
}

export interface MvpCTerminationTransactionTrace {
  id: string;
  personId: string;
  requestType: string;
  statusCode: string;
  correlationId: string;
}

export interface MvpCTerminationEmploymentTrace {
  id: string;
  employmentCode: string;
  statusCode: string;
  startDate: string;
  endDate: string | null;
}

export interface MvpCTerminationAssignmentTrace {
  id: string;
  employmentId: string;
  assignmentCode: string;
  organizationCode: string;
  positionCode: string | null;
  startDate: string;
  endDate: string | null;
}

export interface MvpCTerminationLifecycleTrace {
  id: string;
  transactionRequestId: string;
  personId: string;
  eventType: string;
  effectiveDate: string;
  occurredAt: string;
}

export interface MvpCTerminationAuditTrace {
  id: string;
  actorId: string;
  action: string;
  subjectTable: string;
  subjectId: string;
  occurredAt: string;
  correlationId: string;
}

export interface MvpCTerminationApplyJobAttemptTrace {
  id: string;
  transactionRequestId: string;
  personId: string;
  statusCode: string;
  attemptedAt: string;
  workerId: string;
  correlationId: string;
  retryable: boolean;
  errorMessage: string | null;
}

export interface MvpCTerminationCorrelationTrace {
  transactionRequest: MvpCTerminationTransactionTrace;
  approvalAuditEvent?: MvpCTerminationAuditTrace;
  applyAuditEvent?: MvpCTerminationAuditTrace;
  auditEvents: MvpCTerminationAuditTrace[];
  lifecycleEvent?: MvpCTerminationLifecycleTrace;
  endedEmployment?: MvpCTerminationEmploymentTrace;
  endedAssignment?: MvpCTerminationAssignmentTrace;
  applyJobAttempts: MvpCTerminationApplyJobAttemptTrace[];
  oktaProjection?: OktaTerminationProjectionImpactEvidence;
  remainingProductionReadinessGates: string[];
}

export type ExistingTerminationTransactionRequestRow = {
  person_id: string;
  transaction_request_id: string;
  display_name: string;
  created_at: string;
  request_type: string;
  status_code: string;
  requested_at: string;
  correlation_id: string | null;
  payload_version: string | null;
  payload_json: string | null;
};

export type ExistingTerminationEmploymentRow = {
  id: string;
  person_id: string;
  employment_code: string;
  status_code: string;
  start_date: string;
  end_date: string | null;
};

export type ExistingTerminationAssignmentRow = {
  id: string;
  person_id: string;
  employment_id: string;
  assignment_code: string;
  organization_code: string;
  position_code: string | null;
  start_date: string;
  end_date: string | null;
};

export type ExistingTerminationAuditRow = {
  id: string;
  actor_id: string;
  action: string;
  subject_table: string;
  subject_id: string;
  occurred_at: string;
  correlation_id: string | null;
};

export type ExistingTerminationLifecycleRow = {
  id: string;
  transaction_request_id: string | null;
  person_id: string;
  event_type: string;
  effective_date: string;
  occurred_at: string;
};

export type ExistingTerminationApplyJobAttemptRow = {
  id: string;
  transaction_request_id: string;
  person_id: string;
  status_code: string;
  attempted_at: string;
  worker_id: string;
  correlation_id: string;
  retryable: number;
  error_message: string | null;
};

export function throwTerminationTraceError(message: string): never {
  throw new MvpCTerminationCorrelationTraceError(message);
}

export type ParsedTerminationTracePayload =
  TerminationTransactionRequestPayload;
