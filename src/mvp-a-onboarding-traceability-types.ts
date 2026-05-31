export type MvpAOnboardingTraceabilitySqlValue =
  | string
  | number
  | bigint
  | null;

export interface MvpAOnboardingTraceabilitySqlStatement {
  get(...values: MvpAOnboardingTraceabilitySqlValue[]): unknown;
  all(...values: MvpAOnboardingTraceabilitySqlValue[]): unknown[];
}

export interface MvpAOnboardingTraceabilityDatabase {
  prepare(sql: string): MvpAOnboardingTraceabilitySqlStatement;
}

export interface VerifyMvpAOnboardingCorrelationTraceInput {
  correlationId: string;
  requireApproval: boolean;
  requireApply: boolean;
  requireApplyJobAttempt?: boolean;
  requireWriteback: boolean;
  requireProviderRefresh: boolean;
}

export class MvpAOnboardingCorrelationTraceError extends Error {
  override name = "MvpAOnboardingCorrelationTraceError";
}

export interface MvpAOnboardingTransactionTrace {
  id: string;
  personId: string;
  requestType: string;
  statusCode: string;
  correlationId: string;
}

export interface MvpAOnboardingEmploymentTrace {
  id: string;
  employmentCode: string;
  statusCode: string;
  startDate: string;
  endDate: string | null;
}

export interface MvpAOnboardingAssignmentTrace {
  id: string;
  employmentId: string;
  assignmentCode: string;
  organizationCode: string;
  positionCode: string | null;
  startDate: string;
  endDate: string | null;
}

export interface MvpAOnboardingLifecycleTrace {
  id: string;
  transactionRequestId: string;
  personId: string;
  eventType: string;
  effectiveDate: string;
  occurredAt: string;
}

export interface MvpAOnboardingAuditTrace {
  id: string;
  actorId: string;
  action: string;
  subjectTable: string;
  subjectId: string;
  occurredAt: string;
  correlationId: string;
}

export interface MvpAOnboardingApplyJobAttemptTrace {
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

export interface MvpAOnboardingWorkEmailWritebackTrace {
  eventId: string;
  personId: string;
  contactPointId: string;
  providerName: string;
  providerSubjectId: string;
  providerValue: string;
  correlationId: string;
}

export interface MvpAOnboardingProviderRefreshTrace {
  id: string;
  writebackEventId: string;
  providerSubjectId: string;
  providerValue: string;
  refreshedAt: string;
  correlationId: string;
}

export interface MvpAOnboardingWorkEmailConflictTrace {
  id: string;
  writebackEventId: string;
  conflictType: string;
  currentContactValue: string;
  attemptedProviderValue: string;
  detectedAt: string;
  correlationId: string;
}

export interface MvpAOnboardingCorrelationTrace {
  transactionRequest: MvpAOnboardingTransactionTrace;
  authorizationGate: import("./mvp-a-onboarding-evidence-authorization.js").MvpAOnboardingEvidenceAuthorizationGate;
  bindingGate: import("./mvp-a-onboarding-binding-gate.js").MvpAOnboardingBindingGate;
  employment?: MvpAOnboardingEmploymentTrace;
  assignment?: MvpAOnboardingAssignmentTrace;
  approvalAuditEvent?: MvpAOnboardingAuditTrace;
  applyAuditEvent?: MvpAOnboardingAuditTrace;
  auditEvents: MvpAOnboardingAuditTrace[];
  lifecycleEvent?: MvpAOnboardingLifecycleTrace;
  applyJobAttempts: MvpAOnboardingApplyJobAttemptTrace[];
  workEmailWriteback?: MvpAOnboardingWorkEmailWritebackTrace;
  providerRefresh?: MvpAOnboardingProviderRefreshTrace;
  providerRefreshConflict?: MvpAOnboardingWorkEmailConflictTrace;
  inboundWorkEmailConflict?: MvpAOnboardingWorkEmailConflictTrace;
  workEmailConflict?: MvpAOnboardingWorkEmailConflictTrace;
  remainingP2A02Gates: string[];
}

export type MvpAOnboardingTransactionRequestRow = {
  id: string;
  person_id: string;
  request_type: string;
  status_code: string;
  correlation_id: string | null;
  payload_version: string | null;
  payload_json: string | null;
};

export type MvpAOnboardingPayload = {
  tenantEnvironmentId: string;
  effectiveDate: string;
  employment: { id: string; employmentCode: string };
  assignment: {
    id: string;
    assignmentCode: string;
    departmentReference: string;
    legalEntityReference: string;
  };
  workEmailExpectation: { contactPointId: string; value: string };
};

export type MvpAOnboardingWritebackCorrelationChain = {
  writebackCorrelationId: string;
  providerRefreshCorrelationPrefix: string;
  providerRefreshConflictCorrelationSuffix: string;
  inboundConflictCorrelationId: string;
};

export type MvpAOnboardingAuditRow = {
  id: string;
  actor_id: string;
  action: string;
  subject_table: string;
  subject_id: string;
  occurred_at: string;
  correlation_id: string | null;
};

export type MvpAOnboardingEmploymentRow = {
  id: string;
  person_id: string;
  employment_code: string;
  status_code: string;
  start_date: string;
  end_date: string | null;
};

export type MvpAOnboardingAssignmentRow = {
  id: string;
  person_id: string;
  employment_id: string;
  assignment_code: string;
  organization_code: string;
  position_code: string | null;
  start_date: string;
  end_date: string | null;
};

export type MvpAOnboardingLifecycleRow = {
  id: string;
  transaction_request_id: string | null;
  person_id: string;
  event_type: string;
  effective_date: string;
  occurred_at: string;
};

export type MvpAOnboardingApplyJobAttemptRow = {
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

export type MvpAOnboardingWritebackRow = {
  id: string;
  person_id: string;
  contact_point_id: string;
  provider_name: string;
  provider_subject_id: string;
  provider_value: string;
  correlation_id: string;
};

export type MvpAOnboardingProviderRefreshRow = {
  id: string;
  writeback_event_id: string;
  provider_subject_id: string;
  provider_value: string;
  refreshed_at: string;
  correlation_id: string;
};

export type MvpAOnboardingConflictRow = {
  id: string;
  writeback_event_id: string;
  conflict_type: string;
  current_contact_value: string;
  attempted_provider_value: string;
  detected_at: string;
  correlation_id: string;
};

export type MvpAOnboardingRequestOwnerActorRow = {
  actor_id: string;
};
