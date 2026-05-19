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
  applied: true;
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
  applied: true;
  mismatch: boolean;
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
          SELECT id
          FROM contact_point
          WHERE person_id = ?
            AND contact_type = 'work_email'
        `,
      )
      .get(validatedInput.personId);

    if (
      existingContactPoint &&
      existingContactPoint.id !== validatedInput.contactPointId
    ) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "contactPointId must match existing work_email contact point",
      );
    }

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
        ON CONFLICT(person_id, contact_type) DO UPDATE SET
          value = excluded.value,
          is_primary = excluded.is_primary
      `,
    ).run(
      validatedInput.contactPointId,
      validatedInput.personId,
      validatedInput.providerValue,
      validatedInput.receivedAt,
    );

    const contactPoint = db
      .prepare(
        `
          SELECT id
          FROM contact_point
          WHERE person_id = ?
            AND contact_type = 'work_email'
        `,
      )
      .get(validatedInput.personId);

    if (!contactPoint || typeof contactPoint.id !== "string") {
      throw new Error("contactPoint must exist after work email upsert");
    }

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
      validatedInput.eventId,
      validatedInput.personId,
      contactPoint.id,
      validatedInput.providerName,
      validatedInput.providerSubjectId,
      validatedInput.providerValue,
      validatedInput.targetContactType,
      validatedInput.correlationId,
      validatedInput.receivedAt,
      validatedInput.pocMarker,
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
            NOT EXISTS (
              SELECT 1
              FROM writeback_event AS newer_event
              WHERE newer_event.person_id = current_event.person_id
                AND newer_event.contact_point_id = current_event.contact_point_id
                AND newer_event.target_contact_type = current_event.target_contact_type
                AND (
                  julianday(newer_event.received_at) > julianday(current_event.received_at)
                  OR (
                    julianday(newer_event.received_at) = julianday(current_event.received_at)
                    AND newer_event.rowid > current_event.rowid
                  )
                )
            ) AS is_latest_for_contact_point,
            (
              SELECT applied_refresh.refreshed_at
              FROM writeback_provider_refresh AS applied_refresh
              WHERE applied_refresh.writeback_event_id = current_event.id
                AND applied_refresh.person_id = current_event.person_id
                AND applied_refresh.contact_point_id = current_event.contact_point_id
                AND applied_refresh.provider_name = current_event.provider_name
                AND applied_refresh.provider_subject_id = current_event.provider_subject_id
              ORDER BY julianday(applied_refresh.refreshed_at) DESC,
                applied_refresh.rowid DESC
              LIMIT 1
            ) AS last_refreshed_at
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
      event.last_refreshed_at !== null &&
      toTimestampMillis(validatedInput.refreshedAt) <=
        toTimestampMillis(event.last_refreshed_at)
    ) {
      throw new SyntheticWorkEmailWritebackValidationError(
        "provider refresh must be newer than the latest applied provider refresh",
      );
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
  is_latest_for_contact_point: number;
  last_refreshed_at: string | null;
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
    typeof input.is_latest_for_contact_point === "number" &&
    (typeof input.last_refreshed_at === "string" ||
      input.last_refreshed_at === null)
  );
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
