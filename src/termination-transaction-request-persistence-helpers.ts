import { rollbackNamedSavepoint } from "./onboarding-transaction-request-shared.js";
import type {
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestPersistedStatus,
} from "./onboarding-transaction-request.js";
import type {
  TerminationTransactionRequestInput,
  TerminationTransactionRequestPersonInput,
} from "./termination-transaction-request-contract.js";

export type ExistingTerminationTransactionRequestRow = {
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

type ExistingTerminationPersonRow = {
  id: string;
  display_name: string;
  created_at: string;
};

export function readTerminationTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: TerminationTransactionRequestInput,
): ExistingTerminationTransactionRequestRow | undefined {
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
    ) as ExistingTerminationTransactionRequestRow | undefined;
}

export function ensureTerminationPerson(
  db: OnboardingTransactionRequestDatabase,
  person: TerminationTransactionRequestPersonInput,
): void {
  const existingPerson = readTerminationPerson(db, person.id);

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
      "termination transaction request person conflicts with the existing person",
    );
  }
}

export function matchesTerminationRetry(
  existing: ExistingTerminationTransactionRequestRow,
  input: TerminationTransactionRequestInput,
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

export function isEditableTerminationBinding(
  existing: ExistingTerminationTransactionRequestRow,
  input: TerminationTransactionRequestInput,
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

export function buildTerminationRetryResult(
  existing: ExistingTerminationTransactionRequestRow,
): {
  personId: string;
  transactionRequestId: string;
  statusCode: OnboardingTransactionRequestPersistedStatus;
  correlationId: string;
} {
  if (existing.correlation_id === null) {
    throw new Error(
      "termination transaction request retry read malformed existing request",
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

export function rollbackTerminationPersistenceSavepoint(
  db: OnboardingTransactionRequestDatabase,
): void {
  rollbackNamedSavepoint(db, "termination_transaction_request_persistence");
}

function readTerminationPerson(
  db: OnboardingTransactionRequestDatabase,
  personId: string,
): ExistingTerminationPersonRow | undefined {
  return db
    .prepare(
      `
        SELECT id, display_name, created_at
        FROM person
        WHERE id = ?
      `,
    )
    .get(personId) as ExistingTerminationPersonRow | undefined;
}
