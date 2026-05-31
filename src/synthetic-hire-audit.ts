import {
  type SyntheticFutureDateApplyFailureEvidence,
  type SyntheticHireDatabase,
} from "./synthetic-hire-types.js";
import {
  syntheticAuditActorId,
  syntheticAuditPocMarker,
} from "./synthetic-hire-constants.js";

type AuditSubjectTable = "person" | "transaction_request" | "lifecycle_event";

export type SyntheticAuditEventInput = {
  id: string;
  actorId: string;
  action: string;
  subjectTable: AuditSubjectTable;
  subjectId: string;
  occurredAt: string;
  correlationId: string;
  pocMarker: "synthetic_poc";
};

export type SyntheticLifecycleAppliedAuditEventInput = {
  id: string;
  subjectId: string;
  occurredAt: string;
  transactionRequestId: string;
  personId: string;
};

export function insertSyntheticAuditEvent(
  db: SyntheticHireDatabase,
  input: SyntheticAuditEventInput,
): void {
  db.prepare(
    `
      INSERT INTO audit_event (
        id,
        actor_id,
        action,
        subject_table,
        subject_id,
        occurred_at,
        correlation_id,
        poc_marker
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    input.id,
    input.actorId,
    input.action,
    input.subjectTable,
    input.subjectId,
    input.occurredAt,
    input.correlationId,
    input.pocMarker,
  );
}

export function insertSyntheticLifecycleAppliedAuditEvent(
  db: SyntheticHireDatabase,
  input: SyntheticLifecycleAppliedAuditEventInput,
): void {
  db.prepare(
    `
      INSERT INTO audit_event (
        id,
        actor_id,
        action,
        subject_table,
        subject_id,
        occurred_at,
        correlation_id,
        poc_marker
      )
      SELECT
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        correlation_id,
        ?
      FROM transaction_request
      WHERE id = ?
        AND person_id = ?
        AND request_type = 'hire'
        AND status_code = 'completed'
    `,
  ).run(
    input.id,
    syntheticAuditActorId,
    "poc.synthetic_hire.lifecycle_applied",
    "lifecycle_event",
    input.subjectId,
    input.occurredAt,
    syntheticAuditPocMarker,
    input.transactionRequestId,
    input.personId,
  );
}

export function insertSyntheticFutureDateApplyFailureAuditEvent(
  db: SyntheticHireDatabase,
  input: SyntheticFutureDateApplyFailureEvidence,
): void {
  db.prepare(
    `
      INSERT INTO audit_event (
        id,
        actor_id,
        action,
        subject_table,
        subject_id,
        occurred_at,
        correlation_id,
        poc_marker
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    input.id,
    syntheticAuditActorId,
    "poc.synthetic_hire.future_date_apply_failed",
    "transaction_request",
    input.transactionRequestId,
    input.observedAt,
    input.correlationId,
    syntheticAuditPocMarker,
  );
}
