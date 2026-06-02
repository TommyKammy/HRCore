import type {
  TerminationTransactionRequestInput,
  TerminationTransactionRequestPayload,
  TerminationTransactionRequestPersonInput,
} from "./termination-transaction-request-types.js";

type TerminationTransactionRequestFixtureOverrides = {
  person?: Partial<TerminationTransactionRequestPersonInput>;
  payload?: Partial<Record<string, unknown>>;
} & Partial<Omit<TerminationTransactionRequestInput, "person" | "payload">>;

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
