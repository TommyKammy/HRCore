import {
  MvpAOnboardingCorrelationTraceError,
  type MvpAOnboardingApplyJobAttemptRow,
  type MvpAOnboardingAssignmentRow,
  type MvpAOnboardingAuditRow,
  type MvpAOnboardingConflictRow,
  type MvpAOnboardingEmploymentRow,
  type MvpAOnboardingLifecycleRow,
  type MvpAOnboardingProviderRefreshRow,
  type MvpAOnboardingRequestOwnerActorRow,
  type MvpAOnboardingTransactionRequestRow,
  type MvpAOnboardingWritebackRow,
} from "./mvp-a-onboarding-traceability-types.js";

export function assertTransactionRequestRow(
  row: unknown,
): MvpAOnboardingTransactionRequestRow {
  if (!isRecord(row)) throwTraceError("transaction_request row is malformed");
  return {
    id: requireString(row.id),
    person_id: requireString(row.person_id),
    request_type: requireString(row.request_type),
    status_code: requireString(row.status_code),
    correlation_id: requireNullableString(row.correlation_id),
    payload_version: requireNullableString(row.payload_version),
    payload_json: requireNullableString(row.payload_json),
  };
}

export function assertAuditRow(row: unknown): MvpAOnboardingAuditRow {
  if (!isRecord(row)) throwTraceError("audit_event row is malformed");
  return {
    id: requireString(row.id),
    actor_id: requireString(row.actor_id),
    action: requireString(row.action),
    subject_table: requireString(row.subject_table),
    subject_id: requireString(row.subject_id),
    occurred_at: requireString(row.occurred_at),
    correlation_id: requireNullableString(row.correlation_id),
  };
}

export function assertEmploymentRow(row: unknown): MvpAOnboardingEmploymentRow {
  if (!isRecord(row)) throwTraceError("employment row is malformed");
  return {
    id: requireString(row.id),
    person_id: requireString(row.person_id),
    employment_code: requireString(row.employment_code),
    status_code: requireString(row.status_code),
    start_date: requireString(row.start_date),
    end_date: requireNullableString(row.end_date),
  };
}

export function assertAssignmentRow(row: unknown): MvpAOnboardingAssignmentRow {
  if (!isRecord(row)) throwTraceError("assignment row is malformed");
  return {
    id: requireString(row.id),
    person_id: requireString(row.person_id),
    employment_id: requireString(row.employment_id),
    assignment_code: requireString(row.assignment_code),
    organization_code: requireString(row.organization_code),
    position_code: requireNullableString(row.position_code),
    start_date: requireString(row.start_date),
    end_date: requireNullableString(row.end_date),
  };
}

export function assertRequestOwnerActorRow(
  row: unknown,
): MvpAOnboardingRequestOwnerActorRow {
  if (!isRecord(row)) throwTraceError("audit_event row is malformed");
  return {
    actor_id: requireString(row.actor_id),
  };
}

export function assertLifecycleRow(row: unknown): MvpAOnboardingLifecycleRow {
  if (!isRecord(row)) throwTraceError("lifecycle_event row is malformed");
  return {
    id: requireString(row.id),
    transaction_request_id: requireNullableString(row.transaction_request_id),
    person_id: requireString(row.person_id),
    event_type: requireString(row.event_type),
    effective_date: requireString(row.effective_date),
    occurred_at: requireString(row.occurred_at),
  };
}

export function assertApplyJobAttemptRow(
  row: unknown,
): MvpAOnboardingApplyJobAttemptRow {
  if (!isRecord(row)) {
    throwTraceError("onboarding_apply_job_attempt row is malformed");
  }
  return {
    id: requireString(row.id),
    transaction_request_id: requireString(row.transaction_request_id),
    person_id: requireString(row.person_id),
    status_code: requireString(row.status_code),
    attempted_at: requireString(row.attempted_at),
    worker_id: requireString(row.worker_id),
    correlation_id: requireString(row.correlation_id),
    retryable: requireNumber(row.retryable),
    error_message: requireNullableString(row.error_message),
  };
}

export function assertWritebackRow(row: unknown): MvpAOnboardingWritebackRow {
  if (!isRecord(row)) throwTraceError("writeback_event row is malformed");
  return {
    id: requireString(row.id),
    person_id: requireString(row.person_id),
    contact_point_id: requireString(row.contact_point_id),
    provider_name: requireString(row.provider_name),
    provider_subject_id: requireString(row.provider_subject_id),
    provider_value: requireString(row.provider_value),
    correlation_id: requireString(row.correlation_id),
  };
}

export function assertProviderRefreshRow(
  row: unknown,
): MvpAOnboardingProviderRefreshRow {
  if (!isRecord(row)) {
    throwTraceError("writeback_provider_refresh row is malformed");
  }
  return {
    id: requireString(row.id),
    writeback_event_id: requireString(row.writeback_event_id),
    provider_subject_id: requireString(row.provider_subject_id),
    provider_value: requireString(row.provider_value),
    refreshed_at: requireString(row.refreshed_at),
    correlation_id: requireString(row.correlation_id),
  };
}

export function assertConflictRow(row: unknown): MvpAOnboardingConflictRow {
  if (!isRecord(row)) {
    throwTraceError("writeback_work_email_conflict row is malformed");
  }
  return {
    id: requireString(row.id),
    writeback_event_id: requireString(row.writeback_event_id),
    conflict_type: requireString(row.conflict_type),
    current_contact_value: requireString(row.current_contact_value),
    attempted_provider_value: requireString(row.attempted_provider_value),
    detected_at: requireString(row.detected_at),
    correlation_id: requireString(row.correlation_id),
  };
}

export function requireString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throwTraceError("MVP-A onboarding trace encountered malformed evidence");
  }

  return value;
}

export function requireNullableString(value: unknown): string | null {
  if (value === null) return value;
  return requireString(value);
}

export function throwTraceError(message: string): never {
  throw new MvpAOnboardingCorrelationTraceError(message);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number") {
    throwTraceError("MVP-A onboarding trace encountered malformed evidence");
  }

  return value;
}
