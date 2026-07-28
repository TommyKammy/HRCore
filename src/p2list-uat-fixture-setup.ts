import { fileURLToPath } from "node:url";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { p2ListPermissions } from "./p2list-contract.js";
import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";
import {
  createP2ListEmployeeFixtureRows,
  createP2ListFixtureManifest,
  createP2ListLifecycleFixtureRows,
  type P2ListEmployeeFixtureRow,
  type P2ListLifecycleFixtureRow,
} from "./p2list-read-model-fixtures.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";

export const p2ListUatManifestSecret =
  "p2list-uat-manifest-local-synthetic-secret-2026";
export const p2ListUatCursorSecret =
  "p2list-uat-cursor-local-synthetic-secret-2026";
export const p2ListUatSupportCorrelationId = "p2list-uat-support-correlation";
export const p2ListUatTokens = {
  hrOperator: "p2list-uat-hr-operator-token-2026-local-only",
  approver: "p2list-uat-approver-token-2026-local-only",
  support: "p2list-uat-support-token-2026-local-only",
} as const;

const employeeOrganization = "ORG-UAT-OVER-CAP";
const lifecycleOrganization = "ORG-LIFECYCLE-SYNTHETIC";
const tenantId = "tenant-repo-owned-synthetic";

export interface P2ListUatFixtureResult {
  apiEnvironmentPath: string;
  databasePath: string;
  employeeCount: number;
  lifecycleRequestCount: number;
  manifestPath: string;
  outputDirectory: string;
  supportCorrelationId: string;
  webEnvironmentPath: string;
}

export async function prepareP2ListUatFixture(
  outputDirectory = path.resolve(".local/p2list-uat"),
): Promise<P2ListUatFixtureResult> {
  const resolvedOutputDirectory = path.resolve(outputDirectory);
  const databasePath = path.join(resolvedOutputDirectory, "hrcore.sqlite");
  const manifestPath = path.join(resolvedOutputDirectory, "manifest.json");
  const apiEnvironmentPath = path.join(
    resolvedOutputDirectory,
    "api-environment.sh",
  );
  const webEnvironmentPath = path.join(
    resolvedOutputDirectory,
    "web-environment.sh",
  );

  await rm(resolvedOutputDirectory, { recursive: true, force: true });
  await mkdir(resolvedOutputDirectory, { recursive: true });

  const employees = createUatEmployees();
  const lifecycleRequests = createUatLifecycleRequests(employees);
  const auditEventId = "p2list-uat-audit-event-001";
  const database = await openLocalSyntheticWritebackDatabase(
    `file:${databasePath}`,
  );
  try {
    seedEmployees(database, employees);
    seedLifecycleRequests(database, lifecycleRequests);
    seedSupportAuditEvidence(database, auditEventId);
  } finally {
    database.close();
  }

  const manifest = createP2ListFixtureManifest(
    {
      datasetReference: "p2list-formal-uat-100-employees-three-lifecycle-types",
      employees,
      lifecycleRequests,
      additionalSourceRowPrimaryKeys: { audit_event: [auditEventId] },
    },
    p2ListUatManifestSecret,
  );
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const actorRegistry = createActorRegistry();
  await writeFile(
    apiEnvironmentPath,
    [
      "# Generated repository-owned synthetic P2LIST UAT environment.",
      `export DATABASE_URL=${shellQuote(`file:${relativeFromRepository(databasePath)}`)}`,
      `export P2LIST_EMPLOYEE_MANIFEST_PATH=${shellQuote(relativeFromRepository(manifestPath))}`,
      `export P2LIST_EMPLOYEE_MANIFEST_SECRET=${shellQuote(p2ListUatManifestSecret)}`,
      `export P2LIST_EMPLOYEE_CURSOR_SECRET=${shellQuote(p2ListUatCursorSecret)}`,
      `export P2LIST_EMPLOYEE_ACTORS_JSON=${shellQuote(JSON.stringify(actorRegistry))}`,
      `export P2LIST_UAT_HR_OPERATOR_TOKEN=${shellQuote(p2ListUatTokens.hrOperator)}`,
      `export P2LIST_UAT_APPROVER_TOKEN=${shellQuote(p2ListUatTokens.approver)}`,
      `export P2LIST_UAT_SUPPORT_TOKEN=${shellQuote(p2ListUatTokens.support)}`,
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
  await writeFile(
    webEnvironmentPath,
    [
      "# Generated repository-owned synthetic P2LIST UAT browser tokens.",
      `export VITE_P2LIST_HR_OPERATOR_TOKEN=${shellQuote(p2ListUatTokens.hrOperator)}`,
      `export VITE_P2LIST_APPROVER_TOKEN=${shellQuote(p2ListUatTokens.approver)}`,
      `export VITE_P2LIST_SUPPORT_TOKEN=${shellQuote(p2ListUatTokens.support)}`,
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );

  return {
    apiEnvironmentPath,
    databasePath,
    employeeCount: employees.length,
    lifecycleRequestCount: lifecycleRequests.length,
    manifestPath,
    outputDirectory: resolvedOutputDirectory,
    supportCorrelationId: p2ListUatSupportCorrelationId,
    webEnvironmentPath,
  };
}

function createUatEmployees(): P2ListEmployeeFixtureRow[] {
  return createP2ListEmployeeFixtureRows(101).map((row, index) => ({
    ...row,
    displayName:
      index < 25
        ? "UAT-G100-G26-G25 Equal Sort Employee"
        : index === 25
          ? "UAT-G100-G26 Equal Sort Employee"
          : index < 100
            ? "UAT-G100 Equal Sort Employee"
            : "UAT-G101 Over Cap Employee",
    organizationCode: employeeOrganization,
  }));
}

function createUatLifecycleRequests(
  employees: readonly P2ListEmployeeFixtureRow[],
): P2ListLifecycleFixtureRow[] {
  const onboarding = createP2ListLifecycleFixtureRows(1, {
    organizationCode: lifecycleOrganization,
  })[0];
  const transferEmployee = requireEmployee(employees, 1);
  const terminationEmployee = requireEmployee(employees, 2);

  return [
    onboarding,
    {
      personId: transferEmployee.personId,
      transactionRequestId: "p2list-transaction-transfer-001",
      displayName: "Synthetic Transfer Subject",
      requestType: "transfer",
      status: "submitted",
      requestedAt: "2026-07-02T00:00:00.000Z",
      correlationId: "p2list-lifecycle-transfer-correlation",
      payloadVersion: "mvp_b_transfer_v1",
      payloadJson: JSON.stringify({
        tenantEnvironmentId: "repo_owned_synthetic_mvp_b_transfer",
        effectiveDate: "2026-08-02",
        currentAssignment: {
          assignmentId: transferEmployee.assignmentId,
          assignmentCode: transferEmployee.assignmentCode,
        },
        targetAssignment: {
          organizationReference: lifecycleOrganization,
          departmentReference: "DEPT-UAT-TRANSFER",
          managerReference: "MANAGER-UAT-001",
          positionCode: "POS-UAT-TRANSFER",
        },
        transferReason: {
          reasonCode: "team_change",
          note: "Repository-owned synthetic P2LIST UAT transfer",
        },
      }),
      organizationCode: lifecycleOrganization,
      effectiveDate: "2026-08-02",
    },
    {
      personId: terminationEmployee.personId,
      transactionRequestId: "p2list-transaction-termination-001",
      displayName: "Synthetic Termination Subject",
      requestType: "terminate",
      status: "submitted",
      requestedAt: "2026-07-03T00:00:00.000Z",
      correlationId: "p2list-lifecycle-termination-correlation",
      payloadVersion: "mvp_c_termination_v1",
      payloadJson: JSON.stringify({
        tenantEnvironmentId: "repo_owned_synthetic_mvp_c_termination",
        effectiveDate: "2026-08-03",
        currentEmployment: {
          employmentId: terminationEmployee.employmentId,
          employmentCode: terminationEmployee.employeeId,
        },
        currentAssignment: {
          assignmentId: terminationEmployee.assignmentId,
          assignmentCode: terminationEmployee.assignmentCode,
        },
        terminationReason: {
          reasonCode: "resignation",
          note: "Repository-owned synthetic P2LIST UAT termination",
        },
      }),
      organizationCode: terminationEmployee.organizationCode,
      effectiveDate: "2026-08-03",
    },
  ];
}

function requireEmployee(
  employees: readonly P2ListEmployeeFixtureRow[],
  index: number,
): P2ListEmployeeFixtureRow {
  const employee = employees[index];
  if (!employee) {
    throw new Error("P2LIST UAT employee fixture is incomplete.");
  }
  return employee;
}

function seedEmployees(
  database: OnboardingTransactionRequestDatabase,
  employees: readonly P2ListEmployeeFixtureRow[],
): void {
  const person = database.prepare(
    "INSERT INTO person (id, display_name, created_at) VALUES (?, ?, ?)",
  );
  const employment = database.prepare(
    `
      INSERT INTO employment (
        id, person_id, employment_code, status_code, start_date, end_date
      )
      VALUES (?, ?, ?, ?, ?, NULL)
    `,
  );
  const assignment = database.prepare(
    `
      INSERT INTO assignment (
        id, person_id, employment_id, assignment_code, organization_code,
        position_code, start_date, end_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `,
  );
  for (const row of employees) {
    person.run(row.personId, row.displayName, "2026-01-01T00:00:00.000Z");
    employment.run(
      row.employmentId,
      row.personId,
      row.employeeId,
      row.employmentStatus,
      row.hireDate,
    );
    assignment.run(
      row.assignmentId,
      row.personId,
      row.employmentId,
      row.assignmentCode,
      row.organizationCode,
      row.positionCode,
      row.hireDate,
    );
  }
}

function seedLifecycleRequests(
  database: OnboardingTransactionRequestDatabase,
  lifecycleRequests: readonly P2ListLifecycleFixtureRow[],
): void {
  const person = database.prepare(
    "INSERT OR IGNORE INTO person (id, display_name, created_at) VALUES (?, ?, ?)",
  );
  const request = database.prepare(
    `
      INSERT INTO transaction_request (
        id, person_id, request_type, status_code, requested_at,
        correlation_id, payload_version, payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  for (const row of lifecycleRequests) {
    person.run(row.personId, row.displayName, "2026-01-01T00:00:00.000Z");
    request.run(
      row.transactionRequestId,
      row.personId,
      row.requestType,
      row.status,
      row.requestedAt,
      row.correlationId,
      row.payloadVersion,
      row.payloadJson,
    );
  }
}

function seedSupportAuditEvidence(
  database: OnboardingTransactionRequestDatabase,
  eventId: string,
): void {
  database
    .prepare(
      `
        INSERT INTO p2list_audit_event (
          event_id, event_type, event_version, occurred_at, actor_id,
          actor_role, evaluated_permission, data_scope_id, filter_fingerprint,
          sort, page_size, row_count, resource_type, correlation_id,
          policy_decision, reason_code, export_schema_version, duration_ms,
          poc_marker
        )
        VALUES (
          ?, 'employee_list.viewed', 'p2list_audit_v1',
          '2026-07-01T00:00:00.000Z', 'actor-hr-operator', 'hr_operator',
          'employee:list:read', 'organization:ORG-UAT-OVER-CAP', NULL,
          'employeeId:asc', 25, 25, 'employee', ?, 'allow', NULL, NULL, 7,
          'synthetic_poc'
        )
      `,
    )
    .run(eventId, p2ListUatSupportCorrelationId);
}

function createActorRegistry() {
  const organizationCodes = [employeeOrganization, lifecycleOrganization];
  return [
    {
      token: p2ListUatTokens.hrOperator,
      actor: {
        actorId: "actor-hr-operator",
        actorRole: "hr_operator",
        tenantId,
        permissions: [
          p2ListPermissions.employeeListRead,
          p2ListPermissions.employeeDetailRead,
          p2ListPermissions.employeeListExport,
          p2ListPermissions.lifecycleRequestListRead,
          p2ListPermissions.lifecycleRequestDetailRead,
          p2ListPermissions.lifecycleRequestListExport,
          p2ListPermissions.csvDownload,
        ],
        dataScope: { organizationCodes },
      },
    },
    {
      token: p2ListUatTokens.approver,
      actor: {
        actorId: "actor-approver",
        actorRole: "approver",
        tenantId,
        permissions: [],
        dataScope: { organizationCodes },
      },
    },
    {
      token: p2ListUatTokens.support,
      actor: {
        actorId: "actor-hr-ops-support",
        actorRole: "hr_ops_support",
        tenantId,
        permissions: [p2ListPermissions.supportCorrelationRead],
        dataScope: { correlationIds: [p2ListUatSupportCorrelationId] },
      },
    },
  ];
}

function relativeFromRepository(value: string): string {
  const relative = path.relative(process.cwd(), value);
  return relative.startsWith("..") ? value : relative;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  prepareP2ListUatFixture()
    .then((result) => {
      console.log(
        [
          `Prepared ${result.employeeCount} employees and ${result.lifecycleRequestCount} lifecycle requests.`,
          `API environment: ${relativeFromRepository(result.apiEnvironmentPath)}`,
          `Web environment: ${relativeFromRepository(result.webEnvironmentPath)}`,
          `Support correlation: ${result.supportCorrelationId}`,
        ].join("\n"),
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
