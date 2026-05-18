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

type SyntheticWorkEmailWritebackFixtureOverrides =
  Partial<SyntheticWorkEmailWritebackInput>;

const syntheticPocMarker = "synthetic_poc";
const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

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
  validateSyntheticWorkEmailWriteback(input);

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT synthetic_work_email_writeback_ingest");
    savepointStarted = true;

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
          is_primary = 1
      `,
    ).run(
      input.contactPointId,
      input.personId,
      input.providerValue,
      input.receivedAt,
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
      .get(input.personId);

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
      input.eventId,
      input.personId,
      contactPoint.id,
      input.providerName,
      input.providerSubjectId,
      input.providerValue,
      input.targetContactType,
      input.correlationId,
      input.receivedAt,
      input.pocMarker,
    );

    db.exec("RELEASE SAVEPOINT synthetic_work_email_writeback_ingest");

    return {
      eventId: input.eventId,
      personId: input.personId,
      contactPointId: contactPoint.id,
      providerName: input.providerName,
      providerSubjectId: input.providerSubjectId,
      correlationId: input.correlationId,
      applied: true,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackNamedSavepoint(db, "synthetic_work_email_writeback_ingest");
    }

    throw error;
  }
}

function validateSyntheticWorkEmailWriteback(
  input: SyntheticWorkEmailWritebackInput,
): void {
  requireNonEmpty("eventId", input.eventId);
  requireNonEmpty("personId", input.personId);
  requireNonEmpty("contactPointId", input.contactPointId);
  if (input.providerName !== "synthetic_okta") {
    throw new Error("providerName must be synthetic_okta");
  }
  requireNonEmpty("providerSubjectId", input.providerSubjectId);
  requireNonEmpty("providerValue", input.providerValue);
  if (input.providerValue.indexOf("@") <= 0) {
    throw new Error("providerValue must be a skeleton work email");
  }
  if (input.targetContactType !== "work_email") {
    throw new Error("targetContactType must be work_email");
  }
  requireNonEmpty("correlationId", input.correlationId);
  requireTimestamp("receivedAt", input.receivedAt);
  if (input.pocMarker !== syntheticPocMarker) {
    throw new Error("pocMarker must mark synthetic PoC evidence");
  }
}

function requireNonEmpty(fieldName: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function requireTimestamp(fieldName: string, value: string): void {
  requireNonEmpty(fieldName, value);
  const match = timestampPattern.exec(value);
  if (!match || !isValidIsoDateParts(match[1], match[2], match[3])) {
    throw new Error(`${fieldName} must be an ISO timestamp`);
  }
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
