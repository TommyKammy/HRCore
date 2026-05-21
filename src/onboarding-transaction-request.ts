type SqlValue = string | number | bigint | null;
type SqlRunResult = {
  changes?: number | bigint;
};

export interface SqlStatement {
  get(...values: SqlValue[]): Record<string, unknown> | undefined;
  run(...values: SqlValue[]): unknown;
}

export interface OnboardingTransactionRequestDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
}

export type OnboardingTransactionRequestStatus = "draft" | "submitted";
export type OnboardingTransactionRequestPersistedStatus =
  | OnboardingTransactionRequestStatus
  | "completed";

export interface OnboardingTransactionRequestPersonInput {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface OnboardingTransactionRequestEmploymentPayload {
  id: string;
  employmentCode: string;
  startDate: string;
}

export interface OnboardingTransactionRequestAssignmentPayload {
  id: string;
  assignmentCode: string;
  departmentReference: string;
  legalEntityReference: string;
  managerReference: string;
  positionCode?: string | null;
}

export interface OnboardingTransactionRequestWorkEmailExpectation {
  contactPointId: string;
  value: string;
}

export interface OnboardingTransactionRequestPayload {
  effectiveDate: string;
  employment: OnboardingTransactionRequestEmploymentPayload;
  assignment: OnboardingTransactionRequestAssignmentPayload;
  workEmailExpectation: OnboardingTransactionRequestWorkEmailExpectation;
}

export interface OnboardingTransactionRequestInput {
  id: string;
  person: OnboardingTransactionRequestPersonInput;
  requestType: "hire";
  statusCode: OnboardingTransactionRequestStatus;
  requestedAt: string;
  correlationId: string;
  payloadVersion: "mvp_a_onboarding_v1";
  payload: OnboardingTransactionRequestPayload;
}

export interface OnboardingTransactionRequestPersistenceResult {
  personId: string;
  transactionRequestId: string;
  statusCode: OnboardingTransactionRequestPersistedStatus;
  correlationId: string;
}

export interface EditableOnboardingTransactionRequestPersistenceResult extends OnboardingTransactionRequestPersistenceResult {
  operation: "created" | "updated" | "idempotent";
}

type OnboardingTransactionRequestFixtureOverrides = {
  person?: Partial<OnboardingTransactionRequestPersonInput>;
  payload?: Partial<Record<string, unknown>>;
} & Partial<Omit<OnboardingTransactionRequestInput, "person" | "payload">>;

type ExistingOnboardingTransactionRequestRow = {
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

const onboardingTransactionRequestFields = [
  "id",
  "person",
  "requestType",
  "statusCode",
  "requestedAt",
  "correlationId",
  "payloadVersion",
  "payload",
];
const onboardingPersonFields = ["id", "displayName", "createdAt"];
const onboardingPayloadFields = [
  "effectiveDate",
  "employment",
  "assignment",
  "workEmailExpectation",
];
const onboardingEmploymentFields = ["id", "employmentCode", "startDate"];
const onboardingAssignmentFields = [
  "id",
  "assignmentCode",
  "departmentReference",
  "legalEntityReference",
  "managerReference",
  "positionCode",
];
const onboardingWorkEmailExpectationFields = ["contactPointId", "value"];

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

export class OnboardingTransactionRequestValidationError extends Error {
  override name = "OnboardingTransactionRequestValidationError";
}

export function createOnboardingTransactionRequestFixture(
  overrides: OnboardingTransactionRequestFixtureOverrides = {},
): OnboardingTransactionRequestInput {
  const {
    person: personOverrides,
    payload: payloadOverrides,
    ...requestOverrides
  } = overrides;
  const person = {
    id: "person-onboarding-001",
    displayName: "MVP-A Onboarding Hire One",
    createdAt: "2026-05-21T00:00:00Z",
    ...personOverrides,
  };
  const payload: OnboardingTransactionRequestPayload = {
    effectiveDate: "2026-06-01",
    employment: {
      id: "employment-onboarding-001",
      employmentCode: "EMP-ONBOARDING-001",
      startDate: "2026-06-01",
    },
    assignment: {
      id: "assignment-onboarding-001",
      assignmentCode: "ASN-ONBOARDING-001",
      departmentReference: "department-people-ops",
      legalEntityReference: "legal-entity-jp-001",
      managerReference: "manager-001",
      positionCode: "position-engineer-001",
    },
    workEmailExpectation: {
      contactPointId: "contact-point-onboarding-001",
      value: "onboarding.hire.001@example.invalid",
    },
    ...payloadOverrides,
  } as OnboardingTransactionRequestPayload;

  return {
    id: "transaction-request-onboarding-001",
    requestType: "hire",
    statusCode: "submitted",
    requestedAt: "2026-05-21T00:00:00Z",
    correlationId: "correlation-onboarding-001",
    payloadVersion: "mvp_a_onboarding_v1",
    ...requestOverrides,
    person,
    payload,
  };
}

export function parseOnboardingTransactionRequestInput(
  input: unknown,
): OnboardingTransactionRequestInput {
  const request = requireRecord("request", input);
  assertSupportedFields("request", request, onboardingTransactionRequestFields);

  const id = requireNonEmpty("id", request.id);
  const person = parsePerson(request.person);
  if (request.requestType !== "hire") {
    throw new OnboardingTransactionRequestValidationError(
      "requestType must be hire",
    );
  }
  if (request.statusCode !== "draft" && request.statusCode !== "submitted") {
    throw new OnboardingTransactionRequestValidationError(
      "statusCode must be draft or submitted",
    );
  }
  const requestedAt = requireTimestamp("requestedAt", request.requestedAt);
  const correlationId = requireNonEmpty("correlationId", request.correlationId);
  if (request.payloadVersion !== "mvp_a_onboarding_v1") {
    throw new OnboardingTransactionRequestValidationError(
      "payloadVersion must be mvp_a_onboarding_v1",
    );
  }
  const payload = parsePayload(request.payload);

  if (payload.effectiveDate !== payload.employment.startDate) {
    throw new OnboardingTransactionRequestValidationError(
      "payload.employment.startDate must match payload.effectiveDate",
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
    payload,
  };
}

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
          AND status_code = 'draft'
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

function assertSingleDraftUpdate(result: unknown): void {
  if (
    !isSqlRunResult(result) ||
    (result.changes !== 1 && result.changes !== 1n)
  ) {
    throw new Error(
      "onboarding transaction request edit conflicts with the current draft state",
    );
  }
}

function isSqlRunResult(result: unknown): result is SqlRunResult {
  if (!isRecord(result) || !("changes" in result)) {
    return false;
  }

  return (
    typeof result.changes === "number" || typeof result.changes === "bigint"
  );
}

function parsePerson(input: unknown): OnboardingTransactionRequestPersonInput {
  const person = requireRecord("person", input);
  assertSupportedFields("person", person, onboardingPersonFields);

  return {
    id: requireNonEmpty("person.id", person.id),
    displayName: requireNonEmpty("person.displayName", person.displayName),
    createdAt: requireTimestamp("person.createdAt", person.createdAt),
  };
}

function parsePayload(input: unknown): OnboardingTransactionRequestPayload {
  const payload = requireRecord("payload", input);
  assertSupportedFields("payload", payload, onboardingPayloadFields);

  return {
    effectiveDate: requireDate("payload.effectiveDate", payload.effectiveDate),
    employment: parseEmploymentPayload(payload.employment),
    assignment: parseAssignmentPayload(payload.assignment),
    workEmailExpectation: parseWorkEmailExpectation(
      payload.workEmailExpectation,
    ),
  };
}

function parseEmploymentPayload(
  input: unknown,
): OnboardingTransactionRequestEmploymentPayload {
  const employment = requireRecord("payload.employment", input);
  assertSupportedFields(
    "payload.employment",
    employment,
    onboardingEmploymentFields,
  );

  return {
    id: requireNonEmpty("payload.employment.id", employment.id),
    employmentCode: requireNonEmpty(
      "payload.employment.employmentCode",
      employment.employmentCode,
    ),
    startDate: requireDate(
      "payload.employment.startDate",
      employment.startDate,
    ),
  };
}

function parseAssignmentPayload(
  input: unknown,
): OnboardingTransactionRequestAssignmentPayload {
  const assignment = requireRecord("payload.assignment", input);
  assertSupportedFields(
    "payload.assignment",
    assignment,
    onboardingAssignmentFields,
  );

  return {
    id: requireNonEmpty("payload.assignment.id", assignment.id),
    assignmentCode: requireNonEmpty(
      "payload.assignment.assignmentCode",
      assignment.assignmentCode,
    ),
    departmentReference: requireNonEmpty(
      "payload.assignment.departmentReference",
      assignment.departmentReference,
    ),
    legalEntityReference: requireNonEmpty(
      "payload.assignment.legalEntityReference",
      assignment.legalEntityReference,
    ),
    managerReference: requireNonEmpty(
      "payload.assignment.managerReference",
      assignment.managerReference,
    ),
    positionCode:
      assignment.positionCode === undefined || assignment.positionCode === null
        ? null
        : requireNonEmpty(
            "payload.assignment.positionCode",
            assignment.positionCode,
          ),
  };
}

function parseWorkEmailExpectation(
  input: unknown,
): OnboardingTransactionRequestWorkEmailExpectation {
  const workEmailExpectation = requireRecord(
    "payload.workEmailExpectation",
    input,
  );
  assertSupportedFields(
    "payload.workEmailExpectation",
    workEmailExpectation,
    onboardingWorkEmailExpectationFields,
  );

  const value = requireNonEmpty(
    "payload.workEmailExpectation.value",
    workEmailExpectation.value,
  );
  if (value.indexOf("@") <= 0) {
    throw new OnboardingTransactionRequestValidationError(
      "payload.workEmailExpectation.value must be a skeleton work email",
    );
  }

  return {
    contactPointId: requireNonEmpty(
      "payload.workEmailExpectation.contactPointId",
      workEmailExpectation.contactPointId,
    ),
    value,
  };
}

function serializeOnboardingPayload(
  payload: OnboardingTransactionRequestPayload,
): string {
  return JSON.stringify({
    effectiveDate: payload.effectiveDate,
    employment: {
      id: payload.employment.id,
      employmentCode: payload.employment.employmentCode,
      startDate: payload.employment.startDate,
    },
    assignment: {
      id: payload.assignment.id,
      assignmentCode: payload.assignment.assignmentCode,
      departmentReference: payload.assignment.departmentReference,
      legalEntityReference: payload.assignment.legalEntityReference,
      managerReference: payload.assignment.managerReference,
      positionCode: payload.assignment.positionCode ?? null,
    },
    workEmailExpectation: {
      contactPointId: payload.workEmailExpectation.contactPointId,
      value: payload.workEmailExpectation.value,
    },
  });
}

function readOnboardingTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: OnboardingTransactionRequestInput,
): ExistingOnboardingTransactionRequestRow | undefined {
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
  );

  return statement.get(
    input.correlationId,
    input.id,
    input.person.id,
    input.correlationId,
    input.id,
    input.person.id,
  ) as ExistingOnboardingTransactionRequestRow | undefined;
}

function matchesOnboardingTransactionRequestRetry(
  existing: ExistingOnboardingTransactionRequestRow,
  input: OnboardingTransactionRequestInput,
  payloadJson: string,
): boolean {
  const requestAlreadyAccepted =
    existing.status_code === input.statusCode ||
    (input.statusCode === "submitted" && existing.status_code === "completed");

  return (
    requestAlreadyAccepted &&
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

function buildOnboardingTransactionRequestRetryResult(
  existing: ExistingOnboardingTransactionRequestRow,
): OnboardingTransactionRequestPersistenceResult {
  if (existing.correlation_id === null) {
    throw new Error(
      "onboarding transaction request retry read malformed existing request",
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

function assertEditableDraftBinding(
  existing: ExistingOnboardingTransactionRequestRow,
  input: OnboardingTransactionRequestInput,
): void {
  if (
    existing.transaction_request_id !== input.id ||
    existing.person_id !== input.person.id ||
    existing.correlation_id !== input.correlationId
  ) {
    throw new Error(
      "onboarding transaction request edit conflicts with the existing request binding",
    );
  }

  if (existing.status_code !== "draft") {
    throw new Error(
      "onboarding transaction request can only be edited while draft",
    );
  }
}

function assertSupportedFields(
  objectName: string,
  input: Record<string, unknown>,
  supportedFields: readonly string[],
): void {
  const unsupportedFields = Object.keys(input).filter(
    (field) => !supportedFields.includes(field),
  );
  if (unsupportedFields.length > 0) {
    throw new OnboardingTransactionRequestValidationError(
      `${objectName} contains unsupported fields: ${unsupportedFields.join(
        ", ",
      )}`,
    );
  }
}

function requireRecord(
  fieldName: string,
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new OnboardingTransactionRequestValidationError(
      `${fieldName} must be an object`,
    );
  }

  return value;
}

function requireNonEmpty(fieldName: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OnboardingTransactionRequestValidationError(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function requireDate(fieldName: string, value: unknown): string {
  const text = requireNonEmpty(fieldName, value);
  if (!isValidIsoDate(text)) {
    throw new OnboardingTransactionRequestValidationError(
      `${fieldName} must be an ISO date`,
    );
  }

  return text;
}

function requireTimestamp(fieldName: string, value: unknown): string {
  const text = requireNonEmpty(fieldName, value);
  const match = timestampPattern.exec(text);
  if (!match || !isValidIsoDateParts(match[1], match[2], match[3])) {
    throw new OnboardingTransactionRequestValidationError(
      `${fieldName} must be an ISO timestamp`,
    );
  }

  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function rollbackNamedSavepoint(
  db: OnboardingTransactionRequestDatabase,
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
