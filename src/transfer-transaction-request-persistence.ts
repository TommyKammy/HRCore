import { rollbackNamedSavepoint } from "./onboarding-transaction-request-shared.js";
import type {
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestPersistedStatus,
} from "./onboarding-transaction-request.js";
import {
  parseTransferTransactionRequestInput,
  serializeTransferPayload,
} from "./transfer-transaction-request-contract.js";
import type {
  TransferTransactionRequestInput,
  TransferTransactionRequestPersonInput,
} from "./transfer-transaction-request-contract.js";

export interface TransferTransactionRequestPersistenceResult {
  personId: string;
  transactionRequestId: string;
  statusCode: OnboardingTransactionRequestPersistedStatus;
  correlationId: string;
}

type ExistingTransferTransactionRequestRow = {
  person_id: string;
  transaction_request_id: string;
  display_name: string;
  created_at: string;
  request_type: string;
  status_code: string;
  requested_at: string;
  correlation_id: string | null;
  payload_version: string | null;
  payload_json: string | null;
};

type ExistingTransferPersonRow = {
  id: string;
  display_name: string;
  created_at: string;
};

export function saveTransferTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): TransferTransactionRequestPersistenceResult {
  const parsed = parseTransferTransactionRequestInput(input);
  const payloadJson = serializeTransferPayload(parsed.payload);
  const existingRequest = readTransferTransactionRequest(db, parsed);

  if (existingRequest) {
    if (matchesTransferRetry(existingRequest, parsed, payloadJson)) {
      return buildTransferRetryResult(existingRequest);
    }

    // Drafts and returned requests may be edited only through the same durable
    // request/person/correlation binding.
    if (isEditableTransferBinding(existingRequest, parsed)) {
      return updateEditableTransferRequest(
        db,
        existingRequest,
        parsed,
        payloadJson,
      );
    }

    throw new Error(
      "transfer transaction request retry conflicts with the existing request",
    );
  }

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT transfer_transaction_request_persistence");
    savepointStarted = true;

    ensureTransferPerson(db, parsed.person);

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

    db.exec("RELEASE SAVEPOINT transfer_transaction_request_persistence");

    return {
      personId: parsed.person.id,
      transactionRequestId: parsed.id,
      statusCode: parsed.statusCode,
      correlationId: parsed.correlationId,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackTransferPersistenceSavepoint(db);
      const retryAfterRollback = readTransferTransactionRequest(db, parsed);
      if (
        retryAfterRollback &&
        matchesTransferRetry(retryAfterRollback, parsed, payloadJson)
      ) {
        return buildTransferRetryResult(retryAfterRollback);
      }
    }

    throw error;
  }
}

function readTransferTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: TransferTransactionRequestInput,
): ExistingTransferTransactionRequestRow | undefined {
  return db
    .prepare(
      `
        SELECT
          person.id AS person_id,
          transaction_request.id AS transaction_request_id,
          person.display_name,
          person.created_at,
          transaction_request.request_type,
          transaction_request.status_code,
          transaction_request.requested_at,
          transaction_request.correlation_id,
          transaction_request.payload_version,
          transaction_request.payload_json
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
    )
    .get(
      input.correlationId,
      input.id,
      input.person.id,
      input.correlationId,
      input.id,
      input.person.id,
    ) as ExistingTransferTransactionRequestRow | undefined;
}

function readTransferPerson(
  db: OnboardingTransactionRequestDatabase,
  personId: string,
): ExistingTransferPersonRow | undefined {
  return db
    .prepare(
      `
        SELECT id, display_name, created_at
        FROM person
        WHERE id = ?
      `,
    )
    .get(personId) as ExistingTransferPersonRow | undefined;
}

function ensureTransferPerson(
  db: OnboardingTransactionRequestDatabase,
  person: TransferTransactionRequestPersonInput,
): void {
  const existingPerson = readTransferPerson(db, person.id);

  if (!existingPerson) {
    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES (?, ?, ?)
      `,
    ).run(person.id, person.displayName, person.createdAt);
    return;
  }

  if (
    existingPerson.display_name !== person.displayName ||
    existingPerson.created_at !== person.createdAt
  ) {
    throw new Error(
      "transfer transaction request person conflicts with the existing person",
    );
  }
}

function matchesTransferRetry(
  existing: ExistingTransferTransactionRequestRow,
  input: TransferTransactionRequestInput,
  payloadJson: string,
): boolean {
  return (
    existing.status_code === input.statusCode &&
    existing.transaction_request_id === input.id &&
    existing.person_id === input.person.id &&
    existing.display_name === input.person.displayName &&
    existing.created_at === input.person.createdAt &&
    existing.request_type === input.requestType &&
    existing.requested_at === input.requestedAt &&
    existing.correlation_id === input.correlationId &&
    existing.payload_version === input.payloadVersion &&
    existing.payload_json === payloadJson
  );
}

function isEditableTransferBinding(
  existing: ExistingTransferTransactionRequestRow,
  input: TransferTransactionRequestInput,
): boolean {
  return (
    (existing.status_code === "draft" || existing.status_code === "returned") &&
    existing.transaction_request_id === input.id &&
    existing.person_id === input.person.id &&
    existing.request_type === input.requestType &&
    existing.correlation_id === input.correlationId &&
    existing.payload_version === input.payloadVersion
  );
}

function updateEditableTransferRequest(
  db: OnboardingTransactionRequestDatabase,
  existing: ExistingTransferTransactionRequestRow,
  input: TransferTransactionRequestInput,
  payloadJson: string,
): TransferTransactionRequestPersistenceResult {
  db.exec("SAVEPOINT transfer_transaction_request_edit");
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
        "transfer transaction request edit conflicts with the current request state",
      );
    }

    db.exec("RELEASE SAVEPOINT transfer_transaction_request_edit");
  } catch (error) {
    rollbackNamedSavepoint(db, "transfer_transaction_request_edit");
    throw error;
  }

  return {
    personId: input.person.id,
    transactionRequestId: existing.transaction_request_id,
    statusCode: input.statusCode,
    correlationId: input.correlationId,
  };
}

function buildTransferRetryResult(
  existing: ExistingTransferTransactionRequestRow,
): TransferTransactionRequestPersistenceResult {
  if (existing.correlation_id === null) {
    throw new Error(
      "transfer transaction request retry read malformed existing request",
    );
  }

  return {
    personId: existing.person_id,
    transactionRequestId: existing.transaction_request_id,
    statusCode:
      existing.status_code as OnboardingTransactionRequestPersistedStatus,
    correlationId: existing.correlation_id,
  };
}

function rollbackTransferPersistenceSavepoint(
  db: OnboardingTransactionRequestDatabase,
): void {
  try {
    db.exec("ROLLBACK TO SAVEPOINT transfer_transaction_request_persistence");
  } finally {
    db.exec("RELEASE SAVEPOINT transfer_transaction_request_persistence");
  }
}
