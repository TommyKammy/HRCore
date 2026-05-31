export type SqlValue = string | number | bigint | null;
export type SqlRunResult = {
  changes?: number | bigint;
};

export interface SqlStatement {
  get(...values: SqlValue[]): Record<string, unknown> | undefined;
  all?(...values: SqlValue[]): Record<string, unknown>[];
  run(...values: SqlValue[]): unknown;
}

export interface OnboardingTransactionRequestDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
}

export type OnboardingTransactionRequestStatus = "draft" | "submitted";
export type OnboardingApprovalDecision =
  | "approve"
  | "return"
  | "reject"
  | "cancel";
export type OnboardingTransactionRequestPersistedStatus =
  | OnboardingTransactionRequestStatus
  | "returned"
  | "rejected"
  | "cancelled"
  | "approved"
  | "completed";

export interface OnboardingTransactionRequestPersonInput {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface OnboardingTransactionRequestEmploymentPayload {
  id: string;
  employmentCode: string;
  startDate: string;
}

export interface OnboardingTransactionRequestAssignmentPayload {
  id: string;
  assignmentCode: string;
  departmentReference: string;
  legalEntityReference: string;
  managerReference: string;
  positionCode?: string | null;
}

export interface OnboardingTransactionRequestWorkEmailExpectation {
  contactPointId: string;
  value: string;
}

export interface OnboardingTransactionRequestPayload {
  tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding";
  effectiveDate: string;
  employment: OnboardingTransactionRequestEmploymentPayload;
  assignment: OnboardingTransactionRequestAssignmentPayload;
  workEmailExpectation: OnboardingTransactionRequestWorkEmailExpectation;
}

export interface OnboardingTransactionRequestInput {
  id: string;
  person: OnboardingTransactionRequestPersonInput;
  requestType: "hire";
  statusCode: OnboardingTransactionRequestStatus;
  requestedAt: string;
  correlationId: string;
  payloadVersion: "mvp_a_onboarding_v1";
  payload: OnboardingTransactionRequestPayload;
}

export interface OnboardingTransactionRequestPersistenceResult {
  personId: string;
  transactionRequestId: string;
  statusCode: OnboardingTransactionRequestPersistedStatus;
  correlationId: string;
}

export interface EditableOnboardingTransactionRequestPersistenceResult extends OnboardingTransactionRequestPersistenceResult {
  operation: "created" | "updated" | "idempotent";
}

export interface OnboardingApprovalDecisionInput {
  transactionRequestId: string;
  decision: OnboardingApprovalDecision;
  decidedAt: string;
  decidedBy: string;
  correlationId: string;
}

export interface OnboardingApprovalDecisionResult {
  personId: string;
  transactionRequestId: string;
  statusCode: Exclude<
    OnboardingTransactionRequestPersistedStatus,
    "draft" | "submitted" | "completed"
  >;
  decision: OnboardingApprovalDecision;
  auditEventId: string;
  correlationId: string;
}

export interface ApplyApprovedOnboardingTransactionRequestInput {
  transactionRequestId: string;
  appliedAt: string;
  appliedBy: string;
  correlationId: string;
}

export interface AppliedOnboardingTransactionRequestResult {
  personId: string;
  employmentId: string;
  assignmentId: string;
  transactionRequestId: string;
  lifecycleEventId: string;
  statusCode: "completed";
  correlationId: string;
}

export interface ApplyDueOnboardingTransactionRequestsInput {
  now: string;
  workerId: string;
  correlationId: string;
  batchLimit?: number;
}

export type ApplyDueOnboardingTransactionRequestsStatus =
  | "applied"
  | "retryable_failure"
  | "non_retryable_failure";

export interface ApplyDueOnboardingTransactionRequestsItemResult {
  transactionRequestId: string;
  status: ApplyDueOnboardingTransactionRequestsStatus;
  lifecycleEventId?: string;
  errorMessage?: string;
}

export interface ApplyDueOnboardingTransactionRequestsResult {
  attempted: number;
  applied: number;
  failed: number;
  skipped: number;
  correlationId: string;
  results: ApplyDueOnboardingTransactionRequestsItemResult[];
}

export type ExistingOnboardingTransactionRequestRow = {
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

export type ExistingAuditEventRow = {
  id: string;
  actor_id: string;
  action: string;
  subject_table: string;
  subject_id: string;
  occurred_at: string;
  correlation_id: string | null;
};

export type ExistingAppliedOnboardingTransactionRequestRow = {
  transaction_status_code: string;
  request_type: string;
  person_id: string;
  payload_version: string | null;
  payload_json: string | null;
  lifecycle_event_id: string | null;
  lifecycle_event_type: string | null;
  lifecycle_effective_date: string | null;
  lifecycle_occurred_at: string | null;
  employment_id: string | null;
  employment_code: string | null;
  employment_status_code: string | null;
  employment_start_date: string | null;
  employment_end_date: string | null;
  assignment_id: string | null;
  assignment_code: string | null;
  organization_code: string | null;
  position_code: string | null;
  assignment_start_date: string | null;
  assignment_end_date: string | null;
  audit_event_id: string | null;
  audit_actor_id: string | null;
  audit_action: string | null;
  audit_subject_table: string | null;
  audit_subject_id: string | null;
  audit_occurred_at: string | null;
  audit_correlation_id: string | null;
};

export type DueOnboardingApplyCandidateRow =
  ExistingOnboardingTransactionRequestRow;

export type ExistingOnboardingApplyJobAttemptRow = {
  transaction_request_id: string;
  status_code: string;
  error_message: string | null;
};

export type ExistingOnboardingApplyJobRunRow = {
  attempted: number;
  applied: number;
  failed: number;
  skipped: number;
};
