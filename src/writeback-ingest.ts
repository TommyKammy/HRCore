type SqlValue = string | number | bigint | null;

export interface SqlStatement {
  get(...values: SqlValue[]): Record<string, unknown> | undefined;
  run(...values: SqlValue[]): unknown;
}

export interface SyntheticWritebackDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
}

export interface SyntheticWorkEmailWritebackInput {
  eventId: string;
  personId: string;
  contactPointId: string;
  providerName: "synthetic_okta";
  providerSubjectId: string;
  providerValue: string;
  targetContactType: "work_email";
  correlationId: string;
  receivedAt: string;
  pocMarker: "synthetic_poc";
}

export interface SyntheticWorkEmailWritebackResult {
  eventId: string;
  personId: string;
  contactPointId: string;
  providerName: "synthetic_okta";
  providerSubjectId: string;
  correlationId: string;
  applied: boolean;
  conflict?: SyntheticWorkEmailConflictEvidence;
}

export interface SyntheticWorkEmailProviderRefreshInput {
  eventId: string;
  providerName: "synthetic_okta";
  providerSubjectId: string;
  providerValue: string;
  refreshedAt: string;
}

export interface SyntheticWorkEmailProviderRefreshResult {
  eventId: string;
  personId: string;
  contactPointId: string;
  providerName: "synthetic_okta";
  providerSubjectId: string;
  eventProviderValue: string;
  refreshedProviderValue: string;
  correlationId: string;
  refreshedAt: string;
  applied: boolean;
  mismatch: boolean;
  conflict?: SyntheticWorkEmailConflictEvidence;
}

export interface SyntheticWorkEmailConflictEvidence {
  conflictId: string;
  conflictType: "inbound_value_conflict" | "provider_refresh_conflict";
  currentContactValue: string;
  attemptedProviderValue: string;
  correlationId: string;
}

type SyntheticWorkEmailWritebackFixtureOverrides =
  Partial<SyntheticWorkEmailWritebackInput>;

const syntheticPocMarker = "synthetic_poc";
const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;
const syntheticWorkEmailWritebackFields = [
  "eventId",
  "personId",
  "contactPointId",
  "providerName",
  "providerSubjectId",
  "providerValue",
  "targetContactType",
  "correlationId",
  "receivedAt",
  "pocMarker",
];
const syntheticWorkEmailProviderRefreshFields = [
  "eventId",
  "providerName",
  "providerSubjectId",
  "providerValue",
  "refreshedAt",
];

export class SyntheticWorkEmailWritebackValidationError extends Error {
  override name = "SyntheticWorkEmailWritebackValidationError";
}

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
                SELECT applied_refresh.refreshed_at AS observed_at
                FROM writeback_provider_refresh AS applied_refresh
                WHERE applied_refresh.writeback_event_id = current_event.id
                  AND applied_refresh.person_id = current_event.person_id
                  AND applied_refresh.contact_point_id = current_event.contact_point_id
                  AND applied_refresh.provider_name = current_event.provider_name
                  AND applied_refresh.provider_subject_id = current_event.provider_subject_id
                UNION ALL
                SELECT refresh_conflict.detected_at AS observed_at
                FROM writeback_work_email_conflict AS refresh_conflict
                WHERE refresh_conflict.writeback_event_id = current_event.id
                  AND refresh_conflict.person_id = current_event.person_id
                  AND refresh_conflict.contact_point_id = current_event.contact_point_id
                  AND refresh_conflict.provider_name = current_event.provider_name
                  AND refresh_conflict.provider_subject_id = current_event.provider_subject_id
                  AND refresh_conflict.conflict_type = 'provider_refresh_conflict'
              ) AS observed_refresh
              ORDER BY julianday(observed_refresh.observed_at) DESC
              LIMIT 1
            ) AS last_provider_refresh_attempt_at
            ,
            (
              SELECT applied_refresh.provider_value
              FROM writeback_provider_refresh AS applied_refresh
              WHERE applied_refresh.writeback_event_id = current_event.id
                AND applied_refresh.person_id = current_event.person_id
                AND applied_refresh.contact_point_id = current_event.contact_point_id
                AND applied_refresh.provider_name = current_event.provider_name
                AND applied_refresh.provider_subject_id = current_event.provider_subject_id
              ORDER BY julianday(applied_refresh.refreshed_at) DESC,
                applied_refresh.rowid DESC
              LIMIT 1
            ) AS last_refreshed_provider_value
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
      event.last_refreshed_provider_value ?? event.provider_value;
    if (currentContactPoint.value !== expectedCurrentContactValue) {
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

export function parseSyntheticWorkEmailWritebackInput(
  input: unknown,
): SyntheticWorkEmailWritebackInput {
  if (!isRecord(input)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "request body must be an object",
    );
  }

  const unsupportedFields = Object.keys(input).filter(
    (field) => !syntheticWorkEmailWritebackFields.includes(field),
  );
  if (unsupportedFields.length > 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      `request body contains unsupported fields: ${unsupportedFields.join(
        ", ",
      )}`,
    );
  }

  const eventId = requireNonEmpty("eventId", input.eventId);
  const personId = requireNonEmpty("personId", input.personId);
  const contactPointId = requireNonEmpty(
    "contactPointId",
    input.contactPointId,
  );
  if (input.providerName !== "synthetic_okta") {
    throw new SyntheticWorkEmailWritebackValidationError(
      "providerName must be synthetic_okta",
    );
  }
  const providerSubjectId = requireNonEmpty(
    "providerSubjectId",
    input.providerSubjectId,
  );
  const providerValue = requireNonEmpty("providerValue", input.providerValue);
  if (providerValue.indexOf("@") <= 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "providerValue must be a skeleton work email",
    );
  }
  if (input.targetContactType !== "work_email") {
    throw new SyntheticWorkEmailWritebackValidationError(
      "targetContactType must be work_email",
    );
  }
  const correlationId = requireNonEmpty("correlationId", input.correlationId);
  const receivedAt = requireTimestamp("receivedAt", input.receivedAt);
  if (input.pocMarker !== syntheticPocMarker) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "pocMarker must mark synthetic PoC evidence",
    );
  }

  return {
    eventId,
    personId,
    contactPointId,
    providerName: input.providerName,
    providerSubjectId,
    providerValue,
    targetContactType: input.targetContactType,
    correlationId,
    receivedAt,
    pocMarker: input.pocMarker,
  };
}

function insertSyntheticWorkEmailWritebackEvent(
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

function insertSyntheticWorkEmailConflict(
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

function getLatestSyntheticProviderValueForContactPoint(
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
        SELECT provider_value
        FROM writeback_provider_refresh
        WHERE writeback_event_id = ?
          AND person_id = ?
          AND contact_point_id = ?
        ORDER BY julianday(refreshed_at) DESC,
          rowid DESC
        LIMIT 1
      `,
    )
    .get(latestEvent.id, personId, contactPointId);

  return isLatestProviderRefreshValueRow(latestRefresh)
    ? latestRefresh.provider_value
    : latestEvent.provider_value;
}

export function parseSyntheticWorkEmailProviderRefreshInput(
  input: unknown,
): SyntheticWorkEmailProviderRefreshInput {
  if (!isRecord(input)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "provider refresh input must be an object",
    );
  }

  const unsupportedFields = Object.keys(input).filter(
    (field) => !syntheticWorkEmailProviderRefreshFields.includes(field),
  );
  if (unsupportedFields.length > 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      `provider refresh input contains unsupported fields: ${unsupportedFields.join(
        ", ",
      )}`,
    );
  }

  const eventId = requireNonEmpty("eventId", input.eventId);
  if (input.providerName !== "synthetic_okta") {
    throw new SyntheticWorkEmailWritebackValidationError(
      "providerName must be synthetic_okta",
    );
  }
  const providerSubjectId = requireNonEmpty(
    "providerSubjectId",
    input.providerSubjectId,
  );
  const providerValue = requireNonEmpty("providerValue", input.providerValue);
  if (providerValue.indexOf("@") <= 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "providerValue must be a skeleton work email",
    );
  }
  const refreshedAt = requireTimestamp("refreshedAt", input.refreshedAt);

  return {
    eventId,
    providerName: input.providerName,
    providerSubjectId,
    providerValue,
    refreshedAt,
  };
}

function isWritebackEventRefreshRow(input: unknown): input is {
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
  last_refreshed_provider_value: string | null;
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
    (typeof input.last_refreshed_provider_value === "string" ||
      input.last_refreshed_provider_value === null)
  );
}

function isExistingWorkEmailContactPointRow(input: unknown): input is {
  id: string;
  value: string;
} {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.value === "string"
  );
}

function isLatestProviderValueEventRow(input: unknown): input is {
  id: string;
  provider_value: string;
} {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.provider_value === "string"
  );
}

function isLatestProviderRefreshValueRow(input: unknown): input is {
  provider_value: string;
} {
  return isRecord(input) && typeof input.provider_value === "string";
}

function isRefreshedContactPointRow(input: unknown): input is {
  id: string;
  value: string;
} {
  return (
    isRecord(input) &&
    typeof input.id === "string" &&
    typeof input.value === "string"
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function requireNonEmpty(fieldName: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function requireTimestamp(fieldName: string, value: unknown): string {
  const timestamp = requireNonEmpty(fieldName, value);
  const match = timestampPattern.exec(timestamp);
  if (!match || !isValidIsoDateParts(match[1], match[2], match[3])) {
    throw new SyntheticWorkEmailWritebackValidationError(
      `${fieldName} must be an ISO timestamp`,
    );
  }

  return timestamp;
}

function toTimestampMillis(timestamp: string): number {
  const millis = Date.parse(timestamp);
  if (!Number.isFinite(millis)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "timestamp must be parseable before provider refresh",
    );
  }

  return millis;
}

function createSyntheticWorkEmailProviderRefreshId(
  eventId: string,
  input: SyntheticWorkEmailProviderRefreshInput,
): string {
  return [
    "synthetic-work-email-provider-refresh",
    encodeURIComponent(eventId),
    encodeURIComponent(input.refreshedAt),
  ].join(":");
}

function createSyntheticWorkEmailProviderRefreshCorrelationId(
  eventCorrelationId: string,
  input: SyntheticWorkEmailProviderRefreshInput,
): string {
  return [
    eventCorrelationId,
    "provider_refresh",
    encodeURIComponent(input.refreshedAt),
  ].join(":");
}

function createSyntheticWorkEmailConflictEvidence(
  eventId: string,
  eventCorrelationId: string,
  conflictType: SyntheticWorkEmailConflictEvidence["conflictType"],
  currentContactValue: string,
  attemptedProviderValue: string,
  attempt?: {
    attemptId: string;
    attemptCorrelationId: string;
  },
): SyntheticWorkEmailConflictEvidence {
  const conflictIdParts = ["synthetic-work-email-conflict", eventId];
  const correlationIdParts = [
    attempt ? attempt.attemptCorrelationId : eventCorrelationId,
  ];
  if (attempt) {
    conflictIdParts.push(attempt.attemptId);
  }
  conflictIdParts.push(conflictType);
  correlationIdParts.push("conflict", conflictType);

  return {
    conflictId: conflictIdParts.join(":"),
    conflictType,
    currentContactValue,
    attemptedProviderValue,
    correlationId: correlationIdParts.join(":"),
  };
}

function isValidIsoDateParts(
  yearText: string,
  monthText: string,
  dayText: string,
): boolean {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function rollbackNamedSavepoint(
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
