import type {
  OnboardingTransactionRequestDatabase,
  SqlValue,
} from "./onboarding-transaction-request-types.js";
import { parseOnboardingPayload } from "./onboarding-transaction-request-parser.js";
import { parseTerminationPayload } from "./termination-transaction-request-validation.js";
import { parseTransferPayload } from "./transfer-transaction-request-contract.js";
import {
  p2ListDefaultLimit,
  p2ListEmployeeSortFields,
  p2ListEmployeeStatuses,
  p2ListLifecycleSortFields,
  p2ListLifecycleStatuses,
  p2ListMaximumDateRangeDays,
  p2ListMaximumLimit,
  p2ListMaximumQueryLength,
  p2ListPermissions,
  p2ListPersistedLifecycleTypeMap,
  p2ListQueryPattern,
} from "./p2list-contract.js";
import {
  P2ListCursorManager,
  type P2ListCursorState,
} from "./p2list-cursor.js";
import {
  fingerprintP2ListValue,
  P2ListReadModelError,
  P2ListVerifiedSyntheticDataset,
  requireBoundedString,
  requireRecord,
  requireUniqueStringArray,
  type P2ListActorContext,
  type P2ListDataScope,
  type P2ListDirection,
} from "./p2list-read-model-types.js";

type EmployeeSort = (typeof p2ListEmployeeSortFields)[number];
type EmployeeStatus = (typeof p2ListEmployeeStatuses)[number];
type LifecycleSort = (typeof p2ListLifecycleSortFields)[number];
type LifecycleStatus = (typeof p2ListLifecycleStatuses)[number];
type LifecycleRequestType =
  (typeof p2ListPersistedLifecycleTypeMap)[keyof typeof p2ListPersistedLifecycleTypeMap];

export interface P2ListEmployeeItem {
  personId: string;
  employeeId: string;
  displayName: string;
  employmentStatus: EmployeeStatus;
  organizationCode: string | null;
  positionCode: string | null;
  hireDate: string;
  terminationDate: string | null;
}

export interface P2ListLifecycleItem {
  transactionRequestId: string;
  requestType: LifecycleRequestType;
  status: LifecycleStatus;
  subjectPersonId: string;
  subjectEmployeeId: string | null;
  subjectDisplayName: string;
  organizationCode: string;
  decidedBy: string | null;
  requestedAt: string;
  effectiveDate: string;
}

export interface P2ListPageInfo {
  limit: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface P2ListPage<TItem, TFilters> {
  items: TItem[];
  pageInfo: P2ListPageInfo;
  appliedFilters: TFilters;
}

export interface P2ListEmployeeFilters {
  q?: string;
  employeeId?: string;
  employmentStatus?: EmployeeStatus;
  organizationCode?: string;
  asOf?: string;
}

export type P2ListEmployeeAppliedFilters = P2ListEmployeeFilters & {
  asOf: string;
};

export interface P2ListLifecycleFilters {
  requestType?: readonly LifecycleRequestType[];
  status?: readonly LifecycleStatus[];
  subjectEmployeeId?: string;
  q?: string;
  organizationCode?: string;
  decidedBy?: string;
  requestedFrom?: string;
  requestedTo?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  correlationId?: string;
}

interface P2ListQueryBase {
  actor: P2ListActorContext;
  provenance: P2ListVerifiedSyntheticDataset;
  direction?: P2ListDirection;
  limit?: number;
  cursor?: string;
}

export interface P2ListEmployeeQuery extends P2ListQueryBase {
  filters?: P2ListEmployeeFilters;
  sort?: EmployeeSort;
  acceptedAt: string;
}

export interface P2ListLifecycleQuery extends P2ListQueryBase {
  filters?: P2ListLifecycleFilters;
  sort?: LifecycleSort;
}

interface NormalizedActorContext {
  actorId: string;
  tenantId: string;
  permissions: string[];
  dataScope: Required<P2ListDataScope>;
  fingerprint: string;
}

interface EmployeeDatabaseRow {
  person_id: string;
  employment_id: string;
  employee_id: string;
  display_name: string;
  employment_status: string;
  organization_code: string | null;
  position_code: string | null;
  hire_date: string;
  termination_date: string | null;
}

interface ValidatedLifecycleRow {
  transactionRequestId: string;
  persistedRequestType: "hire" | "change" | "transfer" | "terminate";
  requestType: LifecycleRequestType;
  status: LifecycleStatus;
  subjectPersonId: string;
  subjectEmploymentSourceId: string | null;
  subjectEmployeeId: string | null;
  subjectDisplayName: string;
  organizationCode: string;
  assignmentSourceId: string | null;
  decisionAuditSourceId: string | null;
  decidedBy: string | null;
  requestedAt: string;
  effectiveDate: string;
  correlationId: string | null;
}

interface UnvalidatedLifecycleAuditEvent {
  id: unknown;
  actorId: unknown;
  action: unknown;
  occurredAt: unknown;
  pocMarker: unknown;
}

const employeeFilterKeys = [
  "q",
  "employeeId",
  "employmentStatus",
  "organizationCode",
  "asOf",
] as const;
const lifecycleFilterKeys = [
  "requestType",
  "status",
  "subjectEmployeeId",
  "q",
  "organizationCode",
  "decidedBy",
  "requestedFrom",
  "requestedTo",
  "effectiveFrom",
  "effectiveTo",
  "correlationId",
] as const;
const actorKeys = ["actorId", "tenantId", "permissions", "dataScope"] as const;
const scopeKeys = [
  "organizationCodes",
  "personIds",
  "employeeIds",
  "correlationIds",
] as const;
const queryPattern = new RegExp(p2ListQueryPattern, "u");
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const persistedLifecycleTypes = [
  "hire",
  "change",
  "transfer",
  "terminate",
] as const;
const lifecycleDecisionAction = {
  returned: "return",
  rejected: "reject",
  cancelled: "cancel",
  approved: "approve",
  completed: "approve",
} as const;
const lifecycleActionPrefix = {
  hire: "mvp_a.onboarding",
  change: "mvp_b.transfer",
  transfer: "mvp_b.transfer",
  terminate: "mvp_c.termination",
} as const;

export class P2ListReadModelRepository {
  readonly #db: OnboardingTransactionRequestDatabase;
  readonly #cursors: P2ListCursorManager;

  constructor(
    db: OnboardingTransactionRequestDatabase,
    cursors: P2ListCursorManager,
  ) {
    this.#db = db;
    this.#cursors = cursors;
  }

  listEmployees(
    input: P2ListEmployeeQuery,
  ): P2ListPage<P2ListEmployeeItem, P2ListEmployeeAppliedFilters> {
    const provenance = requireVerifiedDataset(input?.provenance);
    const actor = normalizeActorContext(
      input?.actor,
      p2ListPermissions.employeeListRead,
      false,
    );
    const sort = normalizeAllowedValue(
      input?.sort ?? "employeeId",
      p2ListEmployeeSortFields,
      "invalid_sort",
    );
    const direction = normalizeDirection(input?.direction);
    const limit = normalizeLimit(input?.limit);
    const suppliedFilters = normalizeEmployeeFilters(input?.filters);
    const cursorState = input?.cursor
      ? this.#readCursor(
          input.cursor,
          "employee",
          sort,
          direction,
          actor,
          provenance,
        )
      : undefined;
    const resolvedAsOf = resolveEmployeeAsOf(
      suppliedFilters.asOf,
      input?.acceptedAt,
      cursorState,
    );
    const appliedFilters: P2ListEmployeeAppliedFilters = {
      ...suppliedFilters,
      asOf: resolvedAsOf,
    };
    const filterFingerprint = fingerprintP2ListValue(appliedFilters);
    validateCursorFilter(cursorState, filterFingerprint);

    this.#assertEmployeeProjectionIntegrity(provenance, resolvedAsOf);
    const rows = this.#queryEmployees({
      actor,
      provenance,
      filters: appliedFilters,
      sort,
      direction,
      limit,
      cursorState,
    });
    return buildEmployeePage(
      rows,
      limit,
      appliedFilters,
      sort,
      direction,
      actor,
      provenance,
      filterFingerprint,
      resolvedAsOf,
      this.#cursors,
    );
  }

  listLifecycleRequests(
    input: P2ListLifecycleQuery,
  ): P2ListPage<P2ListLifecycleItem, P2ListLifecycleFilters> {
    const provenance = requireVerifiedDataset(input?.provenance);
    const actor = normalizeActorContext(
      input?.actor,
      p2ListPermissions.lifecycleRequestListRead,
      true,
    );
    const sort = normalizeAllowedValue(
      input?.sort ?? "requestedAt",
      p2ListLifecycleSortFields,
      "invalid_sort",
    );
    const direction = normalizeDirection(input?.direction ?? "desc");
    const limit = normalizeLimit(input?.limit);
    const appliedFilters = normalizeLifecycleFilters(
      input?.filters,
      actor.permissions,
    );
    const filterFingerprint = fingerprintP2ListValue(appliedFilters);
    const cursorState = input?.cursor
      ? this.#readCursor(
          input.cursor,
          "lifecycleRequest",
          sort,
          direction,
          actor,
          provenance,
        )
      : undefined;
    validateCursorFilter(cursorState, filterFingerprint);

    const validatedRows = this.#loadValidatedLifecycleRows(provenance);
    const rows = this.#queryLifecycleRows({
      actor,
      validatedRows,
      filters: appliedFilters,
      sort,
      direction,
      limit,
      cursorState,
    });
    return buildLifecyclePage(
      rows,
      limit,
      appliedFilters,
      sort,
      direction,
      actor,
      provenance,
      filterFingerprint,
      this.#cursors,
    );
  }

  #readCursor(
    token: string,
    resource: "employee" | "lifecycleRequest",
    sort: string,
    direction: P2ListDirection,
    actor: NormalizedActorContext,
    provenance: P2ListVerifiedSyntheticDataset,
  ): Readonly<P2ListCursorState> {
    const state = this.#cursors.read(token);
    if (
      state.resource !== resource ||
      state.sort !== sort ||
      state.direction !== direction ||
      state.datasetFingerprint !== provenance.fingerprint
    ) {
      throw cursorInvalid();
    }
    if (state.authorizationContextFingerprint !== actor.fingerprint) {
      throw new P2ListReadModelError(
        "permission_denied",
        "The cursor is not authorized for this actor context.",
      );
    }
    return state;
  }

  #assertEmployeeProjectionIntegrity(
    provenance: P2ListVerifiedSyntheticDataset,
    asOf: string,
  ): void {
    const personIds = provenance.values("person");
    const employmentIds = provenance.values("employment");
    if (personIds.length === 0 || employmentIds.length === 0) {
      return;
    }
    const assignmentParameters: SqlValue[] = [];
    const assignmentIds = provenance.values("assignment");
    const assignmentBound = inPredicate(
      "assignment.id",
      assignmentIds,
      assignmentParameters,
    );
    const sourceParameters: SqlValue[] = [];
    const personPredicate = inPredicate(
      "person.id",
      personIds,
      sourceParameters,
    );
    const employmentPredicate = inPredicate(
      "employment.id",
      employmentIds,
      sourceParameters,
    );
    const rows = queryAll(
      this.#db,
      `
        SELECT
          employment.id AS employment_id,
          count(assignment.id) AS assignment_count,
          sum(CASE WHEN ${assignmentBound} THEN 1 ELSE 0 END) AS bound_assignment_count
        FROM person
        JOIN employment ON employment.person_id = person.id
        LEFT JOIN assignment
          ON assignment.person_id = person.id
         AND assignment.employment_id = employment.id
         AND assignment.start_date <= ?
         AND (assignment.end_date IS NULL OR assignment.end_date >= ?)
        WHERE ${personPredicate}
          AND ${employmentPredicate}
          AND employment.start_date <= ?
          AND (employment.end_date IS NULL OR employment.end_date >= ?)
        GROUP BY employment.id
      `,
      [...assignmentParameters, asOf, asOf, ...sourceParameters, asOf, asOf],
    );
    for (const row of rows) {
      const assignmentCount = requireDatabaseNumber(row.assignment_count);
      const boundCount = requireDatabaseNumber(row.bound_assignment_count);
      if (assignmentCount > 1 || (assignmentCount === 1 && boundCount !== 1)) {
        throw dataScopeDenied();
      }
    }
  }

  #queryEmployees(options: {
    actor: NormalizedActorContext;
    provenance: P2ListVerifiedSyntheticDataset;
    filters: P2ListEmployeeAppliedFilters;
    sort: EmployeeSort;
    direction: P2ListDirection;
    limit: number;
    cursorState?: Readonly<P2ListCursorState>;
  }): EmployeeDatabaseRow[] {
    const { actor, provenance, filters, sort, direction, limit, cursorState } =
      options;
    const parameters: SqlValue[] = [filters.asOf, filters.asOf];
    const clauses = [
      inPredicate("person.id", provenance.values("person"), parameters),
      inPredicate("employment.id", provenance.values("employment"), parameters),
      `employment.start_date <= ?`,
      `(employment.end_date IS NULL OR employment.end_date >= ?)`,
    ];
    parameters.push(filters.asOf, filters.asOf);
    const assignmentEvidence = inPredicate(
      "assignment.id",
      provenance.values("assignment"),
      parameters,
    );
    clauses.push(`(assignment.id IS NULL OR ${assignmentEvidence})`);
    clauses.push(
      buildScopePredicate(
        actor.dataScope,
        {
          organization: "assignment.organization_code",
          person: "person.id",
          employee: "employment.employment_code",
        },
        parameters,
      ),
    );
    if (filters.q) {
      clauses.push(
        `(employment.employment_code = ? OR person.display_name LIKE ? ESCAPE '\\')`,
      );
      parameters.push(filters.q, `${escapeLike(filters.q)}%`);
    }
    if (filters.employeeId) {
      clauses.push(`employment.employment_code = ?`);
      parameters.push(filters.employeeId);
    }
    if (filters.employmentStatus) {
      clauses.push(`employment.status_code = ?`);
      parameters.push(filters.employmentStatus);
    }
    if (filters.organizationCode) {
      clauses.push(`assignment.organization_code = ?`);
      parameters.push(filters.organizationCode);
    }

    const sortColumn = {
      employeeId: "employment.employment_code",
      displayName: "person.display_name",
      hireDate: "employment.start_date",
    }[sort];
    if (cursorState) {
      clauses.push(
        keysetPredicate(
          sortColumn,
          "employment.id",
          direction,
          cursorState,
          parameters,
        ),
      );
    }
    parameters.push(limit + 1);
    return queryAll(
      this.#db,
      `
        SELECT
          person.id AS person_id,
          employment.id AS employment_id,
          employment.employment_code AS employee_id,
          person.display_name,
          employment.status_code AS employment_status,
          assignment.organization_code,
          assignment.position_code,
          employment.start_date AS hire_date,
          employment.end_date AS termination_date
        FROM person
        JOIN employment ON employment.person_id = person.id
        LEFT JOIN assignment
          ON assignment.person_id = person.id
         AND assignment.employment_id = employment.id
         AND assignment.start_date <= ?
         AND (assignment.end_date IS NULL OR assignment.end_date >= ?)
        WHERE ${clauses.join("\n          AND ")}
        ORDER BY ${sortColumn} ${direction.toUpperCase()},
          employment.id ${direction.toUpperCase()}
        LIMIT ?
      `,
      parameters,
    ).map(parseEmployeeDatabaseRow);
  }

  #loadValidatedLifecycleRows(
    provenance: P2ListVerifiedSyntheticDataset,
  ): ValidatedLifecycleRow[] {
    const transactionRequestIds = provenance.values("transaction_request");
    if (transactionRequestIds.length === 0) {
      return [];
    }
    const requestParameters: SqlValue[] = [];
    const requestRows = queryAll(
      this.#db,
      `
        SELECT
          transaction_request.id AS transaction_request_id,
          transaction_request.person_id,
          transaction_request.request_type,
          transaction_request.status_code,
          transaction_request.requested_at,
          transaction_request.correlation_id,
          transaction_request.payload_version,
          transaction_request.payload_json,
          person.display_name
        FROM transaction_request
        JOIN person ON person.id = transaction_request.person_id
        WHERE ${inPredicate(
          "transaction_request.id",
          transactionRequestIds,
          requestParameters,
        )}
      `,
      requestParameters,
    );
    const personIds = [
      ...new Set(
        requestRows.map((row) => requireDatabaseString(row.person_id)),
      ),
    ];
    const employmentsByPerson = this.#readLifecycleEmployments(personIds);
    const assignmentsByPerson = this.#readLifecycleAssignments(personIds);
    const auditEventsByRequest = this.#readLifecycleAuditEvents(
      transactionRequestIds,
    );

    return requestRows.map((row) => {
      const transactionRequestId = requireDatabaseString(
        row.transaction_request_id,
      );
      const personId = requireDatabaseString(row.person_id);
      if (!provenance.has("person", personId)) {
        throw dataScopeDenied();
      }
      const persistedRequestType = normalizeAllowedValue(
        row.request_type,
        persistedLifecycleTypes,
        "data_scope_denied",
      );
      const status = normalizeAllowedValue(
        row.status_code,
        p2ListLifecycleStatuses,
        "data_scope_denied",
      );
      const payload = parseLifecyclePayload(row, persistedRequestType);
      const requestedAt = normalizeTimestamp(
        row.requested_at,
        "data_scope_denied",
      );
      const employments = employmentsByPerson.get(personId) ?? [];
      if (employments.length > 1) {
        throw dataScopeDenied();
      }
      const employment = employments[0];
      if (employment && !provenance.has("employment", employment.id)) {
        throw dataScopeDenied();
      }

      let assignmentSourceId: string | null = null;
      let organizationCode: string;
      if (persistedRequestType === "hire") {
        organizationCode = payload.onboardingOrganizationCode;
      } else if (
        persistedRequestType === "change" ||
        persistedRequestType === "transfer"
      ) {
        organizationCode = payload.transferOrganizationCode;
      } else {
        if (
          !employment ||
          employment.id !== payload.terminationEmploymentId ||
          employment.code !== payload.terminationEmploymentCode
        ) {
          throw dataScopeDenied();
        }
        const matches = (assignmentsByPerson.get(personId) ?? []).filter(
          (assignment) =>
            assignment.id === payload.terminationAssignmentId &&
            assignment.code === payload.terminationAssignmentCode &&
            assignment.employmentId === payload.terminationEmploymentId &&
            assignment.startDate <= payload.effectiveDate &&
            (assignment.endDate === null ||
              assignment.endDate >= payload.effectiveDate),
        );
        if (matches.length !== 1) {
          throw dataScopeDenied();
        }
        const assignment = matches[0];
        if (!assignment || !provenance.has("assignment", assignment.id)) {
          throw dataScopeDenied();
        }
        assignmentSourceId = assignment.id;
        organizationCode = assignment.organizationCode;
      }

      const decision = resolveLifecycleDecision(
        transactionRequestId,
        persistedRequestType,
        status,
        auditEventsByRequest.get(transactionRequestId) ?? [],
        provenance,
      );
      return {
        transactionRequestId,
        persistedRequestType,
        requestType: p2ListPersistedLifecycleTypeMap[persistedRequestType],
        status,
        subjectPersonId: personId,
        subjectEmploymentSourceId: employment?.id ?? null,
        subjectEmployeeId: employment?.code ?? null,
        subjectDisplayName: requireDatabaseString(row.display_name),
        organizationCode,
        assignmentSourceId,
        decisionAuditSourceId: decision.auditEventId,
        decidedBy: decision.actorId,
        requestedAt,
        effectiveDate: payload.effectiveDate,
        correlationId: requireNullableDatabaseString(row.correlation_id),
      };
    });
  }

  #readLifecycleEmployments(
    personIds: readonly string[],
  ): Map<string, Array<{ id: string; code: string }>> {
    const result = new Map<string, Array<{ id: string; code: string }>>();
    if (personIds.length === 0) {
      return result;
    }
    const parameters: SqlValue[] = [];
    const rows = queryAll(
      this.#db,
      `
        SELECT id, person_id, employment_code
        FROM employment
        WHERE ${inPredicate("person_id", personIds, parameters)}
        ORDER BY id
      `,
      parameters,
    );
    for (const row of rows) {
      const personId = requireDatabaseString(row.person_id);
      const values = result.get(personId) ?? [];
      values.push({
        id: requireDatabaseString(row.id),
        code: requireDatabaseString(row.employment_code),
      });
      result.set(personId, values);
    }
    return result;
  }

  #readLifecycleAssignments(personIds: readonly string[]): Map<
    string,
    Array<{
      id: string;
      employmentId: string;
      code: string;
      organizationCode: string;
      startDate: string;
      endDate: string | null;
    }>
  > {
    const result = new Map<
      string,
      Array<{
        id: string;
        employmentId: string;
        code: string;
        organizationCode: string;
        startDate: string;
        endDate: string | null;
      }>
    >();
    if (personIds.length === 0) {
      return result;
    }
    const parameters: SqlValue[] = [];
    const rows = queryAll(
      this.#db,
      `
        SELECT
          id,
          person_id,
          employment_id,
          assignment_code,
          organization_code,
          start_date,
          end_date
        FROM assignment
        WHERE ${inPredicate("person_id", personIds, parameters)}
        ORDER BY id
      `,
      parameters,
    );
    for (const row of rows) {
      const personId = requireDatabaseString(row.person_id);
      const values = result.get(personId) ?? [];
      values.push({
        id: requireDatabaseString(row.id),
        employmentId: requireDatabaseString(row.employment_id),
        code: requireDatabaseString(row.assignment_code),
        organizationCode: requireDatabaseString(row.organization_code),
        startDate: requireIsoDatabaseDate(row.start_date),
        endDate: requireNullableIsoDatabaseDate(row.end_date),
      });
      result.set(personId, values);
    }
    return result;
  }

  #readLifecycleAuditEvents(
    transactionRequestIds: readonly string[],
  ): Map<string, UnvalidatedLifecycleAuditEvent[]> {
    const result = new Map<string, UnvalidatedLifecycleAuditEvent[]>();
    if (transactionRequestIds.length === 0) {
      return result;
    }
    const parameters: SqlValue[] = [];
    const rows = queryAll(
      this.#db,
      `
        SELECT id, actor_id, action, subject_id, occurred_at, poc_marker
        FROM audit_event
        WHERE subject_table = 'transaction_request'
          AND ${inPredicate("subject_id", transactionRequestIds, parameters)}
        ORDER BY id
      `,
      parameters,
    );
    for (const row of rows) {
      const requestId = requireDatabaseString(row.subject_id);
      const values = result.get(requestId) ?? [];
      values.push({
        id: row.id,
        actorId: row.actor_id,
        action: row.action,
        occurredAt: row.occurred_at,
        pocMarker: row.poc_marker,
      });
      result.set(requestId, values);
    }
    return result;
  }

  #queryLifecycleRows(options: {
    actor: NormalizedActorContext;
    validatedRows: readonly ValidatedLifecycleRow[];
    filters: P2ListLifecycleFilters;
    sort: LifecycleSort;
    direction: P2ListDirection;
    limit: number;
    cursorState?: Readonly<P2ListCursorState>;
  }): ValidatedLifecycleRow[] {
    const {
      actor,
      validatedRows,
      filters,
      sort,
      direction,
      limit,
      cursorState,
    } = options;
    if (validatedRows.length === 0) {
      return [];
    }
    const parameters: SqlValue[] = [];
    const valuesSql = validatedRows
      .map((row) => {
        parameters.push(
          row.transactionRequestId,
          row.persistedRequestType,
          row.requestType,
          row.status,
          row.subjectPersonId,
          row.subjectEmploymentSourceId,
          row.subjectEmployeeId,
          row.subjectDisplayName,
          row.organizationCode,
          row.assignmentSourceId,
          row.decisionAuditSourceId,
          row.decidedBy,
          row.requestedAt,
          row.effectiveDate,
          row.correlationId,
        );
        return "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
      })
      .join(",\n          ");
    const clauses = [
      buildScopePredicate(
        actor.dataScope,
        {
          organization: "organization_code",
          person: "subject_person_id",
          employee: "subject_employee_id",
          correlation: "correlation_id",
        },
        parameters,
      ),
    ];
    if (filters.requestType?.length) {
      clauses.push(
        inPredicate("request_type", filters.requestType, parameters),
      );
    }
    if (filters.status?.length) {
      clauses.push(inPredicate("status", filters.status, parameters));
    }
    if (filters.subjectEmployeeId) {
      clauses.push("subject_employee_id = ?");
      parameters.push(filters.subjectEmployeeId);
    }
    if (filters.q) {
      clauses.push(
        `(transaction_request_id = ? OR subject_employee_id = ? OR subject_display_name LIKE ? ESCAPE '\\')`,
      );
      parameters.push(filters.q, filters.q, `${escapeLike(filters.q)}%`);
    }
    if (filters.organizationCode) {
      clauses.push("organization_code = ?");
      parameters.push(filters.organizationCode);
    }
    if (filters.decidedBy) {
      clauses.push("decided_by = ?");
      parameters.push(filters.decidedBy);
    }
    if (filters.requestedFrom && filters.requestedTo) {
      clauses.push("requested_at >= ? AND requested_at <= ?");
      parameters.push(filters.requestedFrom, filters.requestedTo);
    }
    if (filters.effectiveFrom && filters.effectiveTo) {
      clauses.push("effective_date >= ? AND effective_date <= ?");
      parameters.push(filters.effectiveFrom, filters.effectiveTo);
    }
    if (filters.correlationId) {
      clauses.push("correlation_id = ?");
      parameters.push(filters.correlationId);
    }
    const sortColumn =
      sort === "requestedAt" ? "requested_at" : "effective_date";
    if (cursorState) {
      clauses.push(
        keysetPredicate(
          sortColumn,
          "transaction_request_id",
          direction,
          cursorState,
          parameters,
        ),
      );
    }
    parameters.push(limit + 1);
    const rows = queryAll(
      this.#db,
      `
        WITH validated_projection (
          transaction_request_id,
          persisted_request_type,
          request_type,
          status,
          subject_person_id,
          subject_employment_source_id,
          subject_employee_id,
          subject_display_name,
          organization_code,
          assignment_source_id,
          decision_audit_source_id,
          decided_by,
          requested_at,
          effective_date,
          correlation_id
        ) AS (
          VALUES ${valuesSql}
        )
        SELECT *
        FROM validated_projection
        WHERE ${clauses.join("\n          AND ")}
        ORDER BY ${sortColumn} ${direction.toUpperCase()},
          transaction_request_id ${direction.toUpperCase()}
        LIMIT ?
      `,
      parameters,
    );
    return rows.map(parseValidatedLifecycleDatabaseRow);
  }
}

function normalizeEmployeeFilters(
  input: P2ListEmployeeFilters | undefined,
): P2ListEmployeeFilters {
  const filters = normalizeOptionalRecord(input, employeeFilterKeys);
  const normalized: P2ListEmployeeFilters = {};
  if (filters.q !== undefined) {
    normalized.q = normalizeQuery(filters.q);
  }
  if (filters.employeeId !== undefined) {
    normalized.employeeId = requireBoundedString(
      filters.employeeId,
      1,
      128,
      "invalid_filter",
    );
  }
  if (filters.employmentStatus !== undefined) {
    normalized.employmentStatus = normalizeAllowedValue(
      filters.employmentStatus,
      p2ListEmployeeStatuses,
      "invalid_filter",
    );
  }
  if (filters.organizationCode !== undefined) {
    normalized.organizationCode = requireBoundedString(
      filters.organizationCode,
      1,
      128,
      "invalid_filter",
    );
  }
  if (filters.asOf !== undefined) {
    normalized.asOf = normalizeIsoDate(filters.asOf, "invalid_filter");
  }
  return normalized;
}

function normalizeLifecycleFilters(
  input: P2ListLifecycleFilters | undefined,
  permissions: readonly string[],
): P2ListLifecycleFilters {
  const filters = normalizeOptionalRecord(input, lifecycleFilterKeys);
  const normalized: P2ListLifecycleFilters = {};
  if (filters.requestType !== undefined) {
    normalized.requestType = requireUniqueAllowedValues(
      filters.requestType,
      Object.values(p2ListPersistedLifecycleTypeMap),
    );
  }
  if (filters.status !== undefined) {
    normalized.status = requireUniqueAllowedValues(
      filters.status,
      p2ListLifecycleStatuses,
    );
  }
  if (filters.subjectEmployeeId !== undefined) {
    normalized.subjectEmployeeId = requireBoundedString(
      filters.subjectEmployeeId,
      1,
      128,
      "invalid_filter",
    );
  }
  if (filters.q !== undefined) {
    normalized.q = normalizeQuery(filters.q);
  }
  if (filters.organizationCode !== undefined) {
    normalized.organizationCode = requireBoundedString(
      filters.organizationCode,
      1,
      128,
      "invalid_filter",
    );
  }
  if (filters.decidedBy !== undefined) {
    normalized.decidedBy = requireBoundedString(
      filters.decidedBy,
      1,
      128,
      "invalid_filter",
    );
  }
  normalizeRangePair(
    filters.requestedFrom,
    filters.requestedTo,
    "timestamp",
    normalized,
    "requestedFrom",
    "requestedTo",
  );
  normalizeRangePair(
    filters.effectiveFrom,
    filters.effectiveTo,
    "date",
    normalized,
    "effectiveFrom",
    "effectiveTo",
  );
  if (filters.correlationId !== undefined) {
    if (!permissions.includes(p2ListPermissions.supportCorrelationRead)) {
      throw new P2ListReadModelError(
        "permission_denied",
        "The correlation filter is not permitted.",
      );
    }
    normalized.correlationId = requireBoundedString(
      filters.correlationId,
      1,
      256,
      "invalid_filter",
    );
  }
  return normalized;
}

function normalizeActorContext(
  input: P2ListActorContext,
  requiredPermission: string,
  allowCorrelationScope: boolean,
): NormalizedActorContext {
  const actor = requireRecord(
    input,
    "Server actor context is required.",
    "actor_context_required",
  );
  rejectUnknownKeys(actor, actorKeys, "actor_context_required");
  const actorId = requireBoundedString(
    actor.actorId,
    1,
    256,
    "actor_context_required",
  );
  const tenantId = requireBoundedString(
    actor.tenantId,
    1,
    256,
    "actor_context_required",
  );
  const permissions = requireUniqueStringArray(
    actor.permissions,
    0,
    100,
    "actor_context_required",
  );
  if (!permissions.includes(requiredPermission)) {
    throw new P2ListReadModelError(
      "permission_denied",
      "The list permission is required.",
    );
  }
  const scope = requireRecord(
    actor.dataScope,
    "Server data scope is required.",
    "data_scope_denied",
  );
  rejectUnknownKeys(scope, scopeKeys, "data_scope_denied");
  const dataScope: Required<P2ListDataScope> = {
    organizationCodes: normalizeScopeValues(scope.organizationCodes),
    personIds: normalizeScopeValues(scope.personIds),
    employeeIds: normalizeScopeValues(scope.employeeIds),
    correlationIds: normalizeScopeValues(scope.correlationIds),
  };
  if (!allowCorrelationScope && dataScope.correlationIds.length > 0) {
    throw dataScopeDenied();
  }
  if (
    dataScope.organizationCodes.length === 0 &&
    dataScope.personIds.length === 0 &&
    dataScope.employeeIds.length === 0 &&
    dataScope.correlationIds.length === 0
  ) {
    throw dataScopeDenied();
  }
  return {
    actorId,
    tenantId,
    permissions,
    dataScope,
    fingerprint: fingerprintP2ListValue({
      actorId,
      tenantId,
      permissions,
      dataScope,
    }),
  };
}

function normalizeScopeValues(value: unknown): string[] {
  return value === undefined
    ? []
    : requireUniqueStringArray(value, 0, 100, "data_scope_denied");
}

function requireVerifiedDataset(
  value: unknown,
): P2ListVerifiedSyntheticDataset {
  if (!(value instanceof P2ListVerifiedSyntheticDataset)) {
    throw dataScopeDenied();
  }
  return value;
}

function normalizeLimit(value: unknown): number {
  const limit = value ?? p2ListDefaultLimit;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > p2ListMaximumLimit
  ) {
    throw new P2ListReadModelError(
      "limit_out_of_range",
      "The requested page size is out of range.",
    );
  }
  return limit;
}

function normalizeDirection(value: unknown = "asc"): P2ListDirection {
  return normalizeAllowedValue(value, ["asc", "desc"] as const, "invalid_sort");
}

function normalizeQuery(value: unknown): string {
  const query = requireBoundedString(
    value,
    2,
    p2ListMaximumQueryLength,
    "invalid_filter",
  );
  if (!queryPattern.test(query)) {
    throw new P2ListReadModelError(
      "invalid_filter",
      "The bounded search filter is invalid.",
    );
  }
  return query;
}

function resolveEmployeeAsOf(
  explicitAsOf: string | undefined,
  acceptedAt: unknown,
  cursorState: Readonly<P2ListCursorState> | undefined,
): string {
  if (cursorState) {
    if (!cursorState.resolvedAsOf) {
      throw cursorInvalid();
    }
    if (explicitAsOf && explicitAsOf !== cursorState.resolvedAsOf) {
      throw new P2ListReadModelError(
        "cursor_filter_mismatch",
        "The cursor filters do not match this request.",
      );
    }
    return cursorState.resolvedAsOf;
  }
  if (explicitAsOf) {
    return explicitAsOf;
  }
  return normalizeTimestamp(acceptedAt, "invalid_filter").slice(0, 10);
}

function validateCursorFilter(
  state: Readonly<P2ListCursorState> | undefined,
  filterFingerprint: string,
): void {
  if (state && state.filterFingerprint !== filterFingerprint) {
    throw new P2ListReadModelError(
      "cursor_filter_mismatch",
      "The cursor filters do not match this request.",
    );
  }
}

function buildEmployeePage(
  rows: EmployeeDatabaseRow[],
  limit: number,
  appliedFilters: P2ListEmployeeAppliedFilters,
  sort: EmployeeSort,
  direction: P2ListDirection,
  actor: NormalizedActorContext,
  provenance: P2ListVerifiedSyntheticDataset,
  filterFingerprint: string,
  resolvedAsOf: string,
  cursors: P2ListCursorManager,
): P2ListPage<P2ListEmployeeItem, P2ListEmployeeAppliedFilters> {
  const hasNextPage = rows.length > limit;
  const selectedRows = rows.slice(0, limit);
  const items = selectedRows.map(employeeItemFromRow);
  const lastRow = selectedRows.at(-1);
  const nextCursor =
    hasNextPage && lastRow
      ? cursors.issue({
          resource: "employee",
          sort,
          direction,
          lastSortValue: employeeSortValue(lastRow, sort),
          lastSortValueIsNull: false,
          lastStableId: lastRow.employment_id,
          filterFingerprint,
          authorizationContextFingerprint: actor.fingerprint,
          datasetFingerprint: provenance.fingerprint,
          resolvedAsOf,
        })
      : null;
  return {
    items,
    pageInfo: { limit, hasNextPage, nextCursor },
    appliedFilters,
  };
}

function buildLifecyclePage(
  rows: ValidatedLifecycleRow[],
  limit: number,
  appliedFilters: P2ListLifecycleFilters,
  sort: LifecycleSort,
  direction: P2ListDirection,
  actor: NormalizedActorContext,
  provenance: P2ListVerifiedSyntheticDataset,
  filterFingerprint: string,
  cursors: P2ListCursorManager,
): P2ListPage<P2ListLifecycleItem, P2ListLifecycleFilters> {
  const hasNextPage = rows.length > limit;
  const selectedRows = rows.slice(0, limit);
  const lastRow = selectedRows.at(-1);
  const nextCursor =
    hasNextPage && lastRow
      ? cursors.issue({
          resource: "lifecycleRequest",
          sort,
          direction,
          lastSortValue:
            sort === "requestedAt"
              ? lastRow.requestedAt
              : lastRow.effectiveDate,
          lastSortValueIsNull: false,
          lastStableId: lastRow.transactionRequestId,
          filterFingerprint,
          authorizationContextFingerprint: actor.fingerprint,
          datasetFingerprint: provenance.fingerprint,
        })
      : null;
  return {
    items: selectedRows.map(lifecycleItemFromRow),
    pageInfo: { limit, hasNextPage, nextCursor },
    appliedFilters,
  };
}

function employeeItemFromRow(row: EmployeeDatabaseRow): P2ListEmployeeItem {
  return {
    personId: row.person_id,
    employeeId: row.employee_id,
    displayName: row.display_name,
    employmentStatus: row.employment_status as EmployeeStatus,
    organizationCode: row.organization_code,
    positionCode: row.position_code,
    hireDate: row.hire_date,
    terminationDate: row.termination_date,
  };
}

function lifecycleItemFromRow(row: ValidatedLifecycleRow): P2ListLifecycleItem {
  return {
    transactionRequestId: row.transactionRequestId,
    requestType: row.requestType,
    status: row.status,
    subjectPersonId: row.subjectPersonId,
    subjectEmployeeId: row.subjectEmployeeId,
    subjectDisplayName: row.subjectDisplayName,
    organizationCode: row.organizationCode,
    decidedBy: row.decidedBy,
    requestedAt: row.requestedAt,
    effectiveDate: row.effectiveDate,
  };
}

function employeeSortValue(
  row: EmployeeDatabaseRow,
  sort: EmployeeSort,
): string {
  return {
    employeeId: row.employee_id,
    displayName: row.display_name,
    hireDate: row.hire_date,
  }[sort];
}

function parseEmployeeDatabaseRow(
  row: Record<string, unknown>,
): EmployeeDatabaseRow {
  const status = normalizeAllowedValue(
    row.employment_status,
    p2ListEmployeeStatuses,
    "data_scope_denied",
  );
  return {
    person_id: requireDatabaseString(row.person_id),
    employment_id: requireDatabaseString(row.employment_id),
    employee_id: requireDatabaseString(row.employee_id),
    display_name: requireDatabaseString(row.display_name),
    employment_status: status,
    organization_code: requireNullableDatabaseString(row.organization_code),
    position_code: requireNullableDatabaseString(row.position_code),
    hire_date: requireIsoDatabaseDate(row.hire_date),
    termination_date: requireNullableIsoDatabaseDate(row.termination_date),
  };
}

function parseValidatedLifecycleDatabaseRow(
  row: Record<string, unknown>,
): ValidatedLifecycleRow {
  return {
    transactionRequestId: requireDatabaseString(row.transaction_request_id),
    persistedRequestType: normalizeAllowedValue(
      row.persisted_request_type,
      persistedLifecycleTypes,
      "data_scope_denied",
    ),
    requestType: normalizeAllowedValue(
      row.request_type,
      Object.values(p2ListPersistedLifecycleTypeMap),
      "data_scope_denied",
    ),
    status: normalizeAllowedValue(
      row.status,
      p2ListLifecycleStatuses,
      "data_scope_denied",
    ),
    subjectPersonId: requireDatabaseString(row.subject_person_id),
    subjectEmploymentSourceId: requireNullableDatabaseString(
      row.subject_employment_source_id,
    ),
    subjectEmployeeId: requireNullableDatabaseString(row.subject_employee_id),
    subjectDisplayName: requireDatabaseString(row.subject_display_name),
    organizationCode: requireDatabaseString(row.organization_code),
    assignmentSourceId: requireNullableDatabaseString(row.assignment_source_id),
    decisionAuditSourceId: requireNullableDatabaseString(
      row.decision_audit_source_id,
    ),
    decidedBy: requireNullableDatabaseString(row.decided_by),
    requestedAt: normalizeTimestamp(row.requested_at, "data_scope_denied"),
    effectiveDate: requireIsoDatabaseDate(row.effective_date),
    correlationId: requireNullableDatabaseString(row.correlation_id),
  };
}

function parseLifecyclePayload(
  row: Record<string, unknown>,
  requestType: (typeof persistedLifecycleTypes)[number],
): {
  effectiveDate: string;
  onboardingOrganizationCode: string;
  transferOrganizationCode: string;
  terminationEmploymentId: string;
  terminationEmploymentCode: string;
  terminationAssignmentId: string;
  terminationAssignmentCode: string;
} {
  const expectedVersion = {
    hire: "mvp_a_onboarding_v1",
    change: "mvp_b_transfer_v1",
    transfer: "mvp_b_transfer_v1",
    terminate: "mvp_c_termination_v1",
  }[requestType];
  if (
    row.payload_version !== expectedVersion ||
    typeof row.payload_json !== "string"
  ) {
    throw dataScopeDenied();
  }
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(row.payload_json);
  } catch {
    throw dataScopeDenied();
  }
  try {
    if (requestType === "hire") {
      const payload = parseOnboardingPayload(rawPayload);
      if (payload.effectiveDate !== payload.employment.startDate) {
        throw dataScopeDenied();
      }
      return {
        effectiveDate: normalizeIsoDate(
          payload.effectiveDate,
          "data_scope_denied",
        ),
        onboardingOrganizationCode: payload.assignment.departmentReference,
        transferOrganizationCode: "",
        terminationEmploymentId: "",
        terminationEmploymentCode: "",
        terminationAssignmentId: "",
        terminationAssignmentCode: "",
      };
    }
    if (requestType === "change" || requestType === "transfer") {
      const payload = parseTransferPayload(rawPayload);
      return {
        effectiveDate: normalizeIsoDate(
          payload.effectiveDate,
          "data_scope_denied",
        ),
        onboardingOrganizationCode: "",
        transferOrganizationCode:
          payload.targetAssignment.organizationReference,
        terminationEmploymentId: "",
        terminationEmploymentCode: "",
        terminationAssignmentId: "",
        terminationAssignmentCode: "",
      };
    }
    const payload = parseTerminationPayload(rawPayload);
    return {
      effectiveDate: normalizeIsoDate(
        payload.effectiveDate,
        "data_scope_denied",
      ),
      onboardingOrganizationCode: "",
      transferOrganizationCode: "",
      terminationEmploymentId: payload.currentEmployment.employmentId,
      terminationEmploymentCode: payload.currentEmployment.employmentCode,
      terminationAssignmentId: payload.currentAssignment.assignmentId,
      terminationAssignmentCode: payload.currentAssignment.assignmentCode,
    };
  } catch {
    throw dataScopeDenied();
  }
}

function resolveLifecycleDecision(
  requestId: string,
  requestType: (typeof persistedLifecycleTypes)[number],
  status: LifecycleStatus,
  auditEvents: readonly UnvalidatedLifecycleAuditEvent[],
  provenance: P2ListVerifiedSyntheticDataset,
): { auditEventId: string | null; actorId: string | null } {
  if (status === "draft" || status === "submitted") {
    return { auditEventId: null, actorId: null };
  }
  const action = `${lifecycleActionPrefix[requestType]}.${
    lifecycleDecisionAction[status]
  }`;
  const candidates = auditEvents.filter(
    (event) =>
      event.action === action &&
      event.pocMarker === "synthetic_poc" &&
      typeof event.actorId === "string" &&
      event.actorId.length > 0,
  );
  const validatedCandidates = candidates.map((candidate) => ({
    id: requireDatabaseString(candidate.id),
    actorId: requireDatabaseString(candidate.actorId),
    occurredAt: normalizeTimestamp(candidate.occurredAt, "data_scope_denied"),
  }));
  if (validatedCandidates.length === 0) {
    throw dataScopeDenied();
  }
  const latestTimestamp = Math.max(
    ...validatedCandidates.map((candidate) => Date.parse(candidate.occurredAt)),
  );
  const latest = validatedCandidates.filter(
    (candidate) => Date.parse(candidate.occurredAt) === latestTimestamp,
  );
  if (latest.length !== 1 || !latest[0]) {
    throw dataScopeDenied();
  }
  if (!provenance.has("audit_event", latest[0].id)) {
    throw dataScopeDenied();
  }
  return { auditEventId: latest[0].id, actorId: latest[0].actorId };
}

function buildScopePredicate(
  scope: Required<P2ListDataScope>,
  columns: {
    organization: string;
    person: string;
    employee: string;
    correlation?: string;
  },
  parameters: SqlValue[],
): string {
  const branches: string[] = [];
  if (scope.organizationCodes.length > 0) {
    branches.push(
      inPredicate(columns.organization, scope.organizationCodes, parameters),
    );
  }
  if (scope.personIds.length > 0) {
    branches.push(inPredicate(columns.person, scope.personIds, parameters));
  }
  if (scope.employeeIds.length > 0) {
    branches.push(inPredicate(columns.employee, scope.employeeIds, parameters));
  }
  if (scope.correlationIds.length > 0) {
    if (!columns.correlation) {
      throw dataScopeDenied();
    }
    branches.push(
      inPredicate(columns.correlation, scope.correlationIds, parameters),
    );
  }
  if (branches.length === 0) {
    throw dataScopeDenied();
  }
  return `(${branches.join(" OR ")})`;
}

function keysetPredicate(
  sortColumn: string,
  stableIdColumn: string,
  direction: P2ListDirection,
  state: Readonly<P2ListCursorState>,
  parameters: SqlValue[],
): string {
  if (state.lastSortValueIsNull || state.lastSortValue === null) {
    throw cursorInvalid();
  }
  const operator = direction === "asc" ? ">" : "<";
  parameters.push(state.lastSortValue, state.lastSortValue, state.lastStableId);
  return `(${sortColumn} ${operator} ? OR (${sortColumn} = ? AND ${stableIdColumn} ${operator} ?))`;
}

function inPredicate(
  column: string,
  values: readonly (string | number)[],
  parameters: SqlValue[],
): string {
  if (values.length === 0) {
    return "0";
  }
  parameters.push(...values);
  return `${column} IN (${values.map(() => "?").join(", ")})`;
}

function queryAll(
  db: OnboardingTransactionRequestDatabase,
  sql: string,
  parameters: SqlValue[],
): Record<string, unknown>[] {
  const statement = db.prepare(sql);
  if (!statement.all) {
    throw dataScopeDenied();
  }
  return statement.all(...parameters);
}

function normalizeOptionalRecord(
  input: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (input === undefined) {
    return {};
  }
  const record = requireRecord(
    input,
    "The bounded list filters are invalid.",
    "invalid_filter",
  );
  rejectUnknownKeys(record, allowedKeys, "unsupported_filter");
  return record;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  code: "actor_context_required" | "data_scope_denied" | "unsupported_filter",
): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new P2ListReadModelError(code, "The bounded list input is invalid.");
  }
}

function normalizeAllowedValue<const T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
  code: "invalid_filter" | "invalid_sort" | "data_scope_denied",
): T[number] {
  if (
    typeof value !== "string" ||
    !(allowedValues as readonly string[]).includes(value)
  ) {
    throw new P2ListReadModelError(code, "The bounded list input is invalid.");
  }
  return value as T[number];
}

function requireUniqueAllowedValues<const T extends readonly string[]>(
  value: unknown,
  allowedValues: T,
): T[number][] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new P2ListReadModelError(
      "invalid_filter",
      "The bounded list filters are invalid.",
    );
  }
  const normalized = value.map((entry) =>
    normalizeAllowedValue(entry, allowedValues, "invalid_filter"),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new P2ListReadModelError(
      "invalid_filter",
      "The bounded list filters are invalid.",
    );
  }
  return normalized.sort();
}

function normalizeRangePair(
  from: unknown,
  to: unknown,
  type: "timestamp" | "date",
  target: object,
  fromKey: string,
  toKey: string,
): void {
  if ((from === undefined) !== (to === undefined)) {
    throw new P2ListReadModelError(
      "invalid_filter",
      "Both range endpoints are required.",
    );
  }
  if (from === undefined || to === undefined) {
    return;
  }
  const normalizedFrom =
    type === "timestamp"
      ? normalizeTimestamp(from, "invalid_filter")
      : normalizeIsoDate(from, "invalid_filter");
  const normalizedTo =
    type === "timestamp"
      ? normalizeTimestamp(to, "invalid_filter")
      : normalizeIsoDate(to, "invalid_filter");
  const fromTime = Date.parse(
    type === "date" ? `${normalizedFrom}T00:00:00.000Z` : normalizedFrom,
  );
  const toTime = Date.parse(
    type === "date" ? `${normalizedTo}T00:00:00.000Z` : normalizedTo,
  );
  if (fromTime > toTime) {
    throw new P2ListReadModelError(
      "invalid_filter",
      "The range endpoints are invalid.",
    );
  }
  const inclusiveDays = Math.floor((toTime - fromTime) / 86_400_000) + 1;
  if (inclusiveDays > p2ListMaximumDateRangeDays) {
    throw new P2ListReadModelError(
      "date_range_too_wide",
      "The requested date range is too wide.",
    );
  }
  const targetRecord = target as Record<string, unknown>;
  targetRecord[fromKey] = normalizedFrom;
  targetRecord[toKey] = normalizedTo;
}

function normalizeIsoDate(
  value: unknown,
  code: "invalid_filter" | "data_scope_denied",
): string {
  if (typeof value !== "string" || !isoDatePattern.test(value)) {
    throw new P2ListReadModelError(code, "The bounded date value is invalid.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new P2ListReadModelError(code, "The bounded date value is invalid.");
  }
  return value;
}

function normalizeTimestamp(
  value: unknown,
  code: "invalid_filter" | "data_scope_denied",
): string {
  if (typeof value !== "string") {
    throw new P2ListReadModelError(
      code,
      "The bounded timestamp value is invalid.",
    );
  }
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d+))?(?<zone>Z|[+-](?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/u.exec(
      value,
    );
  if (!match?.groups) {
    throw new P2ListReadModelError(
      code,
      "The bounded timestamp value is invalid.",
    );
  }
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);
  const offsetHour = Number(match.groups.offsetHour ?? 0);
  const offsetMinute = Number(match.groups.offsetMinute ?? 0);
  const calendarProbe = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarProbe.getUTCFullYear() !== year ||
    calendarProbe.getUTCMonth() !== month - 1 ||
    calendarProbe.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new P2ListReadModelError(
      code,
      "The bounded timestamp value is invalid.",
    );
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new P2ListReadModelError(
      code,
      "The bounded timestamp value is invalid.",
    );
  }
  return parsed.toISOString();
}

function requireDatabaseString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw dataScopeDenied();
  }
  return value;
}

function requireNullableDatabaseString(value: unknown): string | null {
  return value === null ? null : requireDatabaseString(value);
}

function requireDatabaseNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw dataScopeDenied();
  }
  return value;
}

function requireIsoDatabaseDate(value: unknown): string {
  return normalizeIsoDate(value, "data_scope_denied");
}

function requireNullableIsoDatabaseDate(value: unknown): string | null {
  return value === null ? null : requireIsoDatabaseDate(value);
}

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function cursorInvalid(): P2ListReadModelError {
  return new P2ListReadModelError(
    "cursor_invalid",
    "The cursor is invalid or expired.",
  );
}

function dataScopeDenied(): P2ListReadModelError {
  return new P2ListReadModelError(
    "data_scope_denied",
    "The requested synthetic data scope is unavailable.",
  );
}
