import type {
  SyntheticWorkEmailProviderRefreshInput,
  SyntheticWorkEmailProviderRefreshResult,
  SyntheticWritebackDatabase,
} from "./writeback-ingest-types.js";
import { createSyntheticWorkEmailConflictEvidence } from "./writeback-ingest-conflict-evidence.js";
import {
  createSyntheticWorkEmailProviderRefreshCorrelationId,
  createSyntheticWorkEmailProviderRefreshId,
} from "./writeback-ingest-ids.js";
import {
  isExistingWorkEmailContactPointRow,
  isRefreshedContactPointRow,
  isWritebackEventRefreshRow,
} from "./writeback-ingest-row-guards.js";
import {
  insertSyntheticWorkEmailConflict,
  rollbackNamedSavepoint,
} from "./writeback-ingest-sql.js";
import {
  parseSyntheticWorkEmailProviderRefreshInput,
  SyntheticWorkEmailWritebackValidationError,
  toTimestampMillis,
} from "./writeback-ingest-validation.js";

export function refreshSyntheticWorkEmailFromProvider(
  db: SyntheticWritebackDatabase,
  input: SyntheticWorkEmailProviderRefreshInput,
): SyntheticWorkEmailProviderRefreshResult {
  const validatedInput = parseSyntheticWorkEmailProviderRefreshInput(input);

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT synthetic_work_email_provider_refresh");
    savepointStarted = true;

    const event = db
      .prepare(
        `
          SELECT
            id,
            rowid AS ingest_order,
            person_id,
            contact_point_id,
            provider_name,
            provider_subject_id,
            provider_value,
            target_contact_type,
            correlation_id,
            received_at,
            EXISTS (
              SELECT 1
              FROM writeback_work_email_conflict AS inbound_conflict
              WHERE inbound_conflict.writeback_event_id = current_event.id
                AND inbound_conflict.conflict_type = 'inbound_value_conflict'
            ) AS has_inbound_value_conflict,
            NOT EXISTS (
              SELECT 1
              FROM writeback_event AS newer_event
              WHERE newer_event.person_id = current_event.person_id
                AND newer_event.contact_point_id = current_event.contact_point_id
                AND newer_event.target_contact_type = current_event.target_contact_type
                AND NOT EXISTS (
                  SELECT 1
                  FROM writeback_work_email_conflict AS newer_inbound_conflict
                  WHERE newer_inbound_conflict.writeback_event_id = newer_event.id
                    AND newer_inbound_conflict.conflict_type = 'inbound_value_conflict'
                )
                AND (
                  julianday(newer_event.received_at) > julianday(current_event.received_at)
                  OR (
                    julianday(newer_event.received_at) = julianday(current_event.received_at)
                    AND newer_event.rowid > current_event.rowid
                  )
                )
            ) AS is_latest_for_contact_point,
            (
              SELECT observed_refresh.observed_at
              FROM (
                SELECT
                  applied_refresh.refreshed_at AS observed_at,
                  applied_refresh.rowid AS observed_order,
                  1 AS observed_precedence
                FROM writeback_provider_refresh AS applied_refresh
                WHERE applied_refresh.writeback_event_id = current_event.id
                  AND applied_refresh.person_id = current_event.person_id
                  AND applied_refresh.contact_point_id = current_event.contact_point_id
                  AND applied_refresh.provider_name = current_event.provider_name
                  AND applied_refresh.provider_subject_id = current_event.provider_subject_id
                UNION ALL
                SELECT
                  refresh_conflict.detected_at AS observed_at,
                  refresh_conflict.rowid AS observed_order,
                  2 AS observed_precedence
                FROM writeback_work_email_conflict AS refresh_conflict
                WHERE refresh_conflict.writeback_event_id = current_event.id
                  AND refresh_conflict.person_id = current_event.person_id
                  AND refresh_conflict.contact_point_id = current_event.contact_point_id
                  AND refresh_conflict.provider_name = current_event.provider_name
                  AND refresh_conflict.provider_subject_id = current_event.provider_subject_id
                  AND refresh_conflict.conflict_type = 'provider_refresh_conflict'
                UNION ALL
                SELECT
                  conflict_resolution.decided_at AS observed_at,
                  conflict_resolution.rowid AS observed_order,
                  3 AS observed_precedence
                FROM writeback_work_email_conflict_resolution AS conflict_resolution
                WHERE conflict_resolution.writeback_event_id = current_event.id
                  AND conflict_resolution.person_id = current_event.person_id
                  AND conflict_resolution.contact_point_id = current_event.contact_point_id
                  AND conflict_resolution.provider_name = current_event.provider_name
                  AND conflict_resolution.provider_subject_id = current_event.provider_subject_id
              ) AS observed_refresh
              ORDER BY julianday(observed_refresh.observed_at) DESC,
                observed_refresh.observed_precedence DESC,
                observed_refresh.observed_order DESC
              LIMIT 1
            ) AS last_provider_refresh_attempt_at
            ,
            (
              SELECT observed_refresh.provider_value
              FROM (
                SELECT
                  applied_refresh.provider_value,
                  applied_refresh.refreshed_at AS observed_at,
                  applied_refresh.rowid AS observed_order,
                  1 AS observed_precedence
                FROM writeback_provider_refresh AS applied_refresh
                WHERE applied_refresh.writeback_event_id = current_event.id
                  AND applied_refresh.person_id = current_event.person_id
                  AND applied_refresh.contact_point_id = current_event.contact_point_id
                  AND applied_refresh.provider_name = current_event.provider_name
                  AND applied_refresh.provider_subject_id = current_event.provider_subject_id
                UNION ALL
                SELECT
                  refresh_conflict.attempted_provider_value AS provider_value,
                  refresh_conflict.detected_at AS observed_at,
                  refresh_conflict.rowid AS observed_order,
                  2 AS observed_precedence
                FROM writeback_work_email_conflict AS refresh_conflict
                WHERE refresh_conflict.writeback_event_id = current_event.id
                  AND refresh_conflict.person_id = current_event.person_id
                  AND refresh_conflict.contact_point_id = current_event.contact_point_id
                  AND refresh_conflict.provider_name = current_event.provider_name
                  AND refresh_conflict.provider_subject_id = current_event.provider_subject_id
                  AND refresh_conflict.conflict_type = 'provider_refresh_conflict'
                UNION ALL
                SELECT
                  conflict_resolution.resolved_provider_value AS provider_value,
                  conflict_resolution.decided_at AS observed_at,
                  conflict_resolution.rowid AS observed_order,
                  3 AS observed_precedence
                FROM writeback_work_email_conflict_resolution AS conflict_resolution
                WHERE conflict_resolution.writeback_event_id = current_event.id
                  AND conflict_resolution.person_id = current_event.person_id
                  AND conflict_resolution.contact_point_id = current_event.contact_point_id
                  AND conflict_resolution.provider_name = current_event.provider_name
                  AND conflict_resolution.provider_subject_id = current_event.provider_subject_id
              ) AS observed_refresh
              ORDER BY julianday(observed_refresh.observed_at) DESC,
                observed_refresh.observed_precedence DESC,
                observed_refresh.observed_order DESC
              LIMIT 1
            ) AS last_provider_refresh_attempted_value
          FROM writeback_event AS current_event
          WHERE current_event.id = ?
        `,
      )
      .get(validatedInput.eventId);

    if (!isWritebackEventRefreshRow(event)) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "writeback event must exist before provider refresh",
      );
    }

    if (
      event.provider_name !== validatedInput.providerName ||
      event.provider_subject_id !== validatedInput.providerSubjectId ||
      event.target_contact_type !== "work_email"
    ) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "provider refresh must match the original writeback event identity",
      );
    }

    if (event.has_inbound_value_conflict !== 0) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "provider refresh requires an accepted writeback event",
      );
    }

    if (
      toTimestampMillis(validatedInput.refreshedAt) <
      toTimestampMillis(event.received_at)
    ) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "provider refresh must not be older than the original writeback event",
      );
    }

    if (event.is_latest_for_contact_point !== 1) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "provider refresh requires the latest writeback event for the contact point",
      );
    }

    if (
      event.last_provider_refresh_attempt_at !== null &&
      toTimestampMillis(validatedInput.refreshedAt) <=
        toTimestampMillis(event.last_provider_refresh_attempt_at)
    ) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "provider refresh must be newer than the latest provider refresh attempt",
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
      .get(event.contact_point_id, event.person_id);

    if (!isExistingWorkEmailContactPointRow(currentContactPoint)) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "provider refresh requires the original work_email contact point",
      );
    }

    const expectedCurrentContactValue =
      event.last_provider_refresh_attempted_value ?? event.provider_value;
    if (
      currentContactPoint.value !== expectedCurrentContactValue &&
      currentContactPoint.value !== validatedInput.providerValue
    ) {
      const conflict = createSyntheticWorkEmailConflictEvidence(
        event.id,
        event.correlation_id,
        "provider_refresh_conflict",
        currentContactPoint.value,
        validatedInput.providerValue,
        {
          attemptId: createSyntheticWorkEmailProviderRefreshId(
            event.id,
            validatedInput,
          ),
          attemptCorrelationId:
            createSyntheticWorkEmailProviderRefreshCorrelationId(
              event.correlation_id,
              validatedInput,
            ),
        },
      );

      insertSyntheticWorkEmailConflict(
        db,
        event.id,
        event.person_id,
        event.contact_point_id,
        event.provider_name,
        event.provider_subject_id,
        conflict,
        validatedInput.refreshedAt,
      );

      db.exec("RELEASE SAVEPOINT synthetic_work_email_provider_refresh");

      return {
        eventId: event.id,
        personId: event.person_id,
        contactPointId: event.contact_point_id,
        providerName: event.provider_name,
        providerSubjectId: event.provider_subject_id,
        eventProviderValue: event.provider_value,
        refreshedProviderValue: validatedInput.providerValue,
        correlationId: event.correlation_id,
        refreshedAt: validatedInput.refreshedAt,
        applied: false,
        mismatch: event.provider_value !== validatedInput.providerValue,
        conflict,
      };
    }

    db.prepare(
      `
        UPDATE contact_point
        SET value = ?
        WHERE id = ?
          AND person_id = ?
          AND contact_type = 'work_email'
      `,
    ).run(
      validatedInput.providerValue,
      event.contact_point_id,
      event.person_id,
    );

    const refreshedContactPoint = db
      .prepare(
        `
          SELECT id, value
          FROM contact_point
          WHERE id = ?
            AND person_id = ?
            AND contact_type = 'work_email'
        `,
      )
      .get(event.contact_point_id, event.person_id);

    if (!isRefreshedContactPointRow(refreshedContactPoint)) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "provider refresh requires the original work_email contact point",
      );
    }

    if (refreshedContactPoint.value !== validatedInput.providerValue) {
      throw new Error("contactPoint must match refreshed provider value");
    }

    db.prepare(
      `
        INSERT INTO writeback_provider_refresh (
          id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          provider_value,
          refreshed_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      createSyntheticWorkEmailProviderRefreshId(event.id, validatedInput),
      event.id,
      event.person_id,
      event.contact_point_id,
      event.provider_name,
      event.provider_subject_id,
      validatedInput.providerValue,
      validatedInput.refreshedAt,
      createSyntheticWorkEmailProviderRefreshCorrelationId(
        event.correlation_id,
        validatedInput,
      ),
    );

    db.exec("RELEASE SAVEPOINT synthetic_work_email_provider_refresh");

    return {
      eventId: event.id,
      personId: event.person_id,
      contactPointId: event.contact_point_id,
      providerName: event.provider_name,
      providerSubjectId: event.provider_subject_id,
      eventProviderValue: event.provider_value,
      refreshedProviderValue: validatedInput.providerValue,
      correlationId: event.correlation_id,
      refreshedAt: validatedInput.refreshedAt,
      applied: true,
      mismatch: event.provider_value !== validatedInput.providerValue,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackNamedSavepoint(db, "synthetic_work_email_provider_refresh");
    }

    throw error;
  }
}
