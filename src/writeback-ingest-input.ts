import type {
  SyntheticWorkEmailWritebackFixtureOverrides,
  SyntheticWorkEmailWritebackInput,
  SyntheticWorkEmailWritebackResult,
  SyntheticWritebackDatabase,
} from "./writeback-ingest-types.js";
import { createSyntheticWorkEmailConflictEvidence } from "./writeback-ingest-conflict-evidence.js";
import { isExistingWorkEmailContactPointRow } from "./writeback-ingest-row-guards.js";
import {
  getLatestAcceptedSyntheticWorkEmailWritebackEvent,
  getLatestSyntheticProviderValueForContactPoint,
  insertSyntheticWorkEmailConflict,
  insertSyntheticWorkEmailWritebackEvent,
  rollbackNamedSavepoint,
} from "./writeback-ingest-sql.js";
import {
  parseSyntheticWorkEmailWritebackInput,
  SyntheticWorkEmailWritebackValidationError,
  syntheticPocMarker,
  toTimestampMillis,
} from "./writeback-ingest-validation.js";

export function createSyntheticWorkEmailWritebackFixture(
  overrides: SyntheticWorkEmailWritebackFixtureOverrides = {},
): SyntheticWorkEmailWritebackInput {
  return {
    eventId: "writeback-event-work-email-001",
    personId: "person-writeback-001",
    contactPointId: "contact-point-writeback-001",
    providerName: "synthetic_okta",
    providerSubjectId: "synthetic-okta-user-001",
    providerValue: "confirmed.writeback@example.invalid",
    targetContactType: "work_email",
    correlationId: "correlation-writeback-work-email-001",
    receivedAt: "2026-05-18T01:00:00Z",
    pocMarker: syntheticPocMarker,
    ...overrides,
  };
}

export function ingestSyntheticWorkEmailWriteback(
  db: SyntheticWritebackDatabase,
  input: SyntheticWorkEmailWritebackInput,
): SyntheticWorkEmailWritebackResult {
  const validatedInput = parseSyntheticWorkEmailWritebackInput(input);

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT synthetic_work_email_writeback_ingest");
    savepointStarted = true;

    const existingContactPoint = db
      .prepare(
        `
          SELECT id, value
          FROM contact_point
          WHERE person_id = ?
            AND contact_type = 'work_email'
        `,
      )
      .get(validatedInput.personId);

    if (
      isExistingWorkEmailContactPointRow(existingContactPoint) &&
      existingContactPoint.id !== validatedInput.contactPointId
    ) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "contactPointId must match existing work_email contact point",
      );
    }

    if (!existingContactPoint) {
      db.prepare(
        `
          INSERT INTO contact_point (
            id,
            person_id,
            contact_type,
            value,
            is_primary,
            created_at
          )
          VALUES (?, ?, 'work_email', ?, 1, ?)
        `,
      ).run(
        validatedInput.contactPointId,
        validatedInput.personId,
        validatedInput.providerValue,
        validatedInput.receivedAt,
      );
    } else if (!isExistingWorkEmailContactPointRow(existingContactPoint)) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "existing work_email contact point must expose id and value",
      );
    }

    const contactPoint = db
      .prepare(
        `
          SELECT id, value
          FROM contact_point
          WHERE person_id = ?
            AND contact_type = 'work_email'
        `,
      )
      .get(validatedInput.personId);

    if (!isExistingWorkEmailContactPointRow(contactPoint)) {
      throw new Error("contactPoint must exist after work email upsert");
    }

    const expectedCurrentContactValue =
      getLatestSyntheticProviderValueForContactPoint(
        db,
        validatedInput.personId,
        contactPoint.id,
      );
    const latestAcceptedEvent =
      getLatestAcceptedSyntheticWorkEmailWritebackEvent(
        db,
        validatedInput.personId,
        contactPoint.id,
      );
    if (
      latestAcceptedEvent &&
      toTimestampMillis(validatedInput.receivedAt) <
        toTimestampMillis(latestAcceptedEvent.received_at)
    ) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "writeback event must not be older than the latest accepted event for the contact point",
      );
    }

    insertSyntheticWorkEmailWritebackEvent(db, validatedInput, contactPoint.id);
    if (
      contactPoint.value !== validatedInput.providerValue &&
      contactPoint.value !== expectedCurrentContactValue
    ) {
      const conflict = createSyntheticWorkEmailConflictEvidence(
        validatedInput.eventId,
        validatedInput.correlationId,
        "inbound_value_conflict",
        contactPoint.value,
        validatedInput.providerValue,
      );

      insertSyntheticWorkEmailConflict(
        db,
        validatedInput.eventId,
        validatedInput.personId,
        contactPoint.id,
        validatedInput.providerName,
        validatedInput.providerSubjectId,
        conflict,
        validatedInput.receivedAt,
      );

      db.exec("RELEASE SAVEPOINT synthetic_work_email_writeback_ingest");

      return {
        eventId: validatedInput.eventId,
        personId: validatedInput.personId,
        contactPointId: contactPoint.id,
        providerName: validatedInput.providerName,
        providerSubjectId: validatedInput.providerSubjectId,
        correlationId: validatedInput.correlationId,
        applied: false,
        conflict,
      };
    }

    db.prepare(
      `
        UPDATE contact_point
        SET value = ?,
          is_primary = 1
        WHERE id = ?
          AND person_id = ?
          AND contact_type = 'work_email'
      `,
    ).run(
      validatedInput.providerValue,
      contactPoint.id,
      validatedInput.personId,
    );

    db.exec("RELEASE SAVEPOINT synthetic_work_email_writeback_ingest");

    return {
      eventId: validatedInput.eventId,
      personId: validatedInput.personId,
      contactPointId: contactPoint.id,
      providerName: validatedInput.providerName,
      providerSubjectId: validatedInput.providerSubjectId,
      correlationId: validatedInput.correlationId,
      applied: true,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackNamedSavepoint(db, "synthetic_work_email_writeback_ingest");
    }

    throw error;
  }
}
