import { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";
import type {
  OktaGroupProjectionResult,
  OktaMasteringAdapter,
  OktaMasteringProjectionResult,
  SyntheticOktaUserFixture,
} from "./okta-mastering-adapter.js";
import {
  buildOnboardingApplyAuditEventId,
  buildOnboardingApplyLifecycleEventId,
  buildOnboardingDecisionAuditEventId,
  buildWorkerAttemptCorrelationId,
} from "./onboarding-transaction-request-ids.js";
import {
  parseApplyApprovedOnboardingTransactionRequestInput,
  parseOnboardingApprovalDecisionInput,
} from "./onboarding-transaction-request-parser.js";
import {
  readAuditEventById,
  readOnboardingApplyJobAttemptsForWorkerCorrelation,
  readOnboardingApplyJobRun,
  readOnboardingTransactionRequestById,
} from "./onboarding-transaction-request-readers.js";
import {
  assertLegalTransactionDecision,
  assertMatchingTransactionDecisionAuditEvent,
  buildApplyDueOnboardingTransactionRequestsResult,
  buildApplyDueOnboardingTransactionRequestsResultFromRun,
  buildOnboardingApplyJobAttemptResult,
  buildTransactionDecisionResult,
  buildTransactionDecisionRetryResultAfterConflict,
  getErrorMessage,
  getMvpWorkerEffectiveDate,
  getTransactionDecisionTarget,
  isSingleSqlChange,
  recordOnboardingApplyJobAttempt,
  recordOnboardingApplyJobRun,
  rollbackNamedSavepoint,
} from "./onboarding-transaction-request-shared.js";
import {
  assertSupportedFields,
  requireDate,
  requireNonEmpty,
  requirePositiveInteger,
  requireRecord,
  requireTimestamp,
} from "./onboarding-transaction-request-validation.js";
import type {
  OnboardingApprovalDecision,
  OnboardingApprovalDecisionInput,
  OnboardingApprovalDecisionResult,
  ApplyApprovedOnboardingTransactionRequestInput,
  ApplyDueOnboardingTransactionRequestsInput,
  ApplyDueOnboardingTransactionRequestsItemResult,
  ApplyDueOnboardingTransactionRequestsResult,
  ApplyDueOnboardingTransactionRequestsStatus,
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestPersistedStatus,
} from "./onboarding-transaction-request.js";

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

export interface TransferTransactionRequestPersistenceResult {
  personId: string;
  transactionRequestId: string;
  statusCode: OnboardingTransactionRequestPersistedStatus;
  correlationId: string;
}

export type TransferApprovalDecision = OnboardingApprovalDecision;
export type TransferApprovalDecisionInput = OnboardingApprovalDecisionInput;
export type TransferApprovalDecisionResult = OnboardingApprovalDecisionResult;
export type ApplyApprovedTransferTransactionRequestInput =
  ApplyApprovedOnboardingTransactionRequestInput;
export type ApplyDueTransferTransactionRequestsInput =
  ApplyDueOnboardingTransactionRequestsInput;
export type ApplyDueTransferTransactionRequestsItemResult =
  ApplyDueOnboardingTransactionRequestsItemResult;
export type ApplyDueTransferTransactionRequestsResult =
  ApplyDueOnboardingTransactionRequestsResult;
export type ApplyDueTransferTransactionRequestsStatus =
  ApplyDueOnboardingTransactionRequestsStatus;

export interface AppliedTransferTransactionRequestResult {
  personId: string;
  employmentId: string;
  closedAssignmentId: string;
  targetAssignmentId: string;
  transactionRequestId: string;
  lifecycleEventId: string;
  statusCode: "completed";
  correlationId: string;
}

export type OktaTransferProfileProjectionStatus =
  | "projected"
  | "skipped"
  | "retryable_failure"
  | "failed";

export type OktaTransferGroupProjectionStatus =
  | "projected"
  | "already_projected"
  | "skipped"
  | "failed";

export interface OktaTransferProjectionImpactEvidence {
  provider: "okta";
  adapterMode: "mock";
  synthetic: true;
  authoritativeForRbac: false;
  transactionRequestId: string;
  lifecycleEventId: string;
  applyCorrelationId: string;
  profile: {
    status: OktaTransferProfileProjectionStatus;
    result: OktaMasteringProjectionResult;
  };
  groups: {
    status: OktaTransferGroupProjectionStatus;
    result?: OktaGroupProjectionResult;
    skippedReason?: "profile_projection_not_successful";
  };
}

export interface AppliedTransferTransactionRequestWithOktaProjectionResult extends AppliedTransferTransactionRequestResult {
  oktaProjection: OktaTransferProjectionImpactEvidence;
}

export interface ApplyApprovedTransferTransactionRequestWithOktaProjectionInput extends ApplyApprovedTransferTransactionRequestInput {
  oktaAdapter: OktaMasteringAdapter;
}

type TransferTransactionRequestFixtureOverrides = {
  person?: Partial<TransferTransactionRequestPersonInput>;
  payload?: Partial<Record<string, unknown>>;
} & Partial<Omit<TransferTransactionRequestInput, "person" | "payload">>;

type ExistingTransferTransactionRequestRow = {
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

type ExistingTransferPersonRow = {
  id: string;
  display_name: string;
  created_at: string;
};

type ExistingTransferAssignmentRow = {
  id: string;
  person_id: string;
  employment_id: string;
  assignment_code: string;
  organization_code: string;
  position_code: string | null;
  start_date: string;
  end_date: string | null;
};

type ExistingCompletedTransferApplyRow = {
  transaction_status_code: string;
  request_type: string;
  person_id: string;
  payload_version: string | null;
  payload_json: string | null;
  lifecycle_event_id: string | null;
  lifecycle_event_type: string | null;
  lifecycle_effective_date: string | null;
  lifecycle_occurred_at: string | null;
  current_assignment_id: string | null;
  current_employment_id: string | null;
  current_assignment_code: string | null;
  current_assignment_end_date: string | null;
  target_assignment_id: string | null;
  target_employment_id: string | null;
  target_assignment_code: string | null;
  target_organization_code: string | null;
  target_position_code: string | null;
  target_assignment_start_date: string | null;
  target_assignment_end_date: string | null;
  audit_event_id: string | null;
  audit_actor_id: string | null;
  audit_action: string | null;
  audit_subject_table: string | null;
  audit_subject_id: string | null;
  audit_occurred_at: string | null;
  audit_correlation_id: string | null;
};

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
    payload: parsePayload(request.payload),
  };
}

export function saveTransferTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): TransferTransactionRequestPersistenceResult {
  const parsed = parseTransferTransactionRequestInput(input);
  const payloadJson = serializeTransferPayload(parsed.payload);
  const existingRequest = readTransferTransactionRequest(db, parsed);

  if (existingRequest) {
    if (matchesTransferRetry(existingRequest, parsed, payloadJson)) {
      return buildTransferRetryResult(existingRequest);
    }

    // Drafts and returned requests may be edited only through the same durable
    // request/person/correlation binding.
    if (isEditableTransferBinding(existingRequest, parsed)) {
      return updateEditableTransferRequest(
        db,
        existingRequest,
        parsed,
        payloadJson,
      );
    }

    throw new Error(
      "transfer transaction request retry conflicts with the existing request",
    );
  }

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT transfer_transaction_request_persistence");
    savepointStarted = true;

    ensureTransferPerson(db, parsed.person);

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

    db.exec("RELEASE SAVEPOINT transfer_transaction_request_persistence");

    return {
      personId: parsed.person.id,
      transactionRequestId: parsed.id,
      statusCode: parsed.statusCode,
      correlationId: parsed.correlationId,
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackTransferSavepoint(db);
      const retryAfterRollback = readTransferTransactionRequest(db, parsed);
      if (
        retryAfterRollback &&
        matchesTransferRetry(retryAfterRollback, parsed, payloadJson)
      ) {
        return buildTransferRetryResult(retryAfterRollback);
      }
    }

    throw error;
  }
}

export function decideTransferTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): TransferApprovalDecisionResult {
  const decision = parseOnboardingApprovalDecisionInput(input);
  const target = getTransactionDecisionTarget(
    decision.decision,
    "mvp_b.transfer",
  );
  const auditEventId = buildOnboardingDecisionAuditEventId(decision);
  const scope = {
    requestType: "transfer",
    label: "transfer transaction request",
  };
  const existing = readOnboardingTransactionRequestById(
    db,
    decision.transactionRequestId,
  );

  if (!existing || existing.request_type !== scope.requestType) {
    throw new Error("transfer transaction request decision target not found");
  }

  const existingAuditEvent = readAuditEventById(db, auditEventId);
  if (existing.status_code === target.statusCode && existingAuditEvent) {
    assertMatchingTransactionDecisionAuditEvent(
      existingAuditEvent,
      existing,
      decision,
      target,
      scope,
    );
    return buildTransactionDecisionResult(
      existing,
      decision,
      target,
      auditEventId,
    );
  }

  assertLegalTransactionDecision(existing, decision, target, scope);

  db.exec("SAVEPOINT transfer_transaction_request_decision");
  try {
    const updateResult = db
      .prepare(
        `
          UPDATE transaction_request
          SET status_code = ?
          WHERE id = ?
            AND person_id = ?
            AND request_type = 'transfer'
            AND status_code = 'submitted'
        `,
      )
      .run(
        target.statusCode,
        existing.transaction_request_id,
        existing.person_id,
      );
    if (!isSingleSqlChange(updateResult)) {
      const retryResult = buildTransactionDecisionRetryResultAfterConflict(
        db,
        decision,
        target,
        auditEventId,
        scope,
      );
      if (retryResult) {
        db.exec("RELEASE SAVEPOINT transfer_transaction_request_decision");
        return retryResult;
      }

      throw new Error(
        "transfer transaction request decision conflicts with the current submitted state",
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

    db.exec("RELEASE SAVEPOINT transfer_transaction_request_decision");
  } catch (error) {
    rollbackNamedSavepoint(db, "transfer_transaction_request_decision");
    throw error;
  }

  return buildTransactionDecisionResult(
    existing,
    decision,
    target,
    auditEventId,
  );
}

export function applyApprovedTransferTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): AppliedTransferTransactionRequestResult {
  const apply = parseApplyApprovedOnboardingTransactionRequestInput(input);
  const lifecycleEventId = buildOnboardingApplyLifecycleEventId(apply);
  const auditEventId = buildOnboardingApplyAuditEventId(lifecycleEventId);
  const existing = readOnboardingTransactionRequestById(
    db,
    apply.transactionRequestId,
  );

  if (
    existing &&
    existing.request_type === "transfer" &&
    existing.status_code === "completed"
  ) {
    const payload = parsePersistedTransferApplyPayload(existing);
    const completedApply = readCompletedTransferApply(
      db,
      apply,
      lifecycleEventId,
      auditEventId,
      payload,
    );
    if (!completedApply) {
      throw new Error(
        "approved transfer apply retry conflicts with the completed request",
      );
    }

    return buildCompletedTransferApplyRetryResult(
      completedApply,
      payload,
      apply,
      lifecycleEventId,
    );
  }

  if (
    !existing ||
    existing.request_type !== "transfer" ||
    existing.status_code !== "approved"
  ) {
    throw new Error(
      "approved transfer apply requires an approved transfer transaction request",
    );
  }

  const payload = parsePersistedTransferApplyPayload(existing);
  const currentAssignment = readCurrentTransferAssignment(
    db,
    existing,
    payload,
  );
  assertSupportedTransferAssignmentWindow(currentAssignment, payload);
  assertNoTransferAssignmentCollision(db, currentAssignment, payload);

  const targetAssignmentId = buildTransferTargetAssignmentId(
    existing.transaction_request_id,
  );
  const targetAssignmentCode = buildTransferTargetAssignmentCode(payload);
  const closedCurrentAssignmentEndDate = previousIsoDate(payload.effectiveDate);

  db.exec("SAVEPOINT approved_transfer_transaction_request_apply");
  try {
    const closeCurrentResult = db
      .prepare(
        `
        UPDATE assignment
        SET end_date = ?
        WHERE id = ?
          AND person_id = ?
          AND employment_id = ?
          AND assignment_code = ?
          AND end_date IS NULL
      `,
      )
      .run(
        closedCurrentAssignmentEndDate,
        currentAssignment.id,
        existing.person_id,
        currentAssignment.employment_id,
        payload.currentAssignment.assignmentCode,
      );
    if (!isSingleSqlChange(closeCurrentResult)) {
      throw new Error(
        "approved transfer apply conflicts with the current assignment state",
      );
    }

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
      targetAssignmentId,
      existing.person_id,
      currentAssignment.employment_id,
      targetAssignmentCode,
      payload.targetAssignment.organizationReference,
      payload.targetAssignment.positionCode ?? null,
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
        VALUES (?, ?, ?, 'assignment_change', ?, ?)
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
            AND request_type = 'transfer'
            AND status_code = 'approved'
        `,
      )
      .run(existing.transaction_request_id, existing.person_id);
    if (!isSingleSqlChange(updateResult)) {
      throw new Error(
        "approved transfer apply conflicts with the current approved state",
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
        VALUES (?, ?, 'mvp_b.transfer.apply', 'lifecycle_event', ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      auditEventId,
      apply.appliedBy,
      lifecycleEventId,
      apply.appliedAt,
      apply.correlationId,
    );

    db.exec("RELEASE SAVEPOINT approved_transfer_transaction_request_apply");
  } catch (error) {
    rollbackNamedSavepoint(db, "approved_transfer_transaction_request_apply");
    const completedAfterRollback = readCompletedTransferApply(
      db,
      apply,
      lifecycleEventId,
      auditEventId,
      payload,
    );
    if (completedAfterRollback) {
      return buildCompletedTransferApplyRetryResult(
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
    employmentId: currentAssignment.employment_id,
    closedAssignmentId: currentAssignment.id,
    targetAssignmentId,
    transactionRequestId: existing.transaction_request_id,
    lifecycleEventId,
    statusCode: "completed",
    correlationId: apply.correlationId,
  };
}

export async function applyApprovedTransferTransactionRequestWithOktaProjection(
  db: OnboardingTransactionRequestDatabase,
  input: ApplyApprovedTransferTransactionRequestWithOktaProjectionInput,
): Promise<AppliedTransferTransactionRequestWithOktaProjectionResult> {
  const { oktaAdapter, ...applyInput } = input;
  const applied = applyApprovedTransferTransactionRequest(db, applyInput);
  const existing = readOnboardingTransactionRequestById(
    db,
    applied.transactionRequestId,
  );
  if (!existing || existing.request_type !== "transfer") {
    throw new Error("Okta transfer projection requires an applied transfer");
  }

  const payload = parsePersistedTransferApplyPayload(existing);
  const employmentCode = readTransferEmploymentCode(db, applied.employmentId);
  const profileResult = await oktaAdapter.project({
    operation: "update",
    desiredUser: buildMvpBTransferOktaUserProjection({
      existing,
      payload,
      employmentCode,
      effectiveAt: input.appliedAt,
    }),
  });
  const profileStatus = toOktaTransferProfileProjectionStatus(profileResult);

  let groupProjection:
    | OktaTransferProjectionImpactEvidence["groups"]
    | undefined;
  if (profileResult.outcome === "success") {
    const groupResult = await oktaAdapter.projectGroups({
      operation: "replace_user_groups",
      employeeNumber: employmentCode,
      groupKeys: buildMvpBTransferOktaGroupKeys(payload),
      effectiveAt: input.appliedAt,
    });
    groupProjection = {
      status: toOktaTransferGroupProjectionStatus(groupResult),
      result: groupResult,
    };
  } else {
    groupProjection = {
      status: "skipped",
      skippedReason: "profile_projection_not_successful",
    };
  }

  return {
    ...applied,
    oktaProjection: {
      provider: "okta",
      adapterMode: "mock",
      synthetic: true,
      authoritativeForRbac: false,
      transactionRequestId: applied.transactionRequestId,
      lifecycleEventId: applied.lifecycleEventId,
      applyCorrelationId: applied.correlationId,
      profile: {
        status: profileStatus,
        result: profileResult,
      },
      groups: groupProjection,
    },
  };
}

export function applyDueTransferTransactionRequests(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): ApplyDueTransferTransactionRequestsResult {
  const worker = parseApplyDueTransferTransactionRequestsInput(input);
  const batchLimit = worker.batchLimit ?? 100;
  const effectiveDate = getMvpWorkerEffectiveDate(worker.now);
  const replayedRun = readOnboardingApplyJobRun(db, worker.correlationId);
  const replayedAttempts = readOnboardingApplyJobAttemptsForWorkerCorrelation(
    db,
    worker.correlationId,
  );
  if (replayedRun) {
    if (replayedAttempts.length > 0) {
      return buildApplyDueOnboardingTransactionRequestsResult(
        worker.correlationId,
        replayedAttempts,
        replayedRun.skipped,
      );
    }

    return buildApplyDueOnboardingTransactionRequestsResultFromRun(
      worker.correlationId,
      replayedRun,
    );
  }

  const candidates = readDueTransferApplyCandidates(
    db,
    batchLimit,
    effectiveDate,
  );
  const results: ApplyDueTransferTransactionRequestsItemResult[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const attemptCorrelationId = buildWorkerAttemptCorrelationId(
      worker.correlationId,
      candidate.transaction_request_id,
    );

    let payload: TransferTransactionRequestPayload;
    try {
      payload = parsePersistedTransferApplyPayload(candidate);
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
      const applied = applyApprovedTransferTransactionRequest(db, {
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
      const retryable = isRetryableTransferApplyWorkerFailure(error);
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

  const persistedAttempts = readOnboardingApplyJobAttemptsForWorkerCorrelation(
    db,
    worker.correlationId,
  );
  const result = buildApplyDueOnboardingTransactionRequestsResult(
    worker.correlationId,
    persistedAttempts.length > 0 ? persistedAttempts : results,
    skipped,
  );
  recordOnboardingApplyJobRun(db, {
    correlationId: worker.correlationId,
    workerId: worker.workerId,
    startedAt: worker.now,
    effectiveDate,
    attempted: result.attempted,
    applied: result.applied,
    failed: result.failed,
    skipped: result.skipped,
  });
  return result;
}

function parseApplyDueTransferTransactionRequestsInput(
  input: unknown,
): ApplyDueTransferTransactionRequestsInput {
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

function readDueTransferApplyCandidates(
  db: OnboardingTransactionRequestDatabase,
  batchLimit: number,
  effectiveDate: string,
): ExistingTransferTransactionRequestRow[] {
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
      WHERE transaction_request.request_type = 'transfer'
        AND transaction_request.status_code = 'approved'
        AND NOT EXISTS (
          SELECT 1
          FROM onboarding_apply_job_attempt
          WHERE onboarding_apply_job_attempt.transaction_request_id = transaction_request.id
            AND onboarding_apply_job_attempt.status_code = 'non_retryable_failure'
        )
      ORDER BY
        CASE
          WHEN transaction_request.payload_version = 'mvp_b_transfer_v1'
            AND json_valid(transaction_request.payload_json) = 1
            AND json_type(transaction_request.payload_json, '$.effectiveDate') = 'text'
            AND json_extract(transaction_request.payload_json, '$.effectiveDate') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
            AND date(json_extract(transaction_request.payload_json, '$.effectiveDate')) = json_extract(transaction_request.payload_json, '$.effectiveDate')
            AND json_extract(transaction_request.payload_json, '$.effectiveDate') <= ? THEN 0
          WHEN transaction_request.payload_version != 'mvp_b_transfer_v1' THEN 1
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
    throw new Error("transfer apply worker requires query-all support");
  }

  return statement.all(
    effectiveDate,
    batchLimit,
  ) as ExistingTransferTransactionRequestRow[];
}

function isRetryableTransferApplyWorkerFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return !(
    error instanceof OnboardingTransactionRequestValidationError ||
    error.message.includes("persisted transfer apply payload") ||
    error.message.includes(
      "approved transfer apply requires an approved transfer transaction request",
    ) ||
    error.message.includes("retry conflicts with the completed request")
  );
}

function readTransferEmploymentCode(
  db: OnboardingTransactionRequestDatabase,
  employmentId: string,
): string {
  const row = db
    .prepare(
      `
        SELECT employment_code
        FROM employment
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(employmentId) as { employment_code: string } | undefined;
  if (!row) {
    throw new Error("Okta transfer projection requires applied employment");
  }

  return row.employment_code;
}

function buildMvpBTransferOktaUserProjection(input: {
  existing: ExistingTransferTransactionRequestRow;
  payload: TransferTransactionRequestPayload;
  employmentCode: string;
  effectiveAt: string;
}): SyntheticOktaUserFixture {
  const { givenName, familyName } = splitSyntheticDisplayName(
    input.existing.display_name,
  );

  return {
    externalId: `synthetic-okta-user-${input.existing.person_id}`,
    employeeNumber: input.employmentCode,
    email: `${input.existing.person_id}@example.invalid`,
    displayName: input.existing.display_name,
    givenName,
    familyName,
    status: "active",
    departmentCode: input.payload.targetAssignment.departmentReference,
    managerExternalId: input.payload.targetAssignment.managerReference,
    effectiveAt: input.effectiveAt,
  };
}

function buildMvpBTransferOktaGroupKeys(
  payload: TransferTransactionRequestPayload,
): string[] {
  return [
    `DEPT-${payload.targetAssignment.departmentReference}`,
    `ORG-${payload.targetAssignment.organizationReference}`,
  ];
}

function toOktaTransferProfileProjectionStatus(
  result: OktaMasteringProjectionResult,
): OktaTransferProfileProjectionStatus {
  switch (result.outcome) {
    case "success":
      return "projected";
    case "retryable_failure":
      return "retryable_failure";
    case "permanent_failure":
      return "failed";
    case "skipped":
      return "skipped";
  }
}

function toOktaTransferGroupProjectionStatus(
  result: OktaGroupProjectionResult,
): OktaTransferGroupProjectionStatus {
  if (result.outcome === "success") {
    return "projected";
  }

  if (result.outcome === "skipped") {
    return result.reason === "already_projected"
      ? "already_projected"
      : "skipped";
  }

  return "failed";
}

function splitSyntheticDisplayName(displayName: string): {
  givenName: string;
  familyName: string;
} {
  const parts = displayName.trim().split(/\s+/u);
  const givenName = parts[0] ?? displayName;
  const familyName = parts.slice(1).join(" ") || givenName;

  return { givenName, familyName };
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

function parsePayload(input: unknown): TransferTransactionRequestPayload {
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

function serializeTransferPayload(
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

function parsePersistedTransferApplyPayload(
  existing: ExistingTransferTransactionRequestRow,
): TransferTransactionRequestPayload {
  if (existing.payload_version !== "mvp_b_transfer_v1") {
    throw new Error("persisted transfer apply payload version is unsupported");
  }
  if (existing.payload_json === null) {
    throw new Error("persisted transfer apply payload is missing");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(existing.payload_json);
  } catch {
    throw new Error("persisted transfer apply payload is malformed JSON");
  }

  return parsePayload(payload);
}

function readCurrentTransferAssignment(
  db: OnboardingTransactionRequestDatabase,
  existing: ExistingTransferTransactionRequestRow,
  payload: TransferTransactionRequestPayload,
): ExistingTransferAssignmentRow {
  const assignment = db
    .prepare(
      `
        SELECT
          id,
          person_id,
          employment_id,
          assignment_code,
          organization_code,
          position_code,
          start_date,
          end_date
        FROM assignment
        WHERE id = ?
          AND person_id = ?
          AND assignment_code = ?
        LIMIT 1
      `,
    )
    .get(
      payload.currentAssignment.assignmentId,
      existing.person_id,
      payload.currentAssignment.assignmentCode,
    ) as ExistingTransferAssignmentRow | undefined;

  if (!assignment) {
    throw new Error(
      "approved transfer apply requires the explicit current assignment",
    );
  }

  return assignment;
}

function assertSupportedTransferAssignmentWindow(
  assignment: ExistingTransferAssignmentRow,
  payload: TransferTransactionRequestPayload,
): void {
  if (assignment.end_date !== null) {
    throw new Error(
      "approved transfer apply requires an open current assignment",
    );
  }
  if (assignment.start_date >= payload.effectiveDate) {
    throw new Error(
      "approved transfer apply requires the effective date after the current assignment start date",
    );
  }
}

function assertNoTransferAssignmentCollision(
  db: OnboardingTransactionRequestDatabase,
  currentAssignment: ExistingTransferAssignmentRow,
  payload: TransferTransactionRequestPayload,
): void {
  const collision = db
    .prepare(
      `
        SELECT id
        FROM assignment
        WHERE person_id = ?
          AND employment_id = ?
          AND id != ?
          AND (end_date IS NULL OR end_date >= ?)
        LIMIT 1
      `,
    )
    .get(
      currentAssignment.person_id,
      currentAssignment.employment_id,
      currentAssignment.id,
      payload.effectiveDate,
    );

  if (collision) {
    throw new Error(
      "approved transfer apply detected overlapping assignment effective dates",
    );
  }
}

function readCompletedTransferApply(
  db: OnboardingTransactionRequestDatabase,
  apply: ApplyApprovedTransferTransactionRequestInput,
  lifecycleEventId: string,
  auditEventId: string,
  payload: TransferTransactionRequestPayload,
): ExistingCompletedTransferApplyRow | undefined {
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
          current_assignment.id AS current_assignment_id,
          current_assignment.employment_id AS current_employment_id,
          current_assignment.assignment_code AS current_assignment_code,
          current_assignment.end_date AS current_assignment_end_date,
          target_assignment.id AS target_assignment_id,
          target_assignment.employment_id AS target_employment_id,
          target_assignment.assignment_code AS target_assignment_code,
          target_assignment.organization_code AS target_organization_code,
          target_assignment.position_code AS target_position_code,
          target_assignment.start_date AS target_assignment_start_date,
          target_assignment.end_date AS target_assignment_end_date,
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
        LEFT JOIN assignment AS current_assignment
          ON current_assignment.id = ?
         AND current_assignment.person_id = transaction_request.person_id
        LEFT JOIN assignment AS target_assignment
          ON target_assignment.id = ?
         AND target_assignment.person_id = transaction_request.person_id
         AND target_assignment.employment_id = current_assignment.employment_id
        WHERE transaction_request.id = ?
          AND transaction_request.status_code = 'completed'
        LIMIT 1
      `,
    )
    .get(
      lifecycleEventId,
      auditEventId,
      payload.currentAssignment.assignmentId,
      buildTransferTargetAssignmentId(apply.transactionRequestId),
      apply.transactionRequestId,
    ) as ExistingCompletedTransferApplyRow | undefined;
}

function buildCompletedTransferApplyRetryResult(
  existing: ExistingCompletedTransferApplyRow,
  payload: TransferTransactionRequestPayload,
  apply: ApplyApprovedTransferTransactionRequestInput,
  lifecycleEventId: string,
): AppliedTransferTransactionRequestResult {
  const targetAssignmentId = buildTransferTargetAssignmentId(
    apply.transactionRequestId,
  );
  assertCompletedTransferApplyMatchesInput(
    existing,
    payload,
    apply,
    lifecycleEventId,
    targetAssignmentId,
  );

  if (existing.current_assignment_id === null) {
    throw new Error(
      "approved transfer apply retry conflicts with the completed request",
    );
  }
  if (existing.current_employment_id === null) {
    throw new Error(
      "approved transfer apply retry conflicts with the completed request",
    );
  }

  return {
    personId: existing.person_id,
    employmentId: existing.current_employment_id,
    closedAssignmentId: existing.current_assignment_id,
    targetAssignmentId,
    transactionRequestId: apply.transactionRequestId,
    lifecycleEventId,
    statusCode: "completed",
    correlationId: apply.correlationId,
  };
}

function assertCompletedTransferApplyMatchesInput(
  existing: ExistingCompletedTransferApplyRow,
  payload: TransferTransactionRequestPayload,
  apply: ApplyApprovedTransferTransactionRequestInput,
  lifecycleEventId: string,
  targetAssignmentId: string,
): void {
  const expectedClosedEndDate = previousIsoDate(payload.effectiveDate);
  if (
    existing.transaction_status_code !== "completed" ||
    existing.request_type !== "transfer" ||
    existing.lifecycle_event_id !== lifecycleEventId ||
    existing.lifecycle_event_type !== "assignment_change" ||
    existing.lifecycle_effective_date !== payload.effectiveDate ||
    existing.lifecycle_occurred_at !== apply.appliedAt ||
    existing.current_assignment_id !== payload.currentAssignment.assignmentId ||
    existing.current_employment_id === null ||
    existing.current_assignment_code !==
      payload.currentAssignment.assignmentCode ||
    existing.current_assignment_end_date !== expectedClosedEndDate ||
    existing.target_assignment_id !== targetAssignmentId ||
    existing.target_employment_id !== existing.current_employment_id ||
    existing.target_assignment_code !==
      buildTransferTargetAssignmentCode(payload) ||
    existing.target_organization_code !==
      payload.targetAssignment.organizationReference ||
    existing.target_position_code !==
      (payload.targetAssignment.positionCode ?? null) ||
    existing.target_assignment_start_date !== payload.effectiveDate ||
    existing.target_assignment_end_date !== null ||
    existing.audit_event_id !==
      buildOnboardingApplyAuditEventId(lifecycleEventId) ||
    existing.audit_actor_id !== apply.appliedBy ||
    existing.audit_action !== "mvp_b.transfer.apply" ||
    existing.audit_subject_table !== "lifecycle_event" ||
    existing.audit_subject_id !== lifecycleEventId ||
    existing.audit_occurred_at !== apply.appliedAt ||
    existing.audit_correlation_id !== apply.correlationId
  ) {
    throw new Error(
      "approved transfer apply retry conflicts with the completed request",
    );
  }
}

function buildTransferTargetAssignmentId(transactionRequestId: string): string {
  return `assignment-${transactionRequestId}-transfer-target`;
}

function buildTransferTargetAssignmentCode(
  payload: TransferTransactionRequestPayload,
): string {
  return `${payload.currentAssignment.assignmentCode}-XFER-${payload.effectiveDate.replaceAll(
    "-",
    "",
  )}`;
}

function previousIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
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

function readTransferTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: TransferTransactionRequestInput,
): ExistingTransferTransactionRequestRow | undefined {
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
    )
    .get(
      input.correlationId,
      input.id,
      input.person.id,
      input.correlationId,
      input.id,
      input.person.id,
    ) as ExistingTransferTransactionRequestRow | undefined;
}

function readTransferPerson(
  db: OnboardingTransactionRequestDatabase,
  personId: string,
): ExistingTransferPersonRow | undefined {
  return db
    .prepare(
      `
        SELECT id, display_name, created_at
        FROM person
        WHERE id = ?
      `,
    )
    .get(personId) as ExistingTransferPersonRow | undefined;
}

function ensureTransferPerson(
  db: OnboardingTransactionRequestDatabase,
  person: TransferTransactionRequestPersonInput,
): void {
  const existingPerson = readTransferPerson(db, person.id);

  if (!existingPerson) {
    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES (?, ?, ?)
      `,
    ).run(person.id, person.displayName, person.createdAt);
    return;
  }

  if (
    existingPerson.display_name !== person.displayName ||
    existingPerson.created_at !== person.createdAt
  ) {
    throw new Error(
      "transfer transaction request person conflicts with the existing person",
    );
  }
}

function matchesTransferRetry(
  existing: ExistingTransferTransactionRequestRow,
  input: TransferTransactionRequestInput,
  payloadJson: string,
): boolean {
  return (
    existing.status_code === input.statusCode &&
    existing.transaction_request_id === input.id &&
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

function isEditableTransferBinding(
  existing: ExistingTransferTransactionRequestRow,
  input: TransferTransactionRequestInput,
): boolean {
  return (
    (existing.status_code === "draft" || existing.status_code === "returned") &&
    existing.transaction_request_id === input.id &&
    existing.person_id === input.person.id &&
    existing.request_type === input.requestType &&
    existing.correlation_id === input.correlationId &&
    existing.payload_version === input.payloadVersion
  );
}

function updateEditableTransferRequest(
  db: OnboardingTransactionRequestDatabase,
  existing: ExistingTransferTransactionRequestRow,
  input: TransferTransactionRequestInput,
  payloadJson: string,
): TransferTransactionRequestPersistenceResult {
  db.exec("SAVEPOINT transfer_transaction_request_edit");
  try {
    db.prepare(
      `
        UPDATE person
        SET display_name = ?,
            created_at = ?
        WHERE id = ?
      `,
    ).run(input.person.displayName, input.person.createdAt, input.person.id);

    const updateResult = db
      .prepare(
        `
        UPDATE transaction_request
        SET status_code = ?,
            requested_at = ?,
            payload_json = ?
        WHERE id = ?
          AND person_id = ?
          AND correlation_id = ?
          AND status_code in ('draft', 'returned')
      `,
      )
      .run(
        input.statusCode,
        input.requestedAt,
        payloadJson,
        existing.transaction_request_id,
        input.person.id,
        input.correlationId,
      ) as { changes?: number | bigint };

    if (updateResult.changes !== 1 && updateResult.changes !== 1n) {
      throw new Error(
        "transfer transaction request edit conflicts with the current request state",
      );
    }

    db.exec("RELEASE SAVEPOINT transfer_transaction_request_edit");
  } catch (error) {
    rollbackNamedSavepoint(db, "transfer_transaction_request_edit");
    throw error;
  }

  return {
    personId: input.person.id,
    transactionRequestId: existing.transaction_request_id,
    statusCode: input.statusCode,
    correlationId: input.correlationId,
  };
}

function buildTransferRetryResult(
  existing: ExistingTransferTransactionRequestRow,
): TransferTransactionRequestPersistenceResult {
  if (existing.correlation_id === null) {
    throw new Error(
      "transfer transaction request retry read malformed existing request",
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

function rollbackTransferSavepoint(
  db: OnboardingTransactionRequestDatabase,
): void {
  try {
    db.exec("ROLLBACK TO SAVEPOINT transfer_transaction_request_persistence");
  } finally {
    db.exec("RELEASE SAVEPOINT transfer_transaction_request_persistence");
  }
}
