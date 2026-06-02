import { rollbackNamedSavepoint } from "./onboarding-transaction-request-shared.js";
import type {
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestPersistedStatus,
} from "./onboarding-transaction-request.js";
import {
  buildTerminationRetryResult,
  ensureTerminationPerson,
  isEditableTerminationBinding,
  matchesTerminationRetry,
  readTerminationTransactionRequest,
  rollbackTerminationPersistenceSavepoint,
  type ExistingTerminationTransactionRequestRow,
} from "./termination-transaction-request-persistence-helpers.js";
import {
  parseTerminationTransactionRequestInput,
  serializeTerminationPayload,
} from "./termination-transaction-request-contract.js";
import type { TerminationTransactionRequestInput } from "./termination-transaction-request-contract.js";

export interface TerminationTransactionRequestPersistenceResult {
  personId: string;
  transactionRequestId: string;
  statusCode: OnboardingTransactionRequestPersistedStatus;
  correlationId: string;
}

export function saveTerminationTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): TerminationTransactionRequestPersistenceResult {
  const parsed = parseTerminationTransactionRequestInput(input);
  const payloadJson = serializeTerminationPayload(parsed.payload);
  const existingRequest = readTerminationTransactionRequest(db, parsed);

  if (existingRequest) {
    if (matchesTerminationRetry(existingRequest, parsed, payloadJson)) {
      return buildTerminationRetryResult(existingRequest);
    }

    if (isEditableTerminationBinding(existingRequest, parsed)) {
      return updateEditableTerminationRequest(
        db,
        existingRequest,
        parsed,
        payloadJson,
      );
    }

    throw new Error(
      "termination transaction request retry conflicts with the existing request",
    );
  }

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT termination_transaction_request_persistence");
    savepointStarted = true;

    ensureTerminationPerson(db, parsed.person);

    db.prepare(
      `
        INSERT INTO transaction_request (
          id,
          person_id,
          request_type,
          status_code,
          requested_at,
          correlation_id,
          payload_version,
          payload_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      parsed.id,
      parsed.person.id,
      parsed.requestType,
      parsed.statusCode,
      parsed.requestedAt,
      parsed.correlationId,
      parsed.payloadVersion,
      payloadJson,
    );

    db.exec("RELEASE SAVEPOINT termination_transaction_request_persistence");

    return {
      personId: parsed.person.id,
      transactionRequestId: parsed.id,
      statusCode: parsed.statusCode,
      correlationId: parsed.correlationId,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackTerminationPersistenceSavepoint(db);
      const retryAfterRollback = readTerminationTransactionRequest(db, parsed);
      if (
        retryAfterRollback &&
        matchesTerminationRetry(retryAfterRollback, parsed, payloadJson)
      ) {
        return buildTerminationRetryResult(retryAfterRollback);
      }
    }

    throw error;
  }
}

function updateEditableTerminationRequest(
  db: OnboardingTransactionRequestDatabase,
  existing: ExistingTerminationTransactionRequestRow,
  input: TerminationTransactionRequestInput,
  payloadJson: string,
): TerminationTransactionRequestPersistenceResult {
  db.exec("SAVEPOINT termination_transaction_request_edit");
  try {
    db.prepare(
      `
        UPDATE person
        SET display_name = ?,
            created_at = ?
        WHERE id = ?
      `,
    ).run(input.person.displayName, input.person.createdAt, input.person.id);

    const updateResult = db
      .prepare(
        `
        UPDATE transaction_request
        SET status_code = ?,
            requested_at = ?,
            payload_json = ?
        WHERE id = ?
          AND person_id = ?
          AND correlation_id = ?
          AND status_code in ('draft', 'returned')
      `,
      )
      .run(
        input.statusCode,
        input.requestedAt,
        payloadJson,
        existing.transaction_request_id,
        input.person.id,
        input.correlationId,
      ) as { changes?: number | bigint };

    if (updateResult.changes !== 1 && updateResult.changes !== 1n) {
      throw new Error(
        "termination transaction request edit conflicts with the current request state",
      );
    }

    db.exec("RELEASE SAVEPOINT termination_transaction_request_edit");
  } catch (error) {
    rollbackNamedSavepoint(db, "termination_transaction_request_edit");
    throw error;
  }

  return {
    personId: input.person.id,
    transactionRequestId: existing.transaction_request_id,
    statusCode: input.statusCode,
    correlationId: input.correlationId,
  };
}
