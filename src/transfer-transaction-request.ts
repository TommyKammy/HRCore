import { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";
import {
  assertSupportedFields,
  requireDate,
  requireNonEmpty,
  requireRecord,
  requireTimestamp,
} from "./onboarding-transaction-request-validation.js";
import type {
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestPersistedStatus,
} from "./onboarding-transaction-request.js";

export { OnboardingTransactionRequestValidationError as TransferTransactionRequestValidationError };

export type TransferTransactionRequestStatus = "draft" | "submitted";

export interface TransferTransactionRequestPersonInput {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface TransferTransactionRequestCurrentAssignmentPayload {
  assignmentId: string;
  assignmentCode: string;
}

export interface TransferTransactionRequestTargetAssignmentPayload {
  organizationReference: string;
  departmentReference: string;
  managerReference: string;
  positionCode?: string | null;
}

export interface TransferTransactionRequestReasonPayload {
  reasonCode: "team_change" | "manager_change" | "organization_change";
  note?: string | null;
}

export interface TransferTransactionRequestPayload {
  tenantEnvironmentId: "repo_owned_synthetic_mvp_b_transfer";
  effectiveDate: string;
  currentAssignment: TransferTransactionRequestCurrentAssignmentPayload;
  targetAssignment: TransferTransactionRequestTargetAssignmentPayload;
  transferReason: TransferTransactionRequestReasonPayload;
}

export interface TransferTransactionRequestInput {
  id: string;
  person: TransferTransactionRequestPersonInput;
  requestType: "transfer";
  statusCode: TransferTransactionRequestStatus;
  requestedAt: string;
  correlationId: string;
  payloadVersion: "mvp_b_transfer_v1";
  payload: TransferTransactionRequestPayload;
}

export interface TransferTransactionRequestPersistenceResult {
  personId: string;
  transactionRequestId: string;
  statusCode: OnboardingTransactionRequestPersistedStatus;
  correlationId: string;
}

type TransferTransactionRequestFixtureOverrides = {
  person?: Partial<TransferTransactionRequestPersonInput>;
  payload?: Partial<Record<string, unknown>>;
} & Partial<Omit<TransferTransactionRequestInput, "person" | "payload">>;

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

const transferTransactionRequestFields = [
  "id",
  "person",
  "requestType",
  "statusCode",
  "requestedAt",
  "correlationId",
  "payloadVersion",
  "payload",
];
const transferPersonFields = ["id", "displayName", "createdAt"];
const transferPayloadFields = [
  "tenantEnvironmentId",
  "effectiveDate",
  "currentAssignment",
  "targetAssignment",
  "transferReason",
];
const transferCurrentAssignmentFields = ["assignmentId", "assignmentCode"];
const transferTargetAssignmentFields = [
  "organizationReference",
  "departmentReference",
  "managerReference",
  "positionCode",
];
const transferReasonFields = ["reasonCode", "note"];

export function createTransferTransactionRequestFixture(
  overrides: TransferTransactionRequestFixtureOverrides = {},
): TransferTransactionRequestInput {
  const {
    person: personOverrides,
    payload: payloadOverrides,
    ...requestOverrides
  } = overrides;
  const person = {
    id: "person-transfer-001",
    displayName: "MVP-B Transfer One",
    createdAt: "2026-06-15T00:00:00Z",
    ...personOverrides,
  };
  const payload: TransferTransactionRequestPayload = {
    tenantEnvironmentId: "repo_owned_synthetic_mvp_b_transfer",
    effectiveDate: "2026-07-01",
    currentAssignment: {
      assignmentId: "assignment-current-transfer-001",
      assignmentCode: "ASN-CURRENT-TRANSFER-001",
    },
    targetAssignment: {
      organizationReference: "organization-engineering",
      departmentReference: "department-product",
      managerReference: "manager-product-001",
      positionCode: "position-staff-engineer-001",
    },
    transferReason: {
      reasonCode: "team_change",
      note: "Synthetic bounded MVP-B transfer request",
    },
    ...payloadOverrides,
  } as TransferTransactionRequestPayload;

  return {
    id: "transaction-request-transfer-001",
    requestType: "transfer",
    statusCode: "submitted",
    requestedAt: "2026-06-15T00:00:00Z",
    correlationId: "correlation-transfer-001",
    payloadVersion: "mvp_b_transfer_v1",
    ...requestOverrides,
    person,
    payload,
  };
}

export function parseTransferTransactionRequestInput(
  input: unknown,
): TransferTransactionRequestInput {
  const request = requireRecord("request", input);
  assertSupportedFields("request", request, transferTransactionRequestFields);

  const id = requireNonEmpty("id", request.id);
  const person = parsePerson(request.person);
  if (request.requestType !== "transfer") {
    throw new OnboardingTransactionRequestValidationError(
      "requestType must be transfer",
    );
  }
  if (request.statusCode !== "draft" && request.statusCode !== "submitted") {
    throw new OnboardingTransactionRequestValidationError(
      "statusCode must be draft or submitted",
    );
  }
  const requestedAt = requireTimestamp("requestedAt", request.requestedAt);
  const correlationId = requireNonEmpty("correlationId", request.correlationId);
  if (request.payloadVersion !== "mvp_b_transfer_v1") {
    throw new OnboardingTransactionRequestValidationError(
      "payloadVersion must be mvp_b_transfer_v1",
    );
  }

  return {
    id,
    person,
    requestType: request.requestType,
    statusCode: request.statusCode,
    requestedAt,
    correlationId,
    payloadVersion: request.payloadVersion,
    payload: parsePayload(request.payload),
  };
}

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

    if (isSameTransferDraftBinding(existingRequest, parsed)) {
      return submitExistingTransferDraft(
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
      rollbackTransferSavepoint(db);
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

function parsePerson(input: unknown): TransferTransactionRequestPersonInput {
  const person = requireRecord("person", input);
  assertSupportedFields("person", person, transferPersonFields);

  return {
    id: requireNonEmpty("person.id", person.id),
    displayName: requireNonEmpty("person.displayName", person.displayName),
    createdAt: requireTimestamp("person.createdAt", person.createdAt),
  };
}

function parsePayload(input: unknown): TransferTransactionRequestPayload {
  const payload = requireRecord("payload", input);
  assertSupportedFields("payload", payload, transferPayloadFields);

  return {
    tenantEnvironmentId: requireTransferTenantEnvironmentId(
      "payload.tenantEnvironmentId",
      payload.tenantEnvironmentId,
    ),
    effectiveDate: requireDate("payload.effectiveDate", payload.effectiveDate),
    currentAssignment: parseCurrentAssignment(payload.currentAssignment),
    targetAssignment: parseTargetAssignment(payload.targetAssignment),
    transferReason: parseTransferReason(payload.transferReason),
  };
}

function parseCurrentAssignment(
  input: unknown,
): TransferTransactionRequestCurrentAssignmentPayload {
  const currentAssignment = requireRecord("payload.currentAssignment", input);
  assertSupportedFields(
    "payload.currentAssignment",
    currentAssignment,
    transferCurrentAssignmentFields,
  );

  return {
    assignmentId: requireNonEmpty(
      "payload.currentAssignment.assignmentId",
      currentAssignment.assignmentId,
    ),
    assignmentCode: requireNonEmpty(
      "payload.currentAssignment.assignmentCode",
      currentAssignment.assignmentCode,
    ),
  };
}

function parseTargetAssignment(
  input: unknown,
): TransferTransactionRequestTargetAssignmentPayload {
  const targetAssignment = requireRecord("payload.targetAssignment", input);
  assertSupportedFields(
    "payload.targetAssignment",
    targetAssignment,
    transferTargetAssignmentFields,
  );

  return {
    organizationReference: requireNonEmpty(
      "payload.targetAssignment.organizationReference",
      targetAssignment.organizationReference,
    ),
    departmentReference: requireNonEmpty(
      "payload.targetAssignment.departmentReference",
      targetAssignment.departmentReference,
    ),
    managerReference: requireNonEmpty(
      "payload.targetAssignment.managerReference",
      targetAssignment.managerReference,
    ),
    positionCode:
      targetAssignment.positionCode === undefined ||
      targetAssignment.positionCode === null
        ? null
        : requireNonEmpty(
            "payload.targetAssignment.positionCode",
            targetAssignment.positionCode,
          ),
  };
}

function parseTransferReason(
  input: unknown,
): TransferTransactionRequestReasonPayload {
  const transferReason = requireRecord("payload.transferReason", input);
  assertSupportedFields(
    "payload.transferReason",
    transferReason,
    transferReasonFields,
  );

  const reasonCode = requireNonEmpty(
    "payload.transferReason.reasonCode",
    transferReason.reasonCode,
  );
  if (
    reasonCode !== "team_change" &&
    reasonCode !== "manager_change" &&
    reasonCode !== "organization_change"
  ) {
    throw new OnboardingTransactionRequestValidationError(
      "payload.transferReason.reasonCode must be team_change, manager_change, or organization_change",
    );
  }

  return {
    reasonCode,
    note:
      transferReason.note === undefined || transferReason.note === null
        ? null
        : requireNonEmpty("payload.transferReason.note", transferReason.note),
  };
}

function serializeTransferPayload(
  payload: TransferTransactionRequestPayload,
): string {
  return JSON.stringify({
    tenantEnvironmentId: payload.tenantEnvironmentId,
    effectiveDate: payload.effectiveDate,
    currentAssignment: {
      assignmentId: payload.currentAssignment.assignmentId,
      assignmentCode: payload.currentAssignment.assignmentCode,
    },
    targetAssignment: {
      organizationReference: payload.targetAssignment.organizationReference,
      departmentReference: payload.targetAssignment.departmentReference,
      managerReference: payload.targetAssignment.managerReference,
      positionCode: payload.targetAssignment.positionCode ?? null,
    },
    transferReason: {
      reasonCode: payload.transferReason.reasonCode,
      note: payload.transferReason.note ?? null,
    },
  });
}

function requireTransferTenantEnvironmentId(
  name: string,
  value: unknown,
): "repo_owned_synthetic_mvp_b_transfer" {
  if (value !== "repo_owned_synthetic_mvp_b_transfer") {
    throw new OnboardingTransactionRequestValidationError(
      `${name} must be repo_owned_synthetic_mvp_b_transfer`,
    );
  }

  return value;
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

function isSameTransferDraftBinding(
  existing: ExistingTransferTransactionRequestRow,
  input: TransferTransactionRequestInput,
): boolean {
  return (
    existing.status_code === "draft" &&
    input.statusCode === "submitted" &&
    existing.transaction_request_id === input.id &&
    existing.person_id === input.person.id &&
    existing.display_name === input.person.displayName &&
    existing.created_at === input.person.createdAt &&
    existing.request_type === input.requestType &&
    existing.correlation_id === input.correlationId &&
    existing.payload_version === input.payloadVersion
  );
}

function submitExistingTransferDraft(
  db: OnboardingTransactionRequestDatabase,
  existing: ExistingTransferTransactionRequestRow,
  input: TransferTransactionRequestInput,
  payloadJson: string,
): TransferTransactionRequestPersistenceResult {
  const updateResult = db
    .prepare(
      `
        UPDATE transaction_request
        SET status_code = 'submitted',
            requested_at = ?,
            payload_json = ?
        WHERE id = ?
          AND person_id = ?
          AND correlation_id = ?
          AND status_code = 'draft'
      `,
    )
    .run(
      input.requestedAt,
      payloadJson,
      existing.transaction_request_id,
      input.person.id,
      input.correlationId,
    ) as { changes?: number | bigint };

  if (updateResult.changes !== 1 && updateResult.changes !== 1n) {
    throw new Error(
      "transfer transaction request draft submission conflicts with the current request state",
    );
  }

  return {
    personId: input.person.id,
    transactionRequestId: existing.transaction_request_id,
    statusCode: "submitted",
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

function rollbackTransferSavepoint(
  db: OnboardingTransactionRequestDatabase,
): void {
  try {
    db.exec("ROLLBACK TO SAVEPOINT transfer_transaction_request_persistence");
  } finally {
    db.exec("RELEASE SAVEPOINT transfer_transaction_request_persistence");
  }
}
