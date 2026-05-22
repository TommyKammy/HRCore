type SqlValue = string | number | bigint | null;
type SqlRunResult = {
  changes?: number | bigint;
};

export interface SqlStatement {
  get(...values: SqlValue[]): Record<string, unknown> | undefined;
  all?(...values: SqlValue[]): Record<string, unknown>[];
  run(...values: SqlValue[]): unknown;
}

export interface OnboardingTransactionRequestDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
}

export type OnboardingTransactionRequestStatus = "draft" | "submitted";
export type OnboardingApprovalDecision =
  | "approve"
  | "return"
  | "reject"
  | "cancel";
export type OnboardingTransactionRequestPersistedStatus =
  | OnboardingTransactionRequestStatus
  | "returned"
  | "rejected"
  | "cancelled"
  | "approved"
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

export interface OnboardingApprovalDecisionInput {
  transactionRequestId: string;
  decision: OnboardingApprovalDecision;
  decidedAt: string;
  decidedBy: string;
  correlationId: string;
}

export interface OnboardingApprovalDecisionResult {
  personId: string;
  transactionRequestId: string;
  statusCode: Exclude<
    OnboardingTransactionRequestPersistedStatus,
    "draft" | "submitted" | "completed"
  >;
  decision: OnboardingApprovalDecision;
  auditEventId: string;
  correlationId: string;
}

export interface ApplyApprovedOnboardingTransactionRequestInput {
  transactionRequestId: string;
  appliedAt: string;
  appliedBy: string;
  correlationId: string;
}

export interface AppliedOnboardingTransactionRequestResult {
  personId: string;
  employmentId: string;
  assignmentId: string;
  transactionRequestId: string;
  lifecycleEventId: string;
  statusCode: "completed";
  correlationId: string;
}

export interface ApplyDueOnboardingTransactionRequestsInput {
  now: string;
  workerId: string;
  correlationId: string;
  batchLimit?: number;
}

export type ApplyDueOnboardingTransactionRequestsStatus =
  | "applied"
  | "retryable_failure"
  | "non_retryable_failure";

export interface ApplyDueOnboardingTransactionRequestsItemResult {
  transactionRequestId: string;
  status: ApplyDueOnboardingTransactionRequestsStatus;
  lifecycleEventId?: string;
  errorMessage?: string;
}

export interface ApplyDueOnboardingTransactionRequestsResult {
  attempted: number;
  applied: number;
  failed: number;
  skipped: number;
  correlationId: string;
  results: ApplyDueOnboardingTransactionRequestsItemResult[];
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

type OnboardingDecisionTarget = {
  statusCode: OnboardingApprovalDecisionResult["statusCode"];
  auditAction: string;
};

type ExistingAuditEventRow = {
  id: string;
  actor_id: string;
  action: string;
  subject_table: string;
  subject_id: string;
  occurred_at: string;
  correlation_id: string | null;
};

type ExistingAppliedOnboardingTransactionRequestRow = {
  transaction_status_code: string;
  request_type: string;
  person_id: string;
  payload_version: string | null;
  payload_json: string | null;
  lifecycle_event_id: string | null;
  lifecycle_event_type: string | null;
  lifecycle_effective_date: string | null;
  lifecycle_occurred_at: string | null;
  employment_id: string | null;
  employment_code: string | null;
  employment_status_code: string | null;
  employment_start_date: string | null;
  employment_end_date: string | null;
  assignment_id: string | null;
  assignment_code: string | null;
  organization_code: string | null;
  position_code: string | null;
  assignment_start_date: string | null;
  assignment_end_date: string | null;
  audit_event_id: string | null;
  audit_actor_id: string | null;
  audit_action: string | null;
  audit_subject_table: string | null;
  audit_subject_id: string | null;
  audit_occurred_at: string | null;
  audit_correlation_id: string | null;
};

type DueOnboardingApplyCandidateRow = ExistingOnboardingTransactionRequestRow;

type ExistingOnboardingApplyJobAttemptRow = {
  transaction_request_id: string;
  status_code: string;
  error_message: string | null;
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
          AND status_code in ('draft', 'returned')
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

export function decideOnboardingTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): OnboardingApprovalDecisionResult {
  const decision = parseOnboardingApprovalDecisionInput(input);
  const target = getOnboardingDecisionTarget(decision.decision);
  const auditEventId = buildOnboardingDecisionAuditEventId(decision);
  const existing = readOnboardingTransactionRequestById(
    db,
    decision.transactionRequestId,
  );

  if (!existing) {
    throw new Error("onboarding transaction request decision target not found");
  }

  if (existing.request_type !== "hire") {
    throw new Error("onboarding transaction request decision target not found");
  }

  const existingAuditEvent = readAuditEventById(db, auditEventId);
  if (existing.status_code === target.statusCode && existingAuditEvent) {
    assertMatchingOnboardingDecisionAuditEvent(
      existingAuditEvent,
      existing,
      decision,
      target,
    );
    return buildOnboardingDecisionResult(
      existing,
      decision,
      target,
      auditEventId,
    );
  }

  assertLegalOnboardingDecision(existing, decision, target);

  db.exec("SAVEPOINT onboarding_transaction_request_decision");
  try {
    const updateResult = db
      .prepare(
        `
          UPDATE transaction_request
          SET status_code = ?
          WHERE id = ?
            AND person_id = ?
            AND request_type = 'hire'
            AND status_code = 'submitted'
        `,
      )
      .run(
        target.statusCode,
        existing.transaction_request_id,
        existing.person_id,
      );
    if (!isSingleSqlChange(updateResult)) {
      const retryResult = buildOnboardingDecisionRetryResultAfterConflict(
        db,
        decision,
        target,
        auditEventId,
      );
      if (retryResult) {
        db.exec("RELEASE SAVEPOINT onboarding_transaction_request_decision");
        return retryResult;
      }

      throw new Error(
        "onboarding transaction request decision conflicts with the current submitted state",
      );
    }

    db.prepare(
      `
        INSERT INTO audit_event (
          id,
          actor_id,
          action,
          subject_table,
          subject_id,
          occurred_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, 'transaction_request', ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      auditEventId,
      decision.decidedBy,
      target.auditAction,
      existing.transaction_request_id,
      decision.decidedAt,
      decision.correlationId,
    );

    db.exec("RELEASE SAVEPOINT onboarding_transaction_request_decision");
  } catch (error) {
    rollbackNamedSavepoint(db, "onboarding_transaction_request_decision");
    throw error;
  }

  return buildOnboardingDecisionResult(
    existing,
    decision,
    target,
    auditEventId,
  );
}

export function applyApprovedOnboardingTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): AppliedOnboardingTransactionRequestResult {
  const apply = parseApplyApprovedOnboardingTransactionRequestInput(input);
  const lifecycleEventId = buildOnboardingApplyLifecycleEventId(apply);
  const auditEventId = buildOnboardingApplyAuditEventId(lifecycleEventId);

  const existing = readOnboardingTransactionRequestById(
    db,
    apply.transactionRequestId,
  );
  if (
    existing &&
    existing.request_type === "hire" &&
    existing.status_code === "completed"
  ) {
    const payload = parsePersistedOnboardingApplyPayload(existing);
    const completedApply = readCompletedOnboardingApply(
      db,
      apply,
      lifecycleEventId,
      auditEventId,
      payload,
    );
    if (!completedApply) {
      throw new Error(
        "approved onboarding apply retry conflicts with the completed request",
      );
    }

    return buildCompletedOnboardingApplyRetryResult(
      completedApply,
      payload,
      apply,
      lifecycleEventId,
    );
  }

  if (
    !existing ||
    existing.request_type !== "hire" ||
    existing.status_code !== "approved"
  ) {
    throw new Error(
      "approved onboarding apply requires an approved hire transaction request",
    );
  }

  const payload = parsePersistedOnboardingApplyPayload(existing);

  db.exec("SAVEPOINT approved_onboarding_transaction_request_apply");
  try {
    db.prepare(
      `
        INSERT INTO employment (
          id,
          person_id,
          employment_code,
          status_code,
          start_date,
          end_date
        )
        VALUES (?, ?, ?, 'active', ?, NULL)
      `,
    ).run(
      payload.employment.id,
      existing.person_id,
      payload.employment.employmentCode,
      payload.employment.startDate,
    );

    db.prepare(
      `
        INSERT INTO assignment (
          id,
          person_id,
          employment_id,
          assignment_code,
          organization_code,
          position_code,
          start_date,
          end_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
      `,
    ).run(
      payload.assignment.id,
      existing.person_id,
      payload.employment.id,
      payload.assignment.assignmentCode,
      payload.assignment.departmentReference,
      payload.assignment.positionCode ?? null,
      payload.effectiveDate,
    );

    db.prepare(
      `
        INSERT INTO lifecycle_event (
          id,
          person_id,
          transaction_request_id,
          event_type,
          effective_date,
          occurred_at
        )
        VALUES (?, ?, ?, 'hire', ?, ?)
      `,
    ).run(
      lifecycleEventId,
      existing.person_id,
      existing.transaction_request_id,
      payload.effectiveDate,
      apply.appliedAt,
    );

    const updateResult = db
      .prepare(
        `
          UPDATE transaction_request
          SET status_code = 'completed'
          WHERE id = ?
            AND person_id = ?
            AND request_type = 'hire'
            AND status_code = 'approved'
        `,
      )
      .run(existing.transaction_request_id, existing.person_id);
    if (!isSingleSqlChange(updateResult)) {
      throw new Error(
        "approved onboarding apply conflicts with the current approved state",
      );
    }

    db.prepare(
      `
        INSERT INTO audit_event (
          id,
          actor_id,
          action,
          subject_table,
          subject_id,
          occurred_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, 'mvp_a.onboarding.apply', 'lifecycle_event', ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      auditEventId,
      apply.appliedBy,
      lifecycleEventId,
      apply.appliedAt,
      apply.correlationId,
    );

    db.exec("RELEASE SAVEPOINT approved_onboarding_transaction_request_apply");
  } catch (error) {
    rollbackNamedSavepoint(db, "approved_onboarding_transaction_request_apply");
    const completedAfterRollback = readCompletedOnboardingApply(
      db,
      apply,
      lifecycleEventId,
      auditEventId,
      payload,
    );
    if (completedAfterRollback) {
      return buildCompletedOnboardingApplyRetryResult(
        completedAfterRollback,
        payload,
        apply,
        lifecycleEventId,
      );
    }

    throw error;
  }

  return {
    personId: existing.person_id,
    employmentId: payload.employment.id,
    assignmentId: payload.assignment.id,
    transactionRequestId: existing.transaction_request_id,
    lifecycleEventId,
    statusCode: "completed",
    correlationId: apply.correlationId,
  };
}

export function applyDueOnboardingTransactionRequests(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): ApplyDueOnboardingTransactionRequestsResult {
  const worker = parseApplyDueOnboardingTransactionRequestsInput(input);
  const batchLimit = worker.batchLimit ?? 100;
  const effectiveDate = getMvpWorkerEffectiveDate(worker.now);
  const replayedAttemptsByRequestId = new Map(
    readOnboardingApplyJobAttemptsForWorkerCorrelation(
      db,
      worker.correlationId,
    ).map((attempt) => [attempt.transaction_request_id, attempt]),
  );
  const candidates = readDueOnboardingApplyCandidates(
    db,
    batchLimit,
    effectiveDate,
  );
  const results: ApplyDueOnboardingTransactionRequestsItemResult[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const attemptCorrelationId = buildWorkerAttemptCorrelationId(
      worker.correlationId,
      candidate.transaction_request_id,
    );
    const existingAttempt =
      replayedAttemptsByRequestId.get(candidate.transaction_request_id) ??
      readOnboardingApplyJobAttemptByCorrelation(db, attemptCorrelationId);
    if (existingAttempt) {
      results.push(buildOnboardingApplyJobAttemptResult(existingAttempt));
      replayedAttemptsByRequestId.delete(candidate.transaction_request_id);
      continue;
    }

    let payload: OnboardingTransactionRequestPayload;
    try {
      payload = parsePersistedOnboardingApplyPayload(candidate);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      results.push(
        buildOnboardingApplyJobAttemptResult(
          recordOnboardingApplyJobAttempt(db, {
            transactionRequestId: candidate.transaction_request_id,
            personId: candidate.person_id,
            status: "non_retryable_failure",
            attemptedAt: worker.now,
            workerId: worker.workerId,
            correlationId: attemptCorrelationId,
            retryable: false,
            errorMessage,
          }),
        ),
      );
      continue;
    }

    if (payload.effectiveDate > effectiveDate) {
      skipped += 1;
      continue;
    }

    try {
      const applied = applyApprovedOnboardingTransactionRequest(db, {
        transactionRequestId: candidate.transaction_request_id,
        appliedAt: worker.now,
        appliedBy: worker.workerId,
        correlationId: attemptCorrelationId,
      });
      const attemptResult = buildOnboardingApplyJobAttemptResult(
        recordOnboardingApplyJobAttempt(db, {
          transactionRequestId: candidate.transaction_request_id,
          personId: candidate.person_id,
          status: "applied",
          attemptedAt: worker.now,
          workerId: worker.workerId,
          correlationId: attemptCorrelationId,
          retryable: false,
          errorMessage: null,
        }),
      );
      results.push(
        attemptResult.status === "applied"
          ? { ...attemptResult, lifecycleEventId: applied.lifecycleEventId }
          : attemptResult,
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const retryable = isRetryableOnboardingApplyWorkerFailure(error);
      const status = retryable ? "retryable_failure" : "non_retryable_failure";
      results.push(
        buildOnboardingApplyJobAttemptResult(
          recordOnboardingApplyJobAttempt(db, {
            transactionRequestId: candidate.transaction_request_id,
            personId: candidate.person_id,
            status,
            attemptedAt: worker.now,
            workerId: worker.workerId,
            correlationId: attemptCorrelationId,
            retryable,
            errorMessage,
          }),
        ),
      );
    }
  }

  for (const existingAttempt of replayedAttemptsByRequestId.values()) {
    results.push(buildOnboardingApplyJobAttemptResult(existingAttempt));
  }

  const failed = results.filter((result) => result.status !== "applied").length;

  return {
    attempted: results.length,
    applied: results.length - failed,
    failed,
    skipped,
    correlationId: worker.correlationId,
    results,
  };
}

function assertSingleDraftUpdate(result: unknown): void {
  if (!isSingleSqlChange(result)) {
    throw new Error(
      "onboarding transaction request edit conflicts with the current draft state",
    );
  }
}

function isSingleSqlChange(result: unknown): boolean {
  return (
    isSqlRunResult(result) && (result.changes === 1 || result.changes === 1n)
  );
}

function parseOnboardingApprovalDecisionInput(
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

function parseApplyApprovedOnboardingTransactionRequestInput(
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

function parseApplyDueOnboardingTransactionRequestsInput(
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

function getOnboardingDecisionTarget(
  decision: OnboardingApprovalDecision,
): OnboardingDecisionTarget {
  switch (decision) {
    case "approve":
      return {
        statusCode: "approved",
        auditAction: "mvp_a.onboarding.approve",
      };
    case "return":
      return {
        statusCode: "returned",
        auditAction: "mvp_a.onboarding.return",
      };
    case "reject":
      return {
        statusCode: "rejected",
        auditAction: "mvp_a.onboarding.reject",
      };
    case "cancel":
      return {
        statusCode: "cancelled",
        auditAction: "mvp_a.onboarding.cancel",
      };
  }
}

function assertLegalOnboardingDecision(
  existing: ExistingOnboardingTransactionRequestRow,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
): void {
  if (existing.status_code === target.statusCode) {
    throw new Error(
      "onboarding transaction request decision audit evidence is missing for the repeated command",
    );
  }

  if (existing.status_code !== "submitted") {
    throw new Error(
      `onboarding transaction request ${decision.decision} decision requires submitted state`,
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

function readOnboardingTransactionRequestById(
  db: OnboardingTransactionRequestDatabase,
  transactionRequestId: string,
): ExistingOnboardingTransactionRequestRow | undefined {
  return db
    .prepare(
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
        WHERE transaction_request.id = ?
        LIMIT 1
      `,
    )
    .get(transactionRequestId) as
    | ExistingOnboardingTransactionRequestRow
    | undefined;
}

function readAuditEventById(
  db: OnboardingTransactionRequestDatabase,
  auditEventId: string,
): ExistingAuditEventRow | undefined {
  return db
    .prepare(
      `
        SELECT
          id,
          actor_id,
          action,
          subject_table,
          subject_id,
          occurred_at,
          correlation_id
        FROM audit_event
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(auditEventId) as ExistingAuditEventRow | undefined;
}

function readCompletedOnboardingApply(
  db: OnboardingTransactionRequestDatabase,
  apply: ApplyApprovedOnboardingTransactionRequestInput,
  lifecycleEventId: string,
  auditEventId: string,
  payload: OnboardingTransactionRequestPayload,
): ExistingAppliedOnboardingTransactionRequestRow | undefined {
  return db
    .prepare(
      `
        SELECT
          transaction_request.status_code AS transaction_status_code,
          transaction_request.request_type,
          transaction_request.person_id,
          transaction_request.payload_version,
          transaction_request.payload_json,
          lifecycle_event.id AS lifecycle_event_id,
          lifecycle_event.event_type AS lifecycle_event_type,
          lifecycle_event.effective_date AS lifecycle_effective_date,
          lifecycle_event.occurred_at AS lifecycle_occurred_at,
          employment.id AS employment_id,
          employment.employment_code,
          employment.status_code AS employment_status_code,
          employment.start_date AS employment_start_date,
          employment.end_date AS employment_end_date,
          assignment.id AS assignment_id,
          assignment.assignment_code,
          assignment.organization_code,
          assignment.position_code,
          assignment.start_date AS assignment_start_date,
          assignment.end_date AS assignment_end_date,
          audit_event.id AS audit_event_id,
          audit_event.actor_id AS audit_actor_id,
          audit_event.action AS audit_action,
          audit_event.subject_table AS audit_subject_table,
          audit_event.subject_id AS audit_subject_id,
          audit_event.occurred_at AS audit_occurred_at,
          audit_event.correlation_id AS audit_correlation_id
        FROM transaction_request
        LEFT JOIN lifecycle_event
          ON lifecycle_event.id = ?
         AND lifecycle_event.transaction_request_id = transaction_request.id
         AND lifecycle_event.person_id = transaction_request.person_id
        LEFT JOIN audit_event
          ON audit_event.id = ?
        LEFT JOIN employment
          ON employment.id = ?
         AND employment.person_id = transaction_request.person_id
        LEFT JOIN assignment
          ON assignment.id = ?
         AND assignment.person_id = transaction_request.person_id
         AND assignment.employment_id = employment.id
        WHERE transaction_request.id = ?
          AND transaction_request.status_code = 'completed'
        LIMIT 1
      `,
    )
    .get(
      lifecycleEventId,
      auditEventId,
      payload.employment.id,
      payload.assignment.id,
      apply.transactionRequestId,
    ) as ExistingAppliedOnboardingTransactionRequestRow | undefined;
}

function readDueOnboardingApplyCandidates(
  db: OnboardingTransactionRequestDatabase,
  batchLimit: number,
  effectiveDate: string,
): DueOnboardingApplyCandidateRow[] {
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
      WHERE transaction_request.request_type = 'hire'
        AND transaction_request.status_code = 'approved'
        AND transaction_request.payload_version = 'mvp_a_onboarding_v1'
        AND NOT EXISTS (
          SELECT 1
          FROM onboarding_apply_job_attempt
          WHERE onboarding_apply_job_attempt.transaction_request_id = transaction_request.id
            AND onboarding_apply_job_attempt.status_code = 'non_retryable_failure'
        )
      ORDER BY
        CASE
          WHEN json_valid(transaction_request.payload_json) = 1
            AND json_type(transaction_request.payload_json, '$.effectiveDate') = 'text'
            AND json_extract(transaction_request.payload_json, '$.effectiveDate') <= ? THEN 0
          WHEN json_valid(transaction_request.payload_json) = 0 THEN 1
          WHEN json_type(transaction_request.payload_json, '$.effectiveDate') IS NULL THEN 1
          WHEN json_type(transaction_request.payload_json, '$.effectiveDate') != 'text' THEN 1
          ELSE 2
        END,
        transaction_request.requested_at,
        transaction_request.id
      LIMIT ?
    `,
  );
  if (!statement.all) {
    throw new Error("onboarding apply worker requires query-all support");
  }

  return statement.all(
    effectiveDate,
    batchLimit,
  ) as DueOnboardingApplyCandidateRow[];
}

function matchesOnboardingTransactionRequestRetry(
  existing: ExistingOnboardingTransactionRequestRow,
  input: OnboardingTransactionRequestInput,
  payloadJson: string,
): boolean {
  const requestAlreadyAccepted =
    existing.status_code === input.statusCode ||
    (input.statusCode === "submitted" &&
      (existing.status_code === "completed" ||
        existing.status_code === "approved"));

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

function buildOnboardingDecisionResult(
  existing: ExistingOnboardingTransactionRequestRow,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
  auditEventId: string,
): OnboardingApprovalDecisionResult {
  return {
    personId: existing.person_id,
    transactionRequestId: existing.transaction_request_id,
    statusCode: target.statusCode,
    decision: decision.decision,
    auditEventId,
    correlationId: decision.correlationId,
  };
}

function buildCompletedOnboardingApplyRetryResult(
  existing: ExistingAppliedOnboardingTransactionRequestRow,
  payload: OnboardingTransactionRequestPayload,
  apply: ApplyApprovedOnboardingTransactionRequestInput,
  lifecycleEventId: string,
): AppliedOnboardingTransactionRequestResult {
  assertCompletedOnboardingApplyMatchesInput(
    existing,
    payload,
    apply,
    lifecycleEventId,
  );

  return {
    personId: existing.person_id,
    employmentId: payload.employment.id,
    assignmentId: payload.assignment.id,
    transactionRequestId: apply.transactionRequestId,
    lifecycleEventId,
    statusCode: "completed",
    correlationId: apply.correlationId,
  };
}

function parsePersistedOnboardingApplyPayload(
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

function assertCompletedOnboardingApplyMatchesInput(
  existing: ExistingAppliedOnboardingTransactionRequestRow,
  payload: OnboardingTransactionRequestPayload,
  apply: ApplyApprovedOnboardingTransactionRequestInput,
  lifecycleEventId: string,
): void {
  if (
    existing.transaction_status_code !== "completed" ||
    existing.request_type !== "hire" ||
    existing.lifecycle_event_id !== lifecycleEventId ||
    existing.lifecycle_event_type !== "hire" ||
    existing.lifecycle_effective_date !== payload.effectiveDate ||
    existing.lifecycle_occurred_at !== apply.appliedAt ||
    existing.employment_id !== payload.employment.id ||
    existing.employment_code !== payload.employment.employmentCode ||
    existing.employment_status_code !== "active" ||
    existing.employment_start_date !== payload.employment.startDate ||
    existing.employment_end_date !== null ||
    existing.assignment_id !== payload.assignment.id ||
    existing.assignment_code !== payload.assignment.assignmentCode ||
    existing.organization_code !== payload.assignment.departmentReference ||
    existing.position_code !== (payload.assignment.positionCode ?? null) ||
    existing.assignment_start_date !== payload.effectiveDate ||
    existing.assignment_end_date !== null ||
    existing.audit_event_id !==
      buildOnboardingApplyAuditEventId(lifecycleEventId) ||
    existing.audit_actor_id !== apply.appliedBy ||
    existing.audit_action !== "mvp_a.onboarding.apply" ||
    existing.audit_subject_table !== "lifecycle_event" ||
    existing.audit_subject_id !== lifecycleEventId ||
    existing.audit_occurred_at !== apply.appliedAt ||
    existing.audit_correlation_id !== apply.correlationId
  ) {
    throw new Error(
      "approved onboarding apply retry conflicts with the completed request",
    );
  }
}

function recordOnboardingApplyJobAttempt(
  db: OnboardingTransactionRequestDatabase,
  attempt: {
    transactionRequestId: string;
    personId: string;
    status: ApplyDueOnboardingTransactionRequestsStatus;
    attemptedAt: string;
    workerId: string;
    correlationId: string;
    retryable: boolean;
    errorMessage: string | null;
  },
): ExistingOnboardingApplyJobAttemptRow {
  db.prepare(
    `
      INSERT INTO onboarding_apply_job_attempt (
        id,
        transaction_request_id,
        person_id,
        status_code,
        attempted_at,
        worker_id,
        correlation_id,
        retryable,
        error_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(correlation_id) DO NOTHING
    `,
  ).run(
    buildOnboardingApplyJobAttemptId(
      attempt.transactionRequestId,
      attempt.correlationId,
    ),
    attempt.transactionRequestId,
    attempt.personId,
    attempt.status,
    attempt.attemptedAt,
    attempt.workerId,
    attempt.correlationId,
    attempt.retryable ? 1 : 0,
    attempt.errorMessage,
  );

  const recorded = readOnboardingApplyJobAttemptByCorrelation(
    db,
    attempt.correlationId,
  );
  if (!recorded) {
    throw new Error("onboarding apply job attempt was not persisted");
  }
  if (recorded.transaction_request_id !== attempt.transactionRequestId) {
    throw new Error(
      "onboarding apply job attempt correlation conflicts with another request",
    );
  }

  return recorded;
}

function readOnboardingApplyJobAttemptByCorrelation(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): ExistingOnboardingApplyJobAttemptRow | undefined {
  return db
    .prepare(
      `
        SELECT
          transaction_request_id,
          status_code,
          error_message
        FROM onboarding_apply_job_attempt
        WHERE correlation_id = ?
        LIMIT 1
      `,
    )
    .get(correlationId) as ExistingOnboardingApplyJobAttemptRow | undefined;
}

function readOnboardingApplyJobAttemptsForWorkerCorrelation(
  db: OnboardingTransactionRequestDatabase,
  workerCorrelationId: string,
): ExistingOnboardingApplyJobAttemptRow[] {
  const statement = db.prepare(
    `
      SELECT
        transaction_request_id,
        status_code,
        error_message,
        correlation_id
      FROM onboarding_apply_job_attempt
      ORDER BY attempted_at, transaction_request_id
    `,
  );
  if (!statement.all) {
    throw new Error("onboarding apply worker requires query-all support");
  }

  return (
    statement.all() as (ExistingOnboardingApplyJobAttemptRow & {
      correlation_id: string;
    })[]
  )
    .filter(
      (attempt) =>
        attempt.correlation_id ===
        buildWorkerAttemptCorrelationId(
          workerCorrelationId,
          attempt.transaction_request_id,
        ),
    )
    .map(({ transaction_request_id, status_code, error_message }) => ({
      transaction_request_id,
      status_code,
      error_message,
    }));
}

function buildOnboardingApplyJobAttemptResult(
  existing: ExistingOnboardingApplyJobAttemptRow,
): ApplyDueOnboardingTransactionRequestsItemResult {
  if (existing.status_code === "applied") {
    return {
      transactionRequestId: existing.transaction_request_id,
      status: "applied",
      lifecycleEventId: buildOnboardingApplyLifecycleEventIdForRequest(
        existing.transaction_request_id,
      ),
    };
  }

  if (
    existing.status_code !== "retryable_failure" &&
    existing.status_code !== "non_retryable_failure"
  ) {
    throw new Error("onboarding apply job attempt retry is malformed");
  }

  return {
    transactionRequestId: existing.transaction_request_id,
    status: existing.status_code,
    errorMessage:
      existing.error_message ?? "unknown onboarding apply attempt failure",
  };
}

function buildOnboardingApplyLifecycleEventId(
  apply: ApplyApprovedOnboardingTransactionRequestInput,
): string {
  return buildOnboardingApplyLifecycleEventIdForRequest(
    apply.transactionRequestId,
  );
}

function buildOnboardingApplyLifecycleEventIdForRequest(
  transactionRequestId: string,
): string {
  return `lifecycle-event-${transactionRequestId}-apply`;
}

function buildOnboardingApplyAuditEventId(lifecycleEventId: string): string {
  return `audit-event-${lifecycleEventId}-applied`;
}

function buildOnboardingDecisionRetryResultAfterConflict(
  db: OnboardingTransactionRequestDatabase,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
  auditEventId: string,
): OnboardingApprovalDecisionResult | undefined {
  const latest = readOnboardingTransactionRequestById(
    db,
    decision.transactionRequestId,
  );
  const auditEvent = readAuditEventById(db, auditEventId);

  if (
    !latest ||
    latest.request_type !== "hire" ||
    latest.status_code !== target.statusCode ||
    !auditEvent
  ) {
    return undefined;
  }

  assertMatchingOnboardingDecisionAuditEvent(
    auditEvent,
    latest,
    decision,
    target,
  );
  return buildOnboardingDecisionResult(latest, decision, target, auditEventId);
}

function buildOnboardingDecisionAuditEventId(
  decision: OnboardingApprovalDecisionInput,
): string {
  return `audit-event-${decision.transactionRequestId}-${decision.decision}-${decision.correlationId}`;
}

function buildWorkerAttemptCorrelationId(
  workerCorrelationId: string,
  transactionRequestId: string,
): string {
  return `onboarding-apply-worker-attempt-${encodeStableKey([
    workerCorrelationId,
    transactionRequestId,
  ])}`;
}

function buildOnboardingApplyJobAttemptId(
  transactionRequestId: string,
  correlationId: string,
): string {
  return `onboarding-apply-job-attempt-${encodeStableKey([
    transactionRequestId,
    correlationId,
  ])}`;
}

function getMvpWorkerEffectiveDate(now: string): string {
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    throw new OnboardingTransactionRequestValidationError(
      "now must be a valid ISO timestamp",
    );
  }

  return parsed.toISOString().slice(0, 10);
}

function encodeStableKey(parts: string[]): string {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}

function isRetryableOnboardingApplyWorkerFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return !(
    error instanceof OnboardingTransactionRequestValidationError ||
    error.message.includes("persisted onboarding apply payload") ||
    error.message.includes("requires an approved hire transaction request") ||
    error.message.includes("retry conflicts with the completed request")
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "unknown onboarding apply error";
}

function assertMatchingOnboardingDecisionAuditEvent(
  auditEvent: ExistingAuditEventRow,
  existing: ExistingOnboardingTransactionRequestRow,
  decision: OnboardingApprovalDecisionInput,
  target: OnboardingDecisionTarget,
): void {
  if (
    auditEvent.actor_id !== decision.decidedBy ||
    auditEvent.action !== target.auditAction ||
    auditEvent.subject_table !== "transaction_request" ||
    auditEvent.subject_id !== existing.transaction_request_id ||
    auditEvent.occurred_at !== decision.decidedAt ||
    auditEvent.correlation_id !== decision.correlationId
  ) {
    throw new Error(
      "onboarding transaction request repeated decision conflicts with existing audit evidence",
    );
  }
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

  if (existing.status_code !== "draft" && existing.status_code !== "returned") {
    throw new Error(
      "onboarding transaction request can only be edited while draft or returned",
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

function requirePositiveInteger(fieldName: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new OnboardingTransactionRequestValidationError(
      `${fieldName} must be a positive integer`,
    );
  }

  return value;
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
