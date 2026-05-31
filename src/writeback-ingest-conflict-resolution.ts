import type {
  SyntheticWorkEmailConflictResolutionInput,
  SyntheticWorkEmailConflictResolutionResult,
  SyntheticWritebackDatabase,
} from "./writeback-ingest-types.js";
import {
  isExistingWorkEmailContactPointRow,
  isLatestProviderRefreshAttemptRow,
  isLatestProviderValueEventRow,
  isWorkEmailConflictResolutionRow,
  isWorkEmailConflictTypeRow,
} from "./writeback-ingest-row-guards.js";
import { rollbackNamedSavepoint } from "./writeback-ingest-sql.js";
import {
  parseSyntheticWorkEmailConflictResolutionInput,
  SyntheticWorkEmailWritebackValidationError,
} from "./writeback-ingest-validation.js";

export function resolveSyntheticWorkEmailConflict(
  db: SyntheticWritebackDatabase,
  input: SyntheticWorkEmailConflictResolutionInput,
): SyntheticWorkEmailConflictResolutionResult {
  const validatedInput = parseSyntheticWorkEmailConflictResolutionInput(input);

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT synthetic_work_email_conflict_resolution");
    savepointStarted = true;

    const conflict = db
      .prepare(
        `
          SELECT
            id,
            writeback_event_id,
            person_id,
            contact_point_id,
            provider_name,
            provider_subject_id,
            conflict_type,
            current_contact_value,
            attempted_provider_value
          FROM writeback_work_email_conflict
          WHERE id = ?
            AND conflict_type = 'provider_refresh_conflict'
        `,
      )
      .get(validatedInput.conflictId);

    if (!isWorkEmailConflictResolutionRow(conflict)) {
      const recordedConflictType = db
        .prepare(
          `
            SELECT conflict_type
            FROM writeback_work_email_conflict
            WHERE id = ?
          `,
        )
        .get(validatedInput.conflictId);

      if (
        isWorkEmailConflictTypeRow(recordedConflictType) &&
        recordedConflictType.conflict_type !== "provider_refresh_conflict"
      ) {
        throw new SyntheticWorkEmailWritebackValidationError(
          "conflict resolution requires a provider refresh conflict",
        );
      }

      throw new SyntheticWorkEmailWritebackValidationError(
        "conflict resolution requires an existing conflict",
      );
    }

    if (conflict.conflict_type !== "provider_refresh_conflict") {
      throw new SyntheticWorkEmailWritebackValidationError(
        "conflict resolution requires a provider refresh conflict",
      );
    }

    if (
      conflict.writeback_event_id !== validatedInput.writebackEventId ||
      conflict.provider_name !== validatedInput.providerName ||
      conflict.provider_subject_id !== validatedInput.providerSubjectId
    ) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "conflict resolution must match the recorded conflict identity",
      );
    }

    if (
      conflict.current_contact_value !== validatedInput.currentContactValue ||
      conflict.attempted_provider_value !== validatedInput.resolvedProviderValue
    ) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "conflict resolution must match the recorded conflict values",
      );
    }

    const latestProviderRefreshAttempt = db
      .prepare(
        `
          SELECT latest_attempt.attempt_type, latest_attempt.id
          FROM (
            SELECT
              'provider_refresh' AS attempt_type,
              applied_refresh.id AS id,
              applied_refresh.refreshed_at AS observed_at,
              applied_refresh.rowid AS observed_order,
              1 AS observed_precedence
            FROM writeback_provider_refresh AS applied_refresh
            WHERE applied_refresh.writeback_event_id = ?
              AND applied_refresh.person_id = ?
              AND applied_refresh.contact_point_id = ?
              AND applied_refresh.provider_name = ?
              AND applied_refresh.provider_subject_id = ?
            UNION ALL
            SELECT
              'provider_refresh_conflict' AS attempt_type,
              refresh_conflict.id AS id,
              refresh_conflict.detected_at AS observed_at,
              refresh_conflict.rowid AS observed_order,
              2 AS observed_precedence
            FROM writeback_work_email_conflict AS refresh_conflict
            WHERE refresh_conflict.writeback_event_id = ?
              AND refresh_conflict.person_id = ?
              AND refresh_conflict.contact_point_id = ?
              AND refresh_conflict.provider_name = ?
              AND refresh_conflict.provider_subject_id = ?
              AND refresh_conflict.conflict_type = 'provider_refresh_conflict'
            UNION ALL
            SELECT
              'conflict_resolution' AS attempt_type,
              conflict_resolution.id AS id,
              conflict_resolution.decided_at AS observed_at,
              conflict_resolution.rowid AS observed_order,
              3 AS observed_precedence
            FROM writeback_work_email_conflict_resolution AS conflict_resolution
            WHERE conflict_resolution.writeback_event_id = ?
              AND conflict_resolution.person_id = ?
              AND conflict_resolution.contact_point_id = ?
              AND conflict_resolution.provider_name = ?
              AND conflict_resolution.provider_subject_id = ?
          ) AS latest_attempt
          ORDER BY julianday(latest_attempt.observed_at) DESC,
            latest_attempt.observed_precedence DESC,
            latest_attempt.observed_order DESC
          LIMIT 1
        `,
      )
      .get(
        conflict.writeback_event_id,
        conflict.person_id,
        conflict.contact_point_id,
        conflict.provider_name,
        conflict.provider_subject_id,
        conflict.writeback_event_id,
        conflict.person_id,
        conflict.contact_point_id,
        conflict.provider_name,
        conflict.provider_subject_id,
        conflict.writeback_event_id,
        conflict.person_id,
        conflict.contact_point_id,
        conflict.provider_name,
        conflict.provider_subject_id,
      );

    if (
      !isLatestProviderRefreshAttemptRow(latestProviderRefreshAttempt) ||
      latestProviderRefreshAttempt.attempt_type !== "provider_refresh_conflict"
    ) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "conflict resolution requires the latest provider refresh attempt",
      );
    }

    if (latestProviderRefreshAttempt.id !== conflict.id) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "conflict resolution requires the latest provider refresh conflict",
      );
    }

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
      .get(conflict.person_id, conflict.contact_point_id);

    if (
      !isLatestProviderValueEventRow(latestEvent) ||
      latestEvent.id !== conflict.writeback_event_id
    ) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "conflict resolution requires the latest writeback event for the contact point",
      );
    }

    const currentContactPoint = db
      .prepare(
        `
          SELECT id, value
          FROM contact_point
          WHERE id = ?
            AND person_id = ?
            AND contact_type = 'work_email'
        `,
      )
      .get(conflict.contact_point_id, conflict.person_id);

    if (!isExistingWorkEmailContactPointRow(currentContactPoint)) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "conflict resolution requires the original work_email contact point",
      );
    }

    if (currentContactPoint.value !== conflict.current_contact_value) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "conflict resolution requires current HRCore value to match the recorded conflict",
      );
    }

    db.prepare(
      `
        INSERT INTO writeback_work_email_conflict_resolution (
          id,
          conflict_id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          decision,
          current_contact_value,
          resolved_provider_value,
          decided_at,
          decided_by,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      validatedInput.resolutionId,
      conflict.id,
      conflict.writeback_event_id,
      conflict.person_id,
      conflict.contact_point_id,
      conflict.provider_name,
      conflict.provider_subject_id,
      validatedInput.decision,
      validatedInput.currentContactValue,
      validatedInput.resolvedProviderValue,
      validatedInput.decidedAt,
      validatedInput.decidedBy,
      validatedInput.correlationId,
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = ?
        WHERE id = ?
          AND person_id = ?
          AND contact_type = 'work_email'
      `,
    ).run(
      validatedInput.resolvedProviderValue,
      conflict.contact_point_id,
      conflict.person_id,
    );

    db.exec("RELEASE SAVEPOINT synthetic_work_email_conflict_resolution");

    return {
      resolutionId: validatedInput.resolutionId,
      conflictId: conflict.id,
      writebackEventId: conflict.writeback_event_id,
      personId: conflict.person_id,
      contactPointId: conflict.contact_point_id,
      providerName: conflict.provider_name,
      providerSubjectId: conflict.provider_subject_id,
      decision: validatedInput.decision,
      resolvedProviderValue: validatedInput.resolvedProviderValue,
      correlationId: validatedInput.correlationId,
      applied: true,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackNamedSavepoint(db, "synthetic_work_email_conflict_resolution");
    }

    throw error;
  }
}
