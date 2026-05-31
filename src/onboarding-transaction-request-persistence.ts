import {
  parseOnboardingTransactionRequestInput,
  serializeOnboardingPayload,
} from "./onboarding-transaction-request-parser.js";
import { readOnboardingTransactionRequest } from "./onboarding-transaction-request-readers.js";
import {
  assertEditableDraftBinding,
  assertSingleDraftUpdate,
  buildOnboardingTransactionRequestRetryResult,
  matchesOnboardingTransactionRequestRetry,
  rollbackNamedSavepoint,
} from "./onboarding-transaction-request-shared.js";
import type {
  EditableOnboardingTransactionRequestPersistenceResult,
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestPersistenceResult,
  SqlStatement,
} from "./onboarding-transaction-request-types.js";

export function saveOnboardingTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): OnboardingTransactionRequestPersistenceResult {
  const parsed = parseOnboardingTransactionRequestInput(input);
  const payloadJson = serializeOnboardingPayload(parsed.payload);

  const existingRequest = readOnboardingTransactionRequest(db, parsed);
  if (existingRequest) {
    if (
      matchesOnboardingTransactionRequestRetry(
        existingRequest,
        parsed,
        payloadJson,
      )
    ) {
      return buildOnboardingTransactionRequestRetryResult(existingRequest);
    }

    throw new Error(
      "onboarding transaction request retry conflicts with the existing request",
    );
  }

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT onboarding_transaction_request_persistence");
    savepointStarted = true;

    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES (?, ?, ?)
      `,
    ).run(parsed.person.id, parsed.person.displayName, parsed.person.createdAt);

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

    db.exec("RELEASE SAVEPOINT onboarding_transaction_request_persistence");

    return {
      personId: parsed.person.id,
      transactionRequestId: parsed.id,
      statusCode: parsed.statusCode,
      correlationId: parsed.correlationId,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackNamedSavepoint(db, "onboarding_transaction_request_persistence");
      const existingRequest = readOnboardingTransactionRequest(db, parsed);
      if (
        existingRequest &&
        matchesOnboardingTransactionRequestRetry(
          existingRequest,
          parsed,
          payloadJson,
        )
      ) {
        return buildOnboardingTransactionRequestRetryResult(existingRequest);
      }
    }

    throw error;
  }
}

export function saveEditableOnboardingTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): EditableOnboardingTransactionRequestPersistenceResult {
  const parsed = parseOnboardingTransactionRequestInput(input);
  const payloadJson = serializeOnboardingPayload(parsed.payload);
  const existingRequest = readOnboardingTransactionRequest(db, parsed);

  if (!existingRequest) {
    return {
      ...saveOnboardingTransactionRequest(db, parsed),
      operation: "created",
    };
  }

  if (
    matchesOnboardingTransactionRequestRetry(
      existingRequest,
      parsed,
      payloadJson,
    )
  ) {
    return {
      ...buildOnboardingTransactionRequestRetryResult(existingRequest),
      operation: "idempotent",
    };
  }

  assertEditableDraftBinding(existingRequest, parsed);

  db.exec("SAVEPOINT onboarding_transaction_request_edit");
  try {
    db.prepare(
      `
        UPDATE person
        SET display_name = ?,
            created_at = ?
        WHERE id = ?
      `,
    ).run(parsed.person.displayName, parsed.person.createdAt, parsed.person.id);

    const transactionRequestUpdate = db
      .prepare(
        `
        UPDATE transaction_request
        SET status_code = ?,
            requested_at = ?,
            payload_version = ?,
            payload_json = ?
        WHERE id = ?
          AND person_id = ?
          AND correlation_id = ?
          AND status_code in ('draft', 'returned')
      `,
      )
      .run(
        parsed.statusCode,
        parsed.requestedAt,
        parsed.payloadVersion,
        payloadJson,
        parsed.id,
        parsed.person.id,
        parsed.correlationId,
      );
    assertSingleDraftUpdate(transactionRequestUpdate);

    db.exec("RELEASE SAVEPOINT onboarding_transaction_request_edit");
  } catch (error) {
    rollbackNamedSavepoint(db, "onboarding_transaction_request_edit");
    throw error;
  }

  return {
    personId: parsed.person.id,
    transactionRequestId: parsed.id,
    statusCode: parsed.statusCode,
    correlationId: parsed.correlationId,
    operation: "updated",
  };
}

export type {
  EditableOnboardingTransactionRequestPersistenceResult,
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestPersistenceResult,
  SqlStatement,
} from "./onboarding-transaction-request-types.js";
