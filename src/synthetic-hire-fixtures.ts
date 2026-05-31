import {
  type SyntheticHireAssignmentInput,
  type SyntheticHireContactPointInput,
  type SyntheticHireEmploymentInput,
  type SyntheticHireInput,
  type SyntheticHirePersonInput,
  type SyntheticHireRequestInput,
  type SyntheticHireTransactionRequestInput,
} from "./synthetic-hire-types.js";
import {
  syntheticAuditActorId,
  syntheticAuditPocMarker,
} from "./synthetic-hire-constants.js";

export type SyntheticHireFixtureOverrides = {
  person?: Partial<SyntheticHirePersonInput>;
  employment?: Partial<SyntheticHireEmploymentInput>;
  assignment?: Partial<SyntheticHireAssignmentInput>;
  contactPoint?: Partial<SyntheticHireContactPointInput> | null;
};

export type SyntheticHireRequestFixtureOverrides = {
  person?: Partial<SyntheticHirePersonInput>;
  transactionRequest?: Partial<SyntheticHireTransactionRequestInput>;
};

export function createSyntheticHireFixture(
  overrides: SyntheticHireFixtureOverrides = {},
): SyntheticHireInput {
  const person: SyntheticHirePersonInput = {
    id: "person-syn-hire-001",
    displayName: "Synthetic Hire One",
    createdAt: "2026-05-18T00:00:00Z",
    ...overrides.person,
  };
  const employment: SyntheticHireEmploymentInput = {
    id: "employment-syn-hire-001",
    personId: person.id,
    employmentCode: "EMP-SYN-HIRE-001",
    statusCode: "active",
    startDate: "2026-05-18",
    endDate: null,
    ...overrides.employment,
  };
  const assignment: SyntheticHireAssignmentInput = {
    id: "assignment-syn-hire-001",
    personId: person.id,
    employmentId: employment.id,
    assignmentCode: "ASN-SYN-HIRE-001",
    organizationCode: "ORG-SYN-001",
    positionCode: "POS-SYN-001",
    startDate: "2026-05-18",
    endDate: null,
    ...overrides.assignment,
  };
  const contactPoint =
    overrides.contactPoint === null
      ? undefined
      : {
          id: "contact-point-syn-hire-001",
          personId: person.id,
          contactType: "work_email" as const,
          value: "synthetic.hire.001@example.invalid",
          isPrimary: true,
          createdAt: "2026-05-18T00:00:00Z",
          ...overrides.contactPoint,
        };

  return {
    person,
    employment,
    assignment,
    audit: {
      actorId: syntheticAuditActorId,
      correlationId: "correlation-syn-hire-direct-001",
      occurredAt: person.createdAt,
      pocMarker: syntheticAuditPocMarker,
    },
    ...(contactPoint ? { contactPoint } : {}),
  };
}

export function createSyntheticHireRequestFixture(
  overrides: SyntheticHireRequestFixtureOverrides = {},
): SyntheticHireRequestInput {
  const person: SyntheticHirePersonInput = {
    id: "person-syn-hire-001",
    displayName: "Synthetic Hire One",
    createdAt: "2026-05-18T00:00:00Z",
    ...overrides.person,
  };
  const transactionRequest: SyntheticHireTransactionRequestInput = {
    id: "transaction-request-syn-hire-001",
    personId: person.id,
    requestType: "hire",
    statusCode: "submitted",
    requestedAt: "2026-05-18T00:00:00Z",
    correlationId: "correlation-syn-hire-001",
    ...overrides.transactionRequest,
  };

  return {
    person,
    transactionRequest,
  };
}
