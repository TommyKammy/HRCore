import { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";
import type {
  ApplyApprovedOnboardingTransactionRequestInput,
  ApplyDueOnboardingTransactionRequestsInput,
  ExistingAppliedOnboardingTransactionRequestRow,
  ExistingOnboardingTransactionRequestRow,
  OnboardingApprovalDecisionInput,
  OnboardingTransactionRequestAssignmentPayload,
  OnboardingTransactionRequestEmploymentPayload,
  OnboardingTransactionRequestInput,
  OnboardingTransactionRequestPayload,
  OnboardingTransactionRequestPersonInput,
  OnboardingTransactionRequestWorkEmailExpectation,
} from "./onboarding-transaction-request-types.js";
import {
  assertSupportedFields,
  requireDate,
  requireNonEmpty,
  requirePositiveInteger,
  requireRecord,
  requireTimestamp,
} from "./onboarding-transaction-request-validation.js";

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
  "tenantEnvironmentId",
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

type OnboardingTransactionRequestFixtureOverrides = {
  person?: Partial<OnboardingTransactionRequestPersonInput>;
  payload?: Partial<Record<string, unknown>>;
} & Partial<Omit<OnboardingTransactionRequestInput, "person" | "payload">>;

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
    tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
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

export function parseOnboardingApprovalDecisionInput(
  input: unknown,
): OnboardingApprovalDecisionInput {
  const decision = requireRecord("decision", input);
  assertSupportedFields("decision", decision, [
    "transactionRequestId",
    "decision",
    "decidedAt",
    "decidedBy",
    "correlationId",
  ]);

  const transactionRequestId = requireNonEmpty(
    "transactionRequestId",
    decision.transactionRequestId,
  );
  const decisionCode = requireNonEmpty("decision", decision.decision);
  if (
    decisionCode !== "approve" &&
    decisionCode !== "return" &&
    decisionCode !== "reject" &&
    decisionCode !== "cancel"
  ) {
    throw new OnboardingTransactionRequestValidationError(
      "decision must be approve, return, reject, or cancel",
    );
  }

  return {
    transactionRequestId,
    decision: decisionCode,
    decidedAt: requireTimestamp("decidedAt", decision.decidedAt),
    decidedBy: requireNonEmpty("decidedBy", decision.decidedBy),
    correlationId: requireNonEmpty("correlationId", decision.correlationId),
  };
}

export function parseApplyApprovedOnboardingTransactionRequestInput(
  input: unknown,
): ApplyApprovedOnboardingTransactionRequestInput {
  const apply = requireRecord("apply", input);
  assertSupportedFields("apply", apply, [
    "transactionRequestId",
    "appliedAt",
    "appliedBy",
    "correlationId",
  ]);

  return {
    transactionRequestId: requireNonEmpty(
      "transactionRequestId",
      apply.transactionRequestId,
    ),
    appliedAt: requireTimestamp("appliedAt", apply.appliedAt),
    appliedBy: requireNonEmpty("appliedBy", apply.appliedBy),
    correlationId: requireNonEmpty("correlationId", apply.correlationId),
  };
}

export function parseApplyDueOnboardingTransactionRequestsInput(
  input: unknown,
): ApplyDueOnboardingTransactionRequestsInput {
  const worker = requireRecord("worker", input);
  assertSupportedFields("worker", worker, [
    "now",
    "workerId",
    "correlationId",
    "batchLimit",
  ]);

  return {
    now: requireTimestamp("now", worker.now),
    workerId: requireNonEmpty("workerId", worker.workerId),
    correlationId: requireNonEmpty("correlationId", worker.correlationId),
    batchLimit:
      worker.batchLimit === undefined
        ? 100
        : requirePositiveInteger("batchLimit", worker.batchLimit),
  };
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
    tenantEnvironmentId: requireSyntheticTenantEnvironmentId(
      "payload.tenantEnvironmentId",
      payload.tenantEnvironmentId,
    ),
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

export function serializeOnboardingPayload(
  payload: OnboardingTransactionRequestPayload,
): string {
  return JSON.stringify({
    tenantEnvironmentId: payload.tenantEnvironmentId,
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

function requireSyntheticTenantEnvironmentId(
  name: string,
  value: unknown,
): "repo_owned_synthetic_mvp_a_onboarding" {
  if (value !== "repo_owned_synthetic_mvp_a_onboarding") {
    throw new OnboardingTransactionRequestValidationError(
      `${name} must be repo_owned_synthetic_mvp_a_onboarding`,
    );
  }

  return value;
}

export function parsePersistedOnboardingApplyPayload(
  existing:
    | ExistingOnboardingTransactionRequestRow
    | ExistingAppliedOnboardingTransactionRequestRow,
): OnboardingTransactionRequestPayload {
  if (
    existing.payload_version !== "mvp_a_onboarding_v1" ||
    typeof existing.payload_json !== "string"
  ) {
    throw new Error("persisted onboarding apply requires MVP-A payload");
  }

  let payload: OnboardingTransactionRequestPayload;
  try {
    payload = parsePayload(JSON.parse(existing.payload_json));
  } catch {
    throw new Error("persisted onboarding apply payload is malformed");
  }

  if (payload.effectiveDate !== payload.employment.startDate) {
    throw new Error(
      "persisted onboarding apply payload violates date invariants",
    );
  }

  return payload;
}
