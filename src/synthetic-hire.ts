type SqlValue = string | number | bigint | null;

export interface SqlStatement {
  run(...values: SqlValue[]): unknown;
  get(...values: SqlValue[]): unknown;
}

export interface SyntheticHireDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
}

export type SyntheticEmploymentStatus = "active" | "inactive" | "terminated";

export interface SyntheticHirePersonInput {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface SyntheticHireEmploymentInput {
  id: string;
  personId: string;
  employmentCode: string;
  statusCode: SyntheticEmploymentStatus;
  startDate: string;
  endDate?: string | null;
}

export interface SyntheticHireAssignmentInput {
  id: string;
  personId: string;
  employmentId: string;
  assignmentCode: string;
  organizationCode: string;
  positionCode?: string | null;
  startDate: string;
  endDate?: string | null;
}

export interface SyntheticHireContactPointInput {
  id: string;
  personId: string;
  contactType: "work_email";
  value: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface SyntheticHireAuditInput {
  actorId: string;
  correlationId: string;
  occurredAt: string;
  pocMarker: "synthetic_poc";
}

export interface SyntheticHireInput {
  person: SyntheticHirePersonInput;
  employment: SyntheticHireEmploymentInput;
  assignment: SyntheticHireAssignmentInput;
  contactPoint?: SyntheticHireContactPointInput;
  audit: SyntheticHireAuditInput;
}

export interface SyntheticHireTransactionRequestInput {
  id: string;
  personId: string;
  requestType: "hire";
  statusCode: "submitted";
  requestedAt: string;
  correlationId: string;
}

export interface SyntheticHireRequestInput {
  person: SyntheticHirePersonInput;
  transactionRequest: SyntheticHireTransactionRequestInput;
}

export interface SyntheticHireLifecycleEventInput {
  id: string;
  eventType: "hire";
  effectiveDate: string;
  occurredAt: string;
}

export interface ApplySyntheticHireRequestInput {
  request: SyntheticHireRequestInput;
  hire: SyntheticHireInput;
  lifecycleEvent: SyntheticHireLifecycleEventInput;
}

export interface SyntheticHirePersistenceResult {
  personId: string;
  employmentId: string;
  assignmentId: string;
  contactPointId?: string;
}

export interface SyntheticHireRequestPersistenceResult {
  personId: string;
  transactionRequestId: string;
  statusCode: "submitted";
  correlationId: string;
}

export interface AppliedSyntheticHireRequestResult {
  transactionRequestId: string;
  lifecycleEventId: string;
  personId: string;
  statusCode: "completed";
  correlationId: string;
}

type SyntheticHireFixtureOverrides = {
  person?: Partial<SyntheticHirePersonInput>;
  employment?: Partial<SyntheticHireEmploymentInput>;
  assignment?: Partial<SyntheticHireAssignmentInput>;
  contactPoint?: Partial<SyntheticHireContactPointInput> | null;
};

type SyntheticHireRequestFixtureOverrides = {
  person?: Partial<SyntheticHirePersonInput>;
  transactionRequest?: Partial<SyntheticHireTransactionRequestInput>;
};

const allowedEmploymentStatuses = new Set<SyntheticEmploymentStatus>([
  "active",
  "inactive",
  "terminated",
]);

const syntheticAuditActorId = "synthetic-poc-actor";
const syntheticAuditPocMarker = "synthetic_poc";
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

export function createSyntheticHireFixture(
  overrides: SyntheticHireFixtureOverrides = {},
): SyntheticHireInput {
  const person: SyntheticHirePersonInput = {
    id: "person-syn-hire-001",
    displayName: "Synthetic Hire One",
    createdAt: "2026-05-18T00:00:00Z",
    ...overrides.person,
  };
  const employment: SyntheticHireEmploymentInput = {
    id: "employment-syn-hire-001",
    personId: person.id,
    employmentCode: "EMP-SYN-HIRE-001",
    statusCode: "active",
    startDate: "2026-05-18",
    endDate: null,
    ...overrides.employment,
  };
  const assignment: SyntheticHireAssignmentInput = {
    id: "assignment-syn-hire-001",
    personId: person.id,
    employmentId: employment.id,
    assignmentCode: "ASN-SYN-HIRE-001",
    organizationCode: "ORG-SYN-001",
    positionCode: "POS-SYN-001",
    startDate: "2026-05-18",
    endDate: null,
    ...overrides.assignment,
  };
  const contactPoint =
    overrides.contactPoint === null
      ? undefined
      : {
          id: "contact-point-syn-hire-001",
          personId: person.id,
          contactType: "work_email" as const,
          value: "synthetic.hire.001@example.invalid",
          isPrimary: true,
          createdAt: "2026-05-18T00:00:00Z",
          ...overrides.contactPoint,
        };

  return {
    person,
    employment,
    assignment,
    audit: {
      actorId: syntheticAuditActorId,
      correlationId: "correlation-syn-hire-direct-001",
      occurredAt: person.createdAt,
      pocMarker: syntheticAuditPocMarker,
    },
    ...(contactPoint ? { contactPoint } : {}),
  };
}

export function createSyntheticHireRequestFixture(
  overrides: SyntheticHireRequestFixtureOverrides = {},
): SyntheticHireRequestInput {
  const person: SyntheticHirePersonInput = {
    id: "person-syn-hire-001",
    displayName: "Synthetic Hire One",
    createdAt: "2026-05-18T00:00:00Z",
    ...overrides.person,
  };
  const transactionRequest: SyntheticHireTransactionRequestInput = {
    id: "transaction-request-syn-hire-001",
    personId: person.id,
    requestType: "hire",
    statusCode: "submitted",
    requestedAt: "2026-05-18T00:00:00Z",
    correlationId: "correlation-syn-hire-001",
    ...overrides.transactionRequest,
  };

  return {
    person,
    transactionRequest,
  };
}

export function saveSyntheticHireRequest(
  db: SyntheticHireDatabase,
  input: SyntheticHireRequestInput,
): SyntheticHireRequestPersistenceResult {
  validateSyntheticHireRequest(input);

  const existingRequest = readSyntheticHireRequest(db, input);
  if (existingRequest) {
    if (matchesSyntheticHireRequestRetry(existingRequest, input)) {
      return {
        personId: input.person.id,
        transactionRequestId: existingRequest.transaction_request_id,
        statusCode: input.transactionRequest.statusCode,
        correlationId: existingRequest.correlation_id,
      };
    }

    throw new Error(
      "synthetic hire request retry conflicts with the existing request",
    );
  }

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT synthetic_hire_request_persistence");
    savepointStarted = true;

    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES (?, ?, ?)
      `,
    ).run(input.person.id, input.person.displayName, input.person.createdAt);

    db.prepare(
      `
        INSERT INTO transaction_request (
          id,
          person_id,
          request_type,
          status_code,
          requested_at,
          correlation_id
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.transactionRequest.id,
      input.transactionRequest.personId,
      input.transactionRequest.requestType,
      input.transactionRequest.statusCode,
      input.transactionRequest.requestedAt,
      input.transactionRequest.correlationId,
    );

    insertSyntheticAuditEvent(db, {
      id: `audit-event-${input.transactionRequest.id}-submitted`,
      actorId: syntheticAuditActorId,
      action: "poc.synthetic_hire.request_submitted",
      subjectTable: "transaction_request",
      subjectId: input.transactionRequest.id,
      occurredAt: input.transactionRequest.requestedAt,
      correlationId: input.transactionRequest.correlationId,
      pocMarker: syntheticAuditPocMarker,
    });

    db.exec("RELEASE SAVEPOINT synthetic_hire_request_persistence");

    return {
      personId: input.person.id,
      transactionRequestId: input.transactionRequest.id,
      statusCode: input.transactionRequest.statusCode,
      correlationId: input.transactionRequest.correlationId,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackNamedSavepoint(db, "synthetic_hire_request_persistence");
      const existingRequest = readSyntheticHireRequest(db, input);
      if (
        existingRequest &&
        matchesSyntheticHireRequestRetry(existingRequest, input)
      ) {
        return {
          personId: input.person.id,
          transactionRequestId: existingRequest.transaction_request_id,
          statusCode: input.transactionRequest.statusCode,
          correlationId: existingRequest.correlation_id,
        };
      }
    }

    throw error;
  }
}

export function saveSyntheticHire(
  db: SyntheticHireDatabase,
  input: SyntheticHireInput,
): SyntheticHirePersistenceResult {
  validateSyntheticHire(input);

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT synthetic_hire_persistence");
    savepointStarted = true;

    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES (?, ?, ?)
      `,
    ).run(input.person.id, input.person.displayName, input.person.createdAt);

    db.prepare(
      `
        INSERT INTO employment (
          id,
          person_id,
          employment_code,
          status_code,
          start_date,
          end_date
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.employment.id,
      input.employment.personId,
      input.employment.employmentCode,
      input.employment.statusCode,
      input.employment.startDate,
      input.employment.endDate ?? null,
    );

    db.prepare(
      `
        INSERT INTO assignment (
          id,
          person_id,
          employment_id,
          assignment_code,
          organization_code,
          position_code,
          start_date,
          end_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.assignment.id,
      input.assignment.personId,
      input.assignment.employmentId,
      input.assignment.assignmentCode,
      input.assignment.organizationCode,
      input.assignment.positionCode ?? null,
      input.assignment.startDate,
      input.assignment.endDate ?? null,
    );

    if (input.contactPoint) {
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
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).run(
        input.contactPoint.id,
        input.contactPoint.personId,
        input.contactPoint.contactType,
        input.contactPoint.value,
        toSqliteBoolean("contactPoint.isPrimary", input.contactPoint.isPrimary),
        input.contactPoint.createdAt,
      );
    }

    insertSyntheticAuditEvent(db, {
      id: `audit-event-${input.person.id}-persisted`,
      actorId: input.audit.actorId,
      action: "poc.synthetic_hire.persisted",
      subjectTable: "person",
      subjectId: input.person.id,
      occurredAt: input.audit.occurredAt,
      correlationId: input.audit.correlationId,
      pocMarker: input.audit.pocMarker,
    });

    db.exec("RELEASE SAVEPOINT synthetic_hire_persistence");

    return {
      personId: input.person.id,
      employmentId: input.employment.id,
      assignmentId: input.assignment.id,
      ...(input.contactPoint ? { contactPointId: input.contactPoint.id } : {}),
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackSavepoint(db);
    }

    throw error;
  }
}

export function applySyntheticHireRequest(
  db: SyntheticHireDatabase,
  input: ApplySyntheticHireRequestInput,
): AppliedSyntheticHireRequestResult {
  validateApplySyntheticHireRequest(input);

  const existingApply = readCompletedSyntheticHireApply(db, input);
  if (existingApply) {
    const retryResult = buildCompletedSyntheticHireApplyRetryResult(
      existingApply,
      input,
    );
    if (retryResult) {
      return retryResult;
    }

    throw new Error(
      "synthetic hire apply retry conflicts with the completed request",
    );
  }

  const submittedRequest = readSubmittedSyntheticHireRequestForApply(db, input);
  if (!submittedRequest) {
    const retryApply = readCompletedSyntheticHireApply(db, input);
    if (retryApply) {
      const retryResult = buildCompletedSyntheticHireApplyRetryResult(
        retryApply,
        input,
      );
      if (retryResult) {
        return retryResult;
      }
    }

    throw new Error("synthetic hire apply requires a submitted hire request");
  }
  const submittedCorrelationId = requirePersistedSyntheticHireCorrelation(
    submittedRequest.correlation_id,
  );

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT synthetic_hire_request_apply");
    savepointStarted = true;

    if (input.hire.contactPoint) {
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
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).run(
        input.hire.contactPoint.id,
        input.hire.contactPoint.personId,
        input.hire.contactPoint.contactType,
        input.hire.contactPoint.value,
        toSqliteBoolean(
          "contactPoint.isPrimary",
          input.hire.contactPoint.isPrimary,
        ),
        input.hire.contactPoint.createdAt,
      );
    }

    // Fail closed on missing or non-hire requests without relying on adapter row-count metadata.
    db.prepare(
      `
        INSERT INTO lifecycle_event (
          id,
          person_id,
          transaction_request_id,
          contact_point_id,
          event_type,
          effective_date,
          occurred_at
        )
        VALUES (
          ?,
          (
            SELECT person_id
            FROM transaction_request
            WHERE id = ?
              AND person_id = ?
              AND request_type = 'hire'
              AND status_code = 'submitted'
          ),
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `,
    ).run(
      input.lifecycleEvent.id,
      input.request.transactionRequest.id,
      input.request.person.id,
      input.request.transactionRequest.id,
      input.hire.contactPoint?.id ?? null,
      input.lifecycleEvent.eventType,
      input.lifecycleEvent.effectiveDate,
      input.lifecycleEvent.occurredAt,
    );

    db.prepare(
      `
        UPDATE transaction_request
        SET status_code = 'completed'
        WHERE id = ?
          AND person_id = ?
          AND request_type = 'hire'
          AND status_code = 'submitted'
      `,
    ).run(input.request.transactionRequest.id, input.request.person.id);

    db.prepare(
      `
        INSERT INTO employment (
          id,
          person_id,
          employment_code,
          status_code,
          start_date,
          end_date
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.hire.employment.id,
      input.hire.employment.personId,
      input.hire.employment.employmentCode,
      input.hire.employment.statusCode,
      input.hire.employment.startDate,
      input.hire.employment.endDate ?? null,
    );

    db.prepare(
      `
        INSERT INTO assignment (
          id,
          person_id,
          employment_id,
          assignment_code,
          organization_code,
          position_code,
          start_date,
          end_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.hire.assignment.id,
      input.hire.assignment.personId,
      input.hire.assignment.employmentId,
      input.hire.assignment.assignmentCode,
      input.hire.assignment.organizationCode,
      input.hire.assignment.positionCode ?? null,
      input.hire.assignment.startDate,
      input.hire.assignment.endDate ?? null,
    );

    insertSyntheticLifecycleAppliedAuditEvent(db, {
      id: `audit-event-${input.lifecycleEvent.id}-applied`,
      subjectId: input.lifecycleEvent.id,
      occurredAt: input.lifecycleEvent.occurredAt,
      transactionRequestId: input.request.transactionRequest.id,
      personId: input.request.person.id,
    });

    db.exec("RELEASE SAVEPOINT synthetic_hire_request_apply");

    return {
      transactionRequestId: input.request.transactionRequest.id,
      lifecycleEventId: input.lifecycleEvent.id,
      personId: input.request.person.id,
      statusCode: "completed",
      correlationId: submittedCorrelationId,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackNamedSavepoint(db, "synthetic_hire_request_apply");
      const existingApply = readCompletedSyntheticHireApply(db, input);
      if (existingApply) {
        const retryResult = buildCompletedSyntheticHireApplyRetryResult(
          existingApply,
          input,
        );
        if (retryResult) {
          return retryResult;
        }
      }
    }

    throw error;
  }
}

type AuditSubjectTable = "person" | "transaction_request" | "lifecycle_event";

type SyntheticAuditEventInput = {
  id: string;
  actorId: string;
  action: string;
  subjectTable: AuditSubjectTable;
  subjectId: string;
  occurredAt: string;
  correlationId: string;
  pocMarker: "synthetic_poc";
};

type SyntheticLifecycleAppliedAuditEventInput = {
  id: string;
  subjectId: string;
  occurredAt: string;
  transactionRequestId: string;
  personId: string;
};

type ExistingSyntheticHireRequestRow = {
  transaction_request_id: string;
  person_id: string;
  display_name: string;
  created_at: string;
  request_type: string;
  status_code: string;
  requested_at: string;
  correlation_id: string;
};

type ExistingSubmittedSyntheticHireApplyRequestRow = {
  correlation_id: string | null;
};

type ExistingCompletedSyntheticHireApplyRow = {
  transaction_status_code: string;
  request_type: string;
  correlation_id: string | null;
  person_id: string;
  lifecycle_event_id: string;
  lifecycle_event_type: string;
  lifecycle_contact_point_id: string | null;
  effective_date: string;
  lifecycle_occurred_at: string;
  employment_id: string;
  employment_code: string;
  employment_status_code: string;
  employment_start_date: string;
  employment_end_date: string | null;
  assignment_id: string;
  assignment_code: string;
  organization_code: string;
  position_code: string | null;
  assignment_start_date: string;
  assignment_end_date: string | null;
  contact_point_id: string | null;
  contact_type: string | null;
  contact_created_at: string | null;
};

function readSyntheticHireRequest(
  db: SyntheticHireDatabase,
  input: SyntheticHireRequestInput,
): ExistingSyntheticHireRequestRow | undefined {
  const statement = db.prepare(
    `
      SELECT
        person.id AS person_id,
        transaction_request.id AS transaction_request_id,
        person.display_name,
        person.created_at,
        transaction_request.request_type,
        transaction_request.status_code,
        transaction_request.requested_at,
        transaction_request.correlation_id
      FROM transaction_request
      JOIN person ON person.id = transaction_request.person_id
      WHERE transaction_request.id = ?
         OR transaction_request.correlation_id = ?
      ORDER BY
        CASE WHEN transaction_request.id = ? THEN 0 ELSE 1 END,
        transaction_request.id
      LIMIT 1
    `,
  );

  return statement.get(
    input.transactionRequest.id,
    input.transactionRequest.correlationId,
    input.transactionRequest.id,
  ) as ExistingSyntheticHireRequestRow | undefined;
}

function matchesSyntheticHireRequestRetry(
  existing: ExistingSyntheticHireRequestRow,
  input: SyntheticHireRequestInput,
): boolean {
  const requestAlreadyAccepted =
    existing.status_code === input.transactionRequest.statusCode ||
    existing.status_code === "completed";

  return (
    requestAlreadyAccepted &&
    existing.person_id === input.person.id &&
    existing.display_name === input.person.displayName &&
    existing.created_at === input.person.createdAt &&
    existing.request_type === input.transactionRequest.requestType &&
    existing.requested_at === input.transactionRequest.requestedAt &&
    existing.correlation_id === input.transactionRequest.correlationId
  );
}

function readSubmittedSyntheticHireRequestForApply(
  db: SyntheticHireDatabase,
  input: ApplySyntheticHireRequestInput,
): ExistingSubmittedSyntheticHireApplyRequestRow | undefined {
  const statement = db.prepare(
    `
      SELECT
        correlation_id
      FROM transaction_request
      WHERE id = ?
        AND person_id = ?
        AND request_type = 'hire'
        AND status_code = 'submitted'
    `,
  );

  return statement.get(
    input.request.transactionRequest.id,
    input.request.person.id,
  ) as ExistingSubmittedSyntheticHireApplyRequestRow | undefined;
}

function readCompletedSyntheticHireApply(
  db: SyntheticHireDatabase,
  input: ApplySyntheticHireRequestInput,
): ExistingCompletedSyntheticHireApplyRow | undefined {
  const statement = db.prepare(
    `
      SELECT
        transaction_request.status_code AS transaction_status_code,
        transaction_request.request_type,
        transaction_request.correlation_id,
        person.id AS person_id,
        lifecycle_event.id AS lifecycle_event_id,
        lifecycle_event.event_type AS lifecycle_event_type,
        lifecycle_event.contact_point_id AS lifecycle_contact_point_id,
        lifecycle_event.effective_date,
        lifecycle_event.occurred_at AS lifecycle_occurred_at,
        employment.id AS employment_id,
        employment.employment_code,
        employment.status_code AS employment_status_code,
        employment.start_date AS employment_start_date,
        employment.end_date AS employment_end_date,
        assignment.id AS assignment_id,
        assignment.assignment_code,
        assignment.organization_code,
        assignment.position_code,
        assignment.start_date AS assignment_start_date,
        assignment.end_date AS assignment_end_date,
        contact_point.id AS contact_point_id,
        contact_point.contact_type,
        contact_point.created_at AS contact_created_at
      FROM transaction_request
      JOIN person
        ON person.id = transaction_request.person_id
      LEFT JOIN lifecycle_event
        ON lifecycle_event.transaction_request_id = transaction_request.id
       AND lifecycle_event.person_id = transaction_request.person_id
      LEFT JOIN employment
        ON employment.id = ?
       AND employment.person_id = transaction_request.person_id
      LEFT JOIN assignment
        ON assignment.id = ?
       AND assignment.person_id = transaction_request.person_id
       AND assignment.employment_id = employment.id
      LEFT JOIN contact_point
        ON contact_point.id = ?
       AND contact_point.person_id = transaction_request.person_id
       AND contact_point.contact_type = 'work_email'
      WHERE transaction_request.id = ?
        AND transaction_request.person_id = ?
        AND transaction_request.status_code = 'completed'
    `,
  );

  return statement.get(
    input.hire.employment.id,
    input.hire.assignment.id,
    input.hire.contactPoint?.id ?? null,
    input.request.transactionRequest.id,
    input.request.person.id,
  ) as ExistingCompletedSyntheticHireApplyRow | undefined;
}

function buildCompletedSyntheticHireApplyRetryResult(
  existing: ExistingCompletedSyntheticHireApplyRow,
  input: ApplySyntheticHireRequestInput,
): AppliedSyntheticHireRequestResult | undefined {
  if (!matchesCompletedSyntheticHireApplyRetry(existing, input)) {
    return undefined;
  }

  return {
    transactionRequestId: input.request.transactionRequest.id,
    lifecycleEventId: input.lifecycleEvent.id,
    personId: input.request.person.id,
    statusCode: "completed",
    correlationId: requirePersistedSyntheticHireCorrelation(
      existing.correlation_id,
    ),
  };
}

function matchesCompletedSyntheticHireApplyRetry(
  existing: ExistingCompletedSyntheticHireApplyRow,
  input: ApplySyntheticHireRequestInput,
): boolean {
  if (
    existing.transaction_status_code !== "completed" ||
    existing.request_type !== input.request.transactionRequest.requestType ||
    existing.person_id !== input.request.person.id ||
    existing.lifecycle_event_id !== input.lifecycleEvent.id ||
    existing.lifecycle_event_type !== input.lifecycleEvent.eventType ||
    existing.effective_date !== input.lifecycleEvent.effectiveDate ||
    existing.lifecycle_occurred_at !== input.lifecycleEvent.occurredAt ||
    existing.employment_id !== input.hire.employment.id ||
    existing.employment_code !== input.hire.employment.employmentCode ||
    existing.employment_status_code !== input.hire.employment.statusCode ||
    existing.employment_start_date !== input.hire.employment.startDate ||
    existing.employment_end_date !== (input.hire.employment.endDate ?? null) ||
    existing.assignment_id !== input.hire.assignment.id ||
    existing.assignment_code !== input.hire.assignment.assignmentCode ||
    existing.organization_code !== input.hire.assignment.organizationCode ||
    existing.position_code !== (input.hire.assignment.positionCode ?? null) ||
    existing.assignment_start_date !== input.hire.assignment.startDate ||
    existing.assignment_end_date !== (input.hire.assignment.endDate ?? null)
  ) {
    return false;
  }

  if (!input.hire.contactPoint) {
    return existing.lifecycle_contact_point_id === null;
  }

  return (
    existing.lifecycle_contact_point_id === input.hire.contactPoint.id &&
    existing.contact_point_id === input.hire.contactPoint.id &&
    existing.contact_type === input.hire.contactPoint.contactType &&
    existing.contact_created_at === input.hire.contactPoint.createdAt
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requirePersistedSyntheticHireCorrelation(
  value: string | null | undefined,
): string {
  if (!isNonEmptyString(value)) {
    throw new Error(
      "synthetic hire apply requires a persisted request correlation",
    );
  }

  return value;
}

function insertSyntheticAuditEvent(
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

function insertSyntheticLifecycleAppliedAuditEvent(
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

function rollbackSavepoint(db: SyntheticHireDatabase): void {
  rollbackNamedSavepoint(db, "synthetic_hire_persistence");
}

function rollbackNamedSavepoint(
  db: SyntheticHireDatabase,
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

function validateSyntheticHireRequest(input: SyntheticHireRequestInput): void {
  validatePerson(input.person);
  validateTransactionRequest(input.transactionRequest);

  if (input.transactionRequest.personId !== input.person.id) {
    throw new Error("transactionRequest.personId must match person.id");
  }
}

function validateSyntheticHire(input: SyntheticHireInput): void {
  validateSyntheticHireRecords(input);
  validateAudit(input.audit);
}

function validateSyntheticHireRecords(input: SyntheticHireInput): void {
  validatePerson(input.person);
  validateEmployment(input.employment);
  validateAssignment(input.assignment);

  if (input.contactPoint) {
    validateContactPoint(input.contactPoint);
  }

  if (input.employment.personId !== input.person.id) {
    throw new Error("employment.personId must match person.id");
  }
  if (input.assignment.personId !== input.person.id) {
    throw new Error("assignment.personId must match person.id");
  }
  if (input.assignment.employmentId !== input.employment.id) {
    throw new Error("assignment.employmentId must match employment.id");
  }
  if (input.contactPoint && input.contactPoint.personId !== input.person.id) {
    throw new Error("contactPoint.personId must match person.id");
  }
}

function validateApplySyntheticHireRequest(
  input: ApplySyntheticHireRequestInput,
): void {
  validateSyntheticHireRequest(input.request);
  validateSyntheticHireRecords(input.hire);
  validateLifecycleEvent(input.lifecycleEvent);

  if (input.hire.person.id !== input.request.person.id) {
    throw new Error("hire.person.id must match request.person.id");
  }
  if (input.lifecycleEvent.eventType !== "hire") {
    throw new Error("lifecycleEvent.eventType must be hire");
  }
}

function validateTransactionRequest(
  transactionRequest: SyntheticHireTransactionRequestInput,
): void {
  requireNonEmpty("transactionRequest.id", transactionRequest.id);
  requireNonEmpty("transactionRequest.personId", transactionRequest.personId);
  if (transactionRequest.requestType !== "hire") {
    throw new Error("transactionRequest.requestType must be hire");
  }
  // This PoC only models the explicit submitted -> completed apply path.
  if (transactionRequest.statusCode !== "submitted") {
    throw new Error("transactionRequest.statusCode must be submitted");
  }
  requireTimestamp(
    "transactionRequest.requestedAt",
    transactionRequest.requestedAt,
  );
  requireNonEmpty(
    "transactionRequest.correlationId",
    transactionRequest.correlationId,
  );
}

function validateLifecycleEvent(
  lifecycleEvent: SyntheticHireLifecycleEventInput,
): void {
  requireNonEmpty("lifecycleEvent.id", lifecycleEvent.id);
  if (lifecycleEvent.eventType !== "hire") {
    throw new Error("lifecycleEvent.eventType must be hire");
  }
  requireDate("lifecycleEvent.effectiveDate", lifecycleEvent.effectiveDate);
  requireTimestamp("lifecycleEvent.occurredAt", lifecycleEvent.occurredAt);
}

function validateAudit(audit: SyntheticHireAuditInput): void {
  requireNonEmpty("audit.actorId", audit.actorId);
  requireNonEmpty("audit.correlationId", audit.correlationId);
  requireTimestamp("audit.occurredAt", audit.occurredAt);
  if (audit.pocMarker !== syntheticAuditPocMarker) {
    throw new Error("audit.pocMarker must mark synthetic PoC evidence");
  }
}

function validatePerson(person: SyntheticHirePersonInput): void {
  requireNonEmpty("person.id", person.id);
  requireNonEmpty("person.displayName", person.displayName);
  requireTimestamp("person.createdAt", person.createdAt);
}

function validateEmployment(employment: SyntheticHireEmploymentInput): void {
  requireNonEmpty("employment.id", employment.id);
  requireNonEmpty("employment.personId", employment.personId);
  requireNonEmpty("employment.employmentCode", employment.employmentCode);
  if (!allowedEmploymentStatuses.has(employment.statusCode)) {
    throw new Error("employment.statusCode must be an allowed status");
  }
  requireDate("employment.startDate", employment.startDate);
  requireOptionalDate("employment.endDate", employment.endDate);
}

function validateAssignment(assignment: SyntheticHireAssignmentInput): void {
  requireNonEmpty("assignment.id", assignment.id);
  requireNonEmpty("assignment.personId", assignment.personId);
  requireNonEmpty("assignment.employmentId", assignment.employmentId);
  requireNonEmpty("assignment.assignmentCode", assignment.assignmentCode);
  requireNonEmpty("assignment.organizationCode", assignment.organizationCode);
  requireDate("assignment.startDate", assignment.startDate);
  requireOptionalDate("assignment.endDate", assignment.endDate);
}

function validateContactPoint(
  contactPoint: SyntheticHireContactPointInput,
): void {
  requireNonEmpty("contactPoint.id", contactPoint.id);
  requireNonEmpty("contactPoint.personId", contactPoint.personId);
  if (contactPoint.contactType !== "work_email") {
    throw new Error("contactPoint.contactType must be work_email");
  }
  requireNonEmpty("contactPoint.value", contactPoint.value);
  if (contactPoint.value.indexOf("@") <= 0) {
    throw new Error("contactPoint.value must be a skeleton work email");
  }
  requireBoolean("contactPoint.isPrimary", contactPoint.isPrimary);
  requireTimestamp("contactPoint.createdAt", contactPoint.createdAt);
}

function requireNonEmpty(fieldName: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function requireBoolean(fieldName: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }

  return value;
}

function toSqliteBoolean(fieldName: string, value: unknown): 0 | 1 {
  return requireBoolean(fieldName, value) ? 1 : 0;
}

function requireDate(fieldName: string, value: string): void {
  requireNonEmpty(fieldName, value);
  if (!isValidIsoDate(value)) {
    throw new Error(`${fieldName} must be an ISO date`);
  }
}

function requireOptionalDate(
  fieldName: string,
  value: string | null | undefined,
): void {
  if (value === undefined || value === null) {
    return;
  }

  requireDate(fieldName, value);
}

function requireTimestamp(fieldName: string, value: string): void {
  requireNonEmpty(fieldName, value);
  const match = timestampPattern.exec(value);
  if (!match || !isValidIsoDateParts(match[1], match[2], match[3])) {
    throw new Error(`${fieldName} must be an ISO timestamp`);
  }
}

function isValidIsoDate(value: string): boolean {
  const match = datePattern.exec(value);
  return Boolean(match && isValidIsoDateParts(match[1], match[2], match[3]));
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
