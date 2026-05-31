import {
  syntheticAuditActorId,
  syntheticAuditPocMarker,
} from "./synthetic-hire-constants.js";
import { insertSyntheticAuditEvent } from "./synthetic-hire-audit.js";
import {
  type SyntheticHireDatabase,
  type SyntheticHireInput,
  type SyntheticHirePersistenceResult,
  type SyntheticHireRequestInput,
  type SyntheticHireRequestPersistenceResult,
} from "./synthetic-hire-types.js";
import {
  rollbackNamedSavepoint,
  rollbackSavepoint,
  toSqliteBoolean,
  validateSyntheticHire,
  validateSyntheticHireRequest,
} from "./synthetic-hire-validation.js";

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
      WHERE transaction_request.correlation_id = ?
         OR (
           transaction_request.id = ?
           AND transaction_request.person_id = ?
         )
      ORDER BY
        CASE
          WHEN transaction_request.correlation_id = ? THEN 0
          WHEN transaction_request.id = ?
            AND transaction_request.person_id = ? THEN 1
          ELSE 2
        END,
        transaction_request.id
      LIMIT 1
    `,
  );

  return statement.get(
    input.transactionRequest.correlationId,
    input.transactionRequest.id,
    input.person.id,
    input.transactionRequest.correlationId,
    input.transactionRequest.id,
    input.person.id,
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
