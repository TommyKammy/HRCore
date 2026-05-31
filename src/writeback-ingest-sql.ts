import type {
  SyntheticWorkEmailConflictEvidence,
  SyntheticWorkEmailWritebackInput,
  SyntheticWritebackDatabase,
} from "./writeback-ingest-types.js";
import {
  isLatestProviderRefreshValueRow,
  isLatestProviderValueEventRow,
} from "./writeback-ingest-row-guards.js";
import { isRecord, timestampPattern } from "./writeback-ingest-validation.js";

export function insertSyntheticWorkEmailWritebackEvent(
  db: SyntheticWritebackDatabase,
  input: SyntheticWorkEmailWritebackInput,
  contactPointId: string,
): void {
  db.prepare(
    `
      INSERT INTO writeback_event (
        id,
        person_id,
        contact_point_id,
        provider_name,
        provider_subject_id,
        provider_value,
        target_contact_type,
        correlation_id,
        received_at,
        poc_marker
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    input.eventId,
    input.personId,
    contactPointId,
    input.providerName,
    input.providerSubjectId,
    input.providerValue,
    input.targetContactType,
    input.correlationId,
    input.receivedAt,
    input.pocMarker,
  );
}

export function insertSyntheticWorkEmailConflict(
  db: SyntheticWritebackDatabase,
  eventId: string,
  personId: string,
  contactPointId: string,
  providerName: "synthetic_okta",
  providerSubjectId: string,
  conflict: SyntheticWorkEmailConflictEvidence,
  detectedAt: string,
): void {
  db.prepare(
    `
      INSERT INTO writeback_work_email_conflict (
        id,
        writeback_event_id,
        person_id,
        contact_point_id,
        provider_name,
        provider_subject_id,
        conflict_type,
        current_contact_value,
        attempted_provider_value,
        detected_at,
        correlation_id,
        poc_marker
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
    `,
  ).run(
    conflict.conflictId,
    eventId,
    personId,
    contactPointId,
    providerName,
    providerSubjectId,
    conflict.conflictType,
    conflict.currentContactValue,
    conflict.attemptedProviderValue,
    detectedAt,
    conflict.correlationId,
  );
}

export function getLatestSyntheticProviderValueForContactPoint(
  db: SyntheticWritebackDatabase,
  personId: string,
  contactPointId: string,
): string | undefined {
  const latestEvent = db
    .prepare(
      `
        SELECT id, provider_value
        FROM writeback_event
        WHERE person_id = ?
          AND contact_point_id = ?
          AND target_contact_type = 'work_email'
          AND NOT EXISTS (
            SELECT 1
            FROM writeback_work_email_conflict AS inbound_conflict
            WHERE inbound_conflict.writeback_event_id = writeback_event.id
              AND inbound_conflict.conflict_type = 'inbound_value_conflict'
          )
        ORDER BY julianday(received_at) DESC,
          rowid DESC
        LIMIT 1
      `,
    )
    .get(personId, contactPointId);

  if (!isLatestProviderValueEventRow(latestEvent)) {
    return undefined;
  }

  const latestRefresh = db
    .prepare(
      `
        SELECT observed_provider.provider_value
        FROM (
          SELECT
            provider_value,
            refreshed_at AS observed_at,
            rowid AS observed_order
          FROM writeback_provider_refresh
          WHERE writeback_event_id = ?
            AND person_id = ?
            AND contact_point_id = ?
          UNION ALL
          SELECT
            attempted_provider_value AS provider_value,
            detected_at AS observed_at,
            rowid AS observed_order
          FROM writeback_work_email_conflict
          WHERE writeback_event_id = ?
            AND person_id = ?
            AND contact_point_id = ?
            AND conflict_type = 'provider_refresh_conflict'
        ) AS observed_provider
        ORDER BY julianday(observed_provider.observed_at) DESC,
          observed_provider.observed_order DESC
        LIMIT 1
      `,
    )
    .get(
      latestEvent.id,
      personId,
      contactPointId,
      latestEvent.id,
      personId,
      contactPointId,
    );

  return isLatestProviderRefreshValueRow(latestRefresh)
    ? latestRefresh.provider_value
    : latestEvent.provider_value;
}

export function getLatestAcceptedSyntheticWorkEmailWritebackEvent(
  db: SyntheticWritebackDatabase,
  personId: string,
  contactPointId: string,
): { received_at: string } | undefined {
  const row = db
    .prepare(
      `
        SELECT received_at
        FROM writeback_event
        WHERE person_id = ?
          AND contact_point_id = ?
          AND target_contact_type = 'work_email'
          AND NOT EXISTS (
            SELECT 1
            FROM writeback_work_email_conflict AS inbound_conflict
            WHERE inbound_conflict.writeback_event_id = writeback_event.id
              AND inbound_conflict.conflict_type = 'inbound_value_conflict'
          )
        ORDER BY julianday(received_at) DESC,
          rowid DESC
        LIMIT 1
      `,
    )
    .get(personId, contactPointId);

  if (
    isRecord(row) &&
    typeof row.received_at === "string" &&
    timestampPattern.test(row.received_at)
  ) {
    return { received_at: row.received_at };
  }

  return undefined;
}

export function rollbackNamedSavepoint(
  db: SyntheticWritebackDatabase,
  savepointName: string,
): void {
  try {
    db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
  } catch {
    // Preserve the original write failure; rollback cleanup is best-effort.
  }

  try {
    db.exec(`RELEASE SAVEPOINT ${savepointName}`);
  } catch {
    // Preserve the original write failure; rollback cleanup is best-effort.
  }
}
