import type { TransferTransactionRequestPayload } from "./transfer-transaction-request-contract.js";
import type { OktaTransferProjectionImpactEvidence } from "./transfer-okta-projection-integration.js";

export class MvpBTransferCorrelationTraceError extends Error {
  override name = "MvpBTransferCorrelationTraceError";
}

export interface VerifyMvpBTransferCorrelationTraceInput {
  correlationId: string;
  requireApproval: boolean;
  requireApply: boolean;
  requireApplyJobAttempt?: boolean;
  requireOktaProjection?: boolean;
  oktaProjection?: OktaTransferProjectionImpactEvidence;
}

export interface MvpBTransferTransactionTrace {
  id: string;
  personId: string;
  requestType: string;
  statusCode: string;
  correlationId: string;
}

export interface MvpBTransferAssignmentTrace {
  id: string;
  employmentId: string;
  assignmentCode: string;
  organizationCode: string;
  positionCode: string | null;
  startDate: string;
  endDate: string | null;
}

export interface MvpBTransferLifecycleTrace {
  id: string;
  transactionRequestId: string;
  personId: string;
  eventType: string;
  effectiveDate: string;
  occurredAt: string;
}

export interface MvpBTransferAuditTrace {
  id: string;
  actorId: string;
  action: string;
  subjectTable: string;
  subjectId: string;
  occurredAt: string;
  correlationId: string;
}

export interface MvpBTransferApplyJobAttemptTrace {
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

export interface MvpBTransferCorrelationTrace {
  transactionRequest: MvpBTransferTransactionTrace;
  approvalAuditEvent?: MvpBTransferAuditTrace;
  applyAuditEvent?: MvpBTransferAuditTrace;
  auditEvents: MvpBTransferAuditTrace[];
  lifecycleEvent?: MvpBTransferLifecycleTrace;
  closedAssignment?: MvpBTransferAssignmentTrace;
  targetAssignment?: MvpBTransferAssignmentTrace;
  applyJobAttempts: MvpBTransferApplyJobAttemptTrace[];
  oktaProjection?: OktaTransferProjectionImpactEvidence;
  remainingProductionReadinessGates: string[];
}

export type ExistingTransferTransactionRequestRow = {
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

export type ExistingTransferAssignmentRow = {
  id: string;
  person_id: string;
  employment_id: string;
  assignment_code: string;
  organization_code: string;
  position_code: string | null;
  start_date: string;
  end_date: string | null;
};

export type ExistingTransferAuditRow = {
  id: string;
  actor_id: string;
  action: string;
  subject_table: string;
  subject_id: string;
  occurred_at: string;
  correlation_id: string | null;
};

export type ExistingTransferLifecycleRow = {
  id: string;
  transaction_request_id: string | null;
  person_id: string;
  event_type: string;
  effective_date: string;
  occurred_at: string;
};

export type ExistingTransferApplyJobAttemptRow = {
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

export function throwTransferTraceError(message: string): never {
  throw new MvpBTransferCorrelationTraceError(message);
}

export type ParsedTransferTracePayload = TransferTransactionRequestPayload;
