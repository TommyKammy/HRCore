import { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";
import {
  assertSupportedFields,
  requireDate,
  requireNonEmpty,
  requireRecord,
  requireTimestamp,
} from "./onboarding-transaction-request-validation.js";

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

type TransferTransactionRequestFixtureOverrides = {
  person?: Partial<TransferTransactionRequestPersonInput>;
  payload?: Partial<Record<string, unknown>>;
} & Partial<Omit<TransferTransactionRequestInput, "person" | "payload">>;

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
    payload: parseTransferPayload(request.payload),
  };
}

export function parseTransferPayload(
  input: unknown,
): TransferTransactionRequestPayload {
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

export function serializeTransferPayload(
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

function parsePerson(input: unknown): TransferTransactionRequestPersonInput {
  const person = requireRecord("person", input);
  assertSupportedFields("person", person, transferPersonFields);

  return {
    id: requireNonEmpty("person.id", person.id),
    displayName: requireNonEmpty("person.displayName", person.displayName),
    createdAt: requireTimestamp("person.createdAt", person.createdAt),
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
