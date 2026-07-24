import {
  signP2ListSyntheticDatasetManifest,
  type P2ListSyntheticDatasetManifest,
  type P2ListSource,
} from "./p2list-read-model-types.js";

export interface P2ListEmployeeFixtureRow {
  personId: string;
  employmentId: string;
  employeeId: string;
  displayName: string;
  employmentStatus: "active";
  organizationCode: string;
  positionCode: string;
  hireDate: string;
  assignmentId: string;
  assignmentCode: string;
}

export interface P2ListLifecycleFixtureRow {
  personId: string;
  transactionRequestId: string;
  displayName: string;
  requestType: "hire";
  status: "submitted";
  requestedAt: string;
  correlationId: string;
  payloadVersion: "mvp_a_onboarding_v1";
  payloadJson: string;
  organizationCode: string;
  effectiveDate: string;
}

export function createP2ListEmployeeFixtureRows(
  count: number,
  options: {
    displayName?: string;
    organizationCode?: string;
  } = {},
): P2ListEmployeeFixtureRow[] {
  assertFixtureCount(count);
  return Array.from({ length: count }, (_, index) => {
    const sequence = String(index + 1).padStart(3, "0");
    return {
      personId: `p2list-person-${sequence}`,
      employmentId: `p2list-employment-${sequence}`,
      employeeId: `EMP-${sequence}`,
      displayName: options.displayName ?? `Synthetic Employee ${sequence}`,
      employmentStatus: "active",
      organizationCode: options.organizationCode ?? "ORG-SYNTHETIC",
      positionCode: `POS-${sequence}`,
      hireDate: "2026-01-01",
      assignmentId: `p2list-assignment-${sequence}`,
      assignmentCode: `ASSIGN-${sequence}`,
    };
  });
}

export function createP2ListLifecycleFixtureRows(
  count: number,
  options: {
    requestedAt?: string;
    organizationCode?: string;
  } = {},
): P2ListLifecycleFixtureRow[] {
  assertFixtureCount(count);
  return Array.from({ length: count }, (_, index) => {
    const sequence = String(index + 1).padStart(3, "0");
    const organizationCode =
      options.organizationCode ?? "ORG-LIFECYCLE-SYNTHETIC";
    const effectiveDate = "2026-08-01";
    return {
      personId: `p2list-lifecycle-person-${sequence}`,
      transactionRequestId: `p2list-transaction-${sequence}`,
      displayName: `Synthetic Lifecycle Subject ${sequence}`,
      requestType: "hire",
      status: "submitted",
      requestedAt:
        options.requestedAt ??
        new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
      correlationId: `p2list-correlation-${sequence}`,
      payloadVersion: "mvp_a_onboarding_v1",
      payloadJson: JSON.stringify({
        tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
        effectiveDate,
        employment: {
          id: `future-employment-${sequence}`,
          employmentCode: `FUTURE-EMP-${sequence}`,
          startDate: effectiveDate,
        },
        assignment: {
          id: `future-assignment-${sequence}`,
          assignmentCode: `FUTURE-ASSIGN-${sequence}`,
          departmentReference: organizationCode,
          legalEntityReference: "LEGAL-SYNTHETIC",
          managerReference: "MANAGER-SYNTHETIC",
          positionCode: `FUTURE-POS-${sequence}`,
        },
        workEmailExpectation: {
          contactPointId: `future-contact-${sequence}`,
          value: `future-${sequence}@example.test`,
        },
      }),
      organizationCode,
      effectiveDate,
    };
  });
}

export function createP2ListFixtureManifest(
  input: {
    datasetReference: string;
    employees?: readonly P2ListEmployeeFixtureRow[];
    lifecycleRequests?: readonly P2ListLifecycleFixtureRow[];
    additionalSourceRowPrimaryKeys?: Partial<
      Record<P2ListSource, readonly string[]>
    >;
  },
  secret: string,
): P2ListSyntheticDatasetManifest {
  const employees = input.employees ?? [];
  const lifecycleRequests = input.lifecycleRequests ?? [];
  const additional = input.additionalSourceRowPrimaryKeys ?? {};
  return signP2ListSyntheticDatasetManifest(
    {
      evidenceType: "repo_owned_synthetic_fixture",
      datasetReference: input.datasetReference,
      tenantEnvironmentId: "repo_owned_synthetic_p2list",
      sourceRowPrimaryKeys: {
        person: uniqueSorted([
          ...employees.map((row) => row.personId),
          ...lifecycleRequests.map((row) => row.personId),
          ...(additional.person ?? []),
        ]),
        employment: uniqueSorted([
          ...employees.map((row) => row.employmentId),
          ...(additional.employment ?? []),
        ]),
        assignment: uniqueSorted([
          ...employees.map((row) => row.assignmentId),
          ...(additional.assignment ?? []),
        ]),
        transaction_request: uniqueSorted([
          ...lifecycleRequests.map((row) => row.transactionRequestId),
          ...(additional.transaction_request ?? []),
        ]),
        audit_event: uniqueSorted(additional.audit_event ?? []),
      },
    },
    secret,
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function assertFixtureCount(count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > 101) {
    throw new RangeError("P2LIST fixture count must be between 0 and 101.");
  }
}
