import { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";
import {
  assertSupportedFields,
  requireDate,
  requireNonEmpty,
  requireRecord,
  requireTimestamp,
} from "./onboarding-transaction-request-validation.js";

export { OnboardingTransactionRequestValidationError as TerminationTransactionRequestValidationError };

export type TerminationTransactionRequestStatus = "draft" | "submitted";

export interface TerminationTransactionRequestPersonInput {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface TerminationTransactionRequestCurrentEmploymentPayload {
  employmentId: string;
  employmentCode: string;
}

export interface TerminationTransactionRequestCurrentAssignmentPayload {
  assignmentId: string;
  assignmentCode: string;
}

export interface TerminationTransactionRequestReasonPayload {
  reasonCode:
    | "resignation"
    | "retirement"
    | "contract_end"
    | "mutual_agreement";
  note?: string | null;
}

export interface TerminationTransactionRequestPayload {
  tenantEnvironmentId: "repo_owned_synthetic_mvp_c_termination";
  effectiveDate: string;
  currentEmployment: TerminationTransactionRequestCurrentEmploymentPayload;
  currentAssignment: TerminationTransactionRequestCurrentAssignmentPayload;
  terminationReason: TerminationTransactionRequestReasonPayload;
}

export interface TerminationTransactionRequestInput {
  id: string;
  person: TerminationTransactionRequestPersonInput;
  requestType: "terminate";
  statusCode: TerminationTransactionRequestStatus;
  requestedAt: string;
  correlationId: string;
  payloadVersion: "mvp_c_termination_v1";
  payload: TerminationTransactionRequestPayload;
}

type TerminationTransactionRequestFixtureOverrides = {
  person?: Partial<TerminationTransactionRequestPersonInput>;
  payload?: Partial<Record<string, unknown>>;
} & Partial<Omit<TerminationTransactionRequestInput, "person" | "payload">>;

const terminationTransactionRequestFields = [
  "id",
  "person",
  "requestType",
  "statusCode",
  "requestedAt",
  "correlationId",
  "payloadVersion",
  "payload",
];
const terminationPersonFields = ["id", "displayName", "createdAt"];
const terminationPayloadFields = [
  "tenantEnvironmentId",
  "effectiveDate",
  "currentEmployment",
  "currentAssignment",
  "terminationReason",
];
const terminationCurrentEmploymentFields = ["employmentId", "employmentCode"];
const terminationCurrentAssignmentFields = ["assignmentId", "assignmentCode"];
const terminationReasonFields = ["reasonCode", "note"];

export function createTerminationTransactionRequestFixture(
  overrides: TerminationTransactionRequestFixtureOverrides = {},
): TerminationTransactionRequestInput {
  const {
    person: personOverrides,
    payload: payloadOverrides,
    ...requestOverrides
  } = overrides;
  const person = {
    id: "person-termination-001",
    displayName: "MVP-C Termination One",
    createdAt: "2026-08-01T00:00:00Z",
    ...personOverrides,
  };
  const payload: TerminationTransactionRequestPayload = {
    tenantEnvironmentId: "repo_owned_synthetic_mvp_c_termination",
    effectiveDate: "2026-08-31",
    currentEmployment: {
      employmentId: "employment-termination-001",
      employmentCode: "EMP-TERMINATION-001",
    },
    currentAssignment: {
      assignmentId: "assignment-current-termination-001",
      assignmentCode: "ASN-CURRENT-TERMINATION-001",
    },
    terminationReason: {
      reasonCode: "resignation",
      note: "Synthetic bounded MVP-C termination request",
    },
    ...payloadOverrides,
  } as TerminationTransactionRequestPayload;

  return {
    id: "transaction-request-termination-001",
    requestType: "terminate",
    statusCode: "submitted",
    requestedAt: "2026-08-01T00:00:00Z",
    correlationId: "correlation-termination-001",
    payloadVersion: "mvp_c_termination_v1",
    ...requestOverrides,
    person,
    payload,
  };
}

export function parseTerminationTransactionRequestInput(
  input: unknown,
): TerminationTransactionRequestInput {
  const request = requireRecord("request", input);
  assertSupportedFields(
    "request",
    request,
    terminationTransactionRequestFields,
  );

  const id = requireNonEmpty("id", request.id);
  const person = parsePerson(request.person);
  if (request.requestType !== "terminate") {
    throw new OnboardingTransactionRequestValidationError(
      "requestType must be terminate",
    );
  }
  if (request.statusCode !== "draft" && request.statusCode !== "submitted") {
    throw new OnboardingTransactionRequestValidationError(
      "statusCode must be draft or submitted",
    );
  }
  const requestedAt = requireTimestamp("requestedAt", request.requestedAt);
  const correlationId = requireNonEmpty("correlationId", request.correlationId);
  if (request.payloadVersion !== "mvp_c_termination_v1") {
    throw new OnboardingTransactionRequestValidationError(
      "payloadVersion must be mvp_c_termination_v1",
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
    payload: parseTerminationPayload(request.payload),
  };
}

export function parseTerminationPayload(
  input: unknown,
): TerminationTransactionRequestPayload {
  const payload = requireRecord("payload", input);
  assertSupportedFields("payload", payload, terminationPayloadFields);

  return {
    tenantEnvironmentId: requireTerminationTenantEnvironmentId(
      "payload.tenantEnvironmentId",
      payload.tenantEnvironmentId,
    ),
    effectiveDate: requireDate("payload.effectiveDate", payload.effectiveDate),
    currentEmployment: parseCurrentEmployment(payload.currentEmployment),
    currentAssignment: parseCurrentAssignment(payload.currentAssignment),
    terminationReason: parseTerminationReason(payload.terminationReason),
  };
}

export function serializeTerminationPayload(
  payload: TerminationTransactionRequestPayload,
): string {
  return JSON.stringify({
    tenantEnvironmentId: payload.tenantEnvironmentId,
    effectiveDate: payload.effectiveDate,
    currentEmployment: {
      employmentId: payload.currentEmployment.employmentId,
      employmentCode: payload.currentEmployment.employmentCode,
    },
    currentAssignment: {
      assignmentId: payload.currentAssignment.assignmentId,
      assignmentCode: payload.currentAssignment.assignmentCode,
    },
    terminationReason: {
      reasonCode: payload.terminationReason.reasonCode,
      note: payload.terminationReason.note ?? null,
    },
  });
}

function parsePerson(input: unknown): TerminationTransactionRequestPersonInput {
  const person = requireRecord("person", input);
  assertSupportedFields("person", person, terminationPersonFields);

  return {
    id: requireNonEmpty("person.id", person.id),
    displayName: requireNonEmpty("person.displayName", person.displayName),
    createdAt: requireTimestamp("person.createdAt", person.createdAt),
  };
}

function parseCurrentEmployment(
  input: unknown,
): TerminationTransactionRequestCurrentEmploymentPayload {
  const currentEmployment = requireRecord("payload.currentEmployment", input);
  assertSupportedFields(
    "payload.currentEmployment",
    currentEmployment,
    terminationCurrentEmploymentFields,
  );

  return {
    employmentId: requireNonEmpty(
      "payload.currentEmployment.employmentId",
      currentEmployment.employmentId,
    ),
    employmentCode: requireNonEmpty(
      "payload.currentEmployment.employmentCode",
      currentEmployment.employmentCode,
    ),
  };
}

function parseCurrentAssignment(
  input: unknown,
): TerminationTransactionRequestCurrentAssignmentPayload {
  const currentAssignment = requireRecord("payload.currentAssignment", input);
  assertSupportedFields(
    "payload.currentAssignment",
    currentAssignment,
    terminationCurrentAssignmentFields,
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

function parseTerminationReason(
  input: unknown,
): TerminationTransactionRequestReasonPayload {
  const terminationReason = requireRecord("payload.terminationReason", input);
  assertSupportedFields(
    "payload.terminationReason",
    terminationReason,
    terminationReasonFields,
  );

  const reasonCode = requireNonEmpty(
    "payload.terminationReason.reasonCode",
    terminationReason.reasonCode,
  );
  if (
    reasonCode !== "resignation" &&
    reasonCode !== "retirement" &&
    reasonCode !== "contract_end" &&
    reasonCode !== "mutual_agreement"
  ) {
    throw new OnboardingTransactionRequestValidationError(
      "payload.terminationReason.reasonCode must be resignation, retirement, contract_end, or mutual_agreement",
    );
  }

  return {
    reasonCode,
    note:
      terminationReason.note === undefined || terminationReason.note === null
        ? null
        : requireNonEmpty(
            "payload.terminationReason.note",
            terminationReason.note,
          ),
  };
}

function requireTerminationTenantEnvironmentId(
  name: string,
  value: unknown,
): "repo_owned_synthetic_mvp_c_termination" {
  if (value !== "repo_owned_synthetic_mvp_c_termination") {
    throw new OnboardingTransactionRequestValidationError(
      `${name} must be repo_owned_synthetic_mvp_c_termination`,
    );
  }

  return value;
}
