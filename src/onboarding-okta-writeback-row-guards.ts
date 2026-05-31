import { SyntheticWorkEmailWritebackValidationError } from "./writeback-ingest.js";
import type {
  SyntheticWorkEmailConflictEvidence,
  SyntheticWorkEmailWritebackInput,
} from "./writeback-ingest.js";

export type ExistingMvpAWorkEmailWritebackEventRow = {
  id: string;
  person_id: string;
  contact_point_id: string;
  provider_name: "synthetic_okta";
  provider_subject_id: string;
  provider_value: string;
  target_contact_type: "work_email";
  correlation_id: string;
  received_at: string;
};

export type ExistingMvpAWorkEmailConflictRow = {
  id: string;
  provider_subject_id: string;
  conflict_type: "inbound_value_conflict" | "provider_refresh_conflict";
  current_contact_value: string;
  attempted_provider_value: string;
  detected_at: string;
  correlation_id: string;
};

export type ExistingMvpAWorkEmailRefreshRow = {
  correlation_id: string;
  provider_value: string;
};

export function assertExistingMvpAWorkEmailWritebackEventRow(
  row: Record<string, unknown>,
): ExistingMvpAWorkEmailWritebackEventRow {
  if (!isExistingMvpAWorkEmailWritebackEventRow(row)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email writeback event is malformed",
    );
  }

  return row;
}

export function assertExistingMvpAWorkEmailConflictRow(
  row: Record<string, unknown>,
): ExistingMvpAWorkEmailConflictRow {
  if (!isExistingMvpAWorkEmailConflictRow(row)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email writeback conflict is malformed",
    );
  }

  return row;
}

export function assertExistingMvpAWorkEmailRefreshRow(
  row: Record<string, unknown>,
): ExistingMvpAWorkEmailRefreshRow {
  if (!isExistingMvpAWorkEmailRefreshRow(row)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email provider refresh is malformed",
    );
  }

  return row;
}

export function doesExistingMvpAWorkEmailWritebackMatch(
  existing: ExistingMvpAWorkEmailWritebackEventRow,
  input: SyntheticWorkEmailWritebackInput,
): boolean {
  return (
    existing.id === input.eventId &&
    existing.person_id === input.personId &&
    existing.contact_point_id === input.contactPointId &&
    existing.provider_name === input.providerName &&
    existing.provider_subject_id === input.providerSubjectId &&
    existing.provider_value === input.providerValue &&
    existing.target_contact_type === input.targetContactType &&
    existing.correlation_id === input.correlationId &&
    existing.received_at === input.receivedAt
  );
}

export function toSyntheticWorkEmailConflictEvidence(
  conflict: ExistingMvpAWorkEmailConflictRow,
): SyntheticWorkEmailConflictEvidence {
  return {
    conflictId: conflict.id,
    conflictType: conflict.conflict_type,
    currentContactValue: conflict.current_contact_value,
    attemptedProviderValue: conflict.attempted_provider_value,
    correlationId: conflict.correlation_id,
  };
}

function isExistingMvpAWorkEmailWritebackEventRow(
  row: Record<string, unknown>,
): row is ExistingMvpAWorkEmailWritebackEventRow {
  return (
    typeof row.id === "string" &&
    typeof row.person_id === "string" &&
    typeof row.contact_point_id === "string" &&
    row.provider_name === "synthetic_okta" &&
    typeof row.provider_subject_id === "string" &&
    typeof row.provider_value === "string" &&
    row.target_contact_type === "work_email" &&
    typeof row.correlation_id === "string" &&
    typeof row.received_at === "string"
  );
}

function isExistingMvpAWorkEmailConflictRow(
  row: Record<string, unknown>,
): row is ExistingMvpAWorkEmailConflictRow {
  return (
    typeof row.id === "string" &&
    typeof row.provider_subject_id === "string" &&
    (row.conflict_type === "inbound_value_conflict" ||
      row.conflict_type === "provider_refresh_conflict") &&
    typeof row.current_contact_value === "string" &&
    typeof row.attempted_provider_value === "string" &&
    typeof row.detected_at === "string" &&
    typeof row.correlation_id === "string"
  );
}

function isExistingMvpAWorkEmailRefreshRow(
  row: Record<string, unknown>,
): row is ExistingMvpAWorkEmailRefreshRow {
  return (
    typeof row.correlation_id === "string" &&
    typeof row.provider_value === "string"
  );
}
