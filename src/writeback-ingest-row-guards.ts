import { isRecord } from "./writeback-ingest-validation.js";

export function isWritebackEventRefreshRow(input: unknown): input is {
  id: string;
  ingest_order: number;
  person_id: string;
  contact_point_id: string;
  provider_name: "synthetic_okta";
  provider_subject_id: string;
  provider_value: string;
  target_contact_type: "work_email";
  correlation_id: string;
  received_at: string;
  has_inbound_value_conflict: number;
  is_latest_for_contact_point: number;
  last_provider_refresh_attempt_at: string | null;
  last_provider_refresh_attempted_value: string | null;
} {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.ingest_order === "number" &&
    typeof input.person_id === "string" &&
    typeof input.contact_point_id === "string" &&
    input.provider_name === "synthetic_okta" &&
    typeof input.provider_subject_id === "string" &&
    typeof input.provider_value === "string" &&
    input.target_contact_type === "work_email" &&
    typeof input.correlation_id === "string" &&
    typeof input.received_at === "string" &&
    typeof input.has_inbound_value_conflict === "number" &&
    typeof input.is_latest_for_contact_point === "number" &&
    (typeof input.last_provider_refresh_attempt_at === "string" ||
      input.last_provider_refresh_attempt_at === null) &&
    (typeof input.last_provider_refresh_attempted_value === "string" ||
      input.last_provider_refresh_attempted_value === null)
  );
}

export function isExistingWorkEmailContactPointRow(input: unknown): input is {
  id: string;
  value: string;
} {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.value === "string"
  );
}

export function isLatestProviderValueEventRow(input: unknown): input is {
  id: string;
  provider_value: string;
} {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.provider_value === "string"
  );
}

export function isLatestProviderRefreshAttemptRow(input: unknown): input is {
  attempt_type:
    | "provider_refresh"
    | "provider_refresh_conflict"
    | "conflict_resolution";
  id: string;
} {
  return (
    isRecord(input) &&
    (input.attempt_type === "provider_refresh" ||
      input.attempt_type === "provider_refresh_conflict" ||
      input.attempt_type === "conflict_resolution") &&
    typeof input.id === "string"
  );
}

export function isLatestProviderRefreshValueRow(input: unknown): input is {
  provider_value: string;
} {
  return isRecord(input) && typeof input.provider_value === "string";
}

export function isWorkEmailConflictTypeRow(input: unknown): input is {
  conflict_type: "inbound_value_conflict" | "provider_refresh_conflict";
} {
  return (
    isRecord(input) &&
    (input.conflict_type === "inbound_value_conflict" ||
      input.conflict_type === "provider_refresh_conflict")
  );
}

export function isRefreshedContactPointRow(input: unknown): input is {
  id: string;
  value: string;
} {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.value === "string"
  );
}

export function isWorkEmailConflictResolutionRow(input: unknown): input is {
  id: string;
  writeback_event_id: string;
  person_id: string;
  contact_point_id: string;
  provider_name: "synthetic_okta";
  provider_subject_id: string;
  conflict_type: "inbound_value_conflict" | "provider_refresh_conflict";
  current_contact_value: string;
  attempted_provider_value: string;
} {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.writeback_event_id === "string" &&
    typeof input.person_id === "string" &&
    typeof input.contact_point_id === "string" &&
    input.provider_name === "synthetic_okta" &&
    typeof input.provider_subject_id === "string" &&
    (input.conflict_type === "inbound_value_conflict" ||
      input.conflict_type === "provider_refresh_conflict") &&
    typeof input.current_contact_value === "string" &&
    typeof input.attempted_provider_value === "string"
  );
}
