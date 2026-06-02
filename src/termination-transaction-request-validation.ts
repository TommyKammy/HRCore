import { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";
import {
  assertSupportedFields,
  requireDate,
  requireNonEmpty,
  requireRecord,
  requireTimestamp,
} from "./onboarding-transaction-request-validation.js";
import {
  terminationCurrentAssignmentFields,
  terminationCurrentEmploymentFields,
  terminationPayloadFields,
  terminationPersonFields,
  terminationReasonFields,
  terminationTransactionRequestFields,
} from "./termination-transaction-request-fields.js";
import { requireTerminationTenantEnvironmentId } from "./termination-transaction-request-tenant-environment.js";
import type {
  TerminationTransactionRequestCurrentAssignmentPayload,
  TerminationTransactionRequestCurrentEmploymentPayload,
  TerminationTransactionRequestInput,
  TerminationTransactionRequestPayload,
  TerminationTransactionRequestPersonInput,
  TerminationTransactionRequestReasonPayload,
} from "./termination-transaction-request-types.js";

export { OnboardingTransactionRequestValidationError as TerminationTransactionRequestValidationError };

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
