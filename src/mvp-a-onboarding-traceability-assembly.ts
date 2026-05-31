import {
  assertMvpAOnboardingEvidenceAuthorizationGate,
  mvpAOnboardingEvidenceAuthorizationGate,
} from "./mvp-a-onboarding-evidence-authorization.js";
import { mvpAOnboardingBindingGate } from "./mvp-a-onboarding-binding-gate.js";
import { assertTraceBindingEvidence } from "./mvp-a-onboarding-traceability-binding-evidence.js";
import {
  parseMvpAOnboardingPayload,
  readApplyJobAttempts,
  readAssignment,
  readAuditEvents,
  readEmployment,
  readInboundWorkEmailConflict,
  readLifecycleEvent,
  readProviderRefresh,
  readTransactionRequest,
  readWorkEmailProviderRefreshConflict,
  readWorkEmailWriteback,
  requireNonEmptyCorrelationId,
} from "./mvp-a-onboarding-traceability-db-reads.js";
import {
  requireString,
  throwTraceError,
} from "./mvp-a-onboarding-traceability-row-guards.js";
import {
  type MvpAOnboardingAuditTrace,
  type MvpAOnboardingCorrelationTrace,
  type MvpAOnboardingLifecycleTrace,
  type MvpAOnboardingPayload,
  type MvpAOnboardingTraceabilityDatabase,
  type MvpAOnboardingTransactionRequestRow,
  type MvpAOnboardingTransactionTrace,
  type MvpAOnboardingWritebackCorrelationChain,
  type VerifyMvpAOnboardingCorrelationTraceInput,
} from "./mvp-a-onboarding-traceability-types.js";

const remainingP2A02Gates = [
  "WORM / S3 Object Lock audit immutability and archive evidence",
  "broad audit search UI for production support and review",
  "production backup readiness beyond the local synthetic backup / restore rehearsal",
  "production field-level RBAC and data-scope enforcement beyond the bounded MVP-A onboarding evidence authorization gate",
  "export controls for raw payloads, CSV output, download logs, and watermark or manifest traceability",
  "real Okta tenant credentials, tenant binding, webhook custody, and provider audit search",
];

export function verifyMvpAOnboardingCorrelationTrace(
  db: MvpAOnboardingTraceabilityDatabase,
  input: VerifyMvpAOnboardingCorrelationTraceInput,
): MvpAOnboardingCorrelationTrace {
  assertMvpAOnboardingEvidenceAuthorizationGate(
    mvpAOnboardingEvidenceAuthorizationGate,
  );

  const correlationId = requireNonEmptyCorrelationId(input.correlationId);
  const request = readTransactionRequest(db, correlationId);
  const rootCorrelationId = requireString(request.correlation_id);
  const payload = parseMvpAOnboardingPayload(request);
  const applyJobAttempts = readApplyJobAttempts(db, request);
  const auditEvents = readAuditEvents(db, request);
  const approvalAuditEvents = auditEvents.filter(
    (event) => event.action === "mvp_a.onboarding.approve",
  );
  const applyAuditEvents = auditEvents.filter(
    (event) => event.action === "mvp_a.onboarding.apply",
  );
  if (approvalAuditEvents.length > 1) {
    throwTraceError(
      "MVP-A onboarding trace requires a single approval audit evidence record",
    );
  }
  if (applyAuditEvents.length > 1) {
    throwTraceError(
      "MVP-A onboarding trace requires a single apply audit evidence record",
    );
  }
  const approvalAuditEvent = approvalAuditEvents[0];
  const applyAuditEvent = applyAuditEvents[0];
  const lifecycleEvent = readLifecycleEvent(db, request, payload);

  if (input.requireApproval && approvalAuditEvent === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires approval audit evidence for the root correlation id",
    );
  }
  if (input.requireApply && lifecycleEvent === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires lifecycle apply evidence linked to the correlated transaction request",
    );
  }
  if (input.requireApply && applyAuditEvent === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires apply audit evidence for the root correlation id",
    );
  }
  const employment = readEmployment(db, request, payload);
  if (input.requireApply && employment === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires employment status evidence linked to the correlated transaction request",
    );
  }
  const assignment =
    employment === undefined
      ? undefined
      : readAssignment(db, request, payload, employment);
  if (input.requireApply && assignment === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires assignment reference evidence linked to the correlated transaction request",
    );
  }
  if (input.requireApplyJobAttempt === true && applyJobAttempts.length === 0) {
    throwTraceError(
      "MVP-A onboarding trace requires apply job attempt evidence linked to the correlated transaction request",
    );
  }

  assertTraceBindingEvidence({
    requestedCorrelationId: correlationId,
    request,
    payload,
    approvalAuditEvent,
    auditEvents,
    applyJobAttempts,
  });

  const writebackCorrelationChain = buildWritebackCorrelationChain(
    payload,
    readApplyEvidenceTimestamp(lifecycleEvent, applyAuditEvent),
  );
  const workEmailWriteback = readWorkEmailWriteback(
    db,
    request,
    payload,
    writebackCorrelationChain,
  );
  const providerRefresh = workEmailWriteback
    ? readProviderRefresh(db, workEmailWriteback, writebackCorrelationChain)
    : undefined;
  const providerRefreshConflict = workEmailWriteback
    ? readWorkEmailProviderRefreshConflict(
        db,
        workEmailWriteback,
        writebackCorrelationChain,
      )
    : undefined;
  const inboundWorkEmailConflict = workEmailWriteback
    ? readInboundWorkEmailConflict(
        db,
        workEmailWriteback,
        writebackCorrelationChain,
      )
    : undefined;
  const workEmailConflict = providerRefreshConflict ?? inboundWorkEmailConflict;
  const hasProviderRefreshEvidence =
    providerRefresh !== undefined || providerRefreshConflict !== undefined;

  if (input.requireWriteback && workEmailWriteback === undefined) {
    throwTraceError(
      "MVP-A onboarding trace requires work_email writeback evidence linked to the correlated onboarding payload",
    );
  }
  if (input.requireProviderRefresh && !hasProviderRefreshEvidence) {
    throwTraceError(
      "MVP-A onboarding trace requires provider refresh or provider refresh conflict evidence linked to the writeback event",
    );
  }

  return {
    transactionRequest: mapTransactionRequest(request, rootCorrelationId),
    authorizationGate: mvpAOnboardingEvidenceAuthorizationGate,
    bindingGate: mvpAOnboardingBindingGate,
    employment,
    assignment,
    approvalAuditEvent,
    applyAuditEvent,
    auditEvents,
    lifecycleEvent,
    applyJobAttempts,
    workEmailWriteback,
    providerRefresh,
    providerRefreshConflict,
    inboundWorkEmailConflict,
    workEmailConflict,
    remainingP2A02Gates: [...remainingP2A02Gates],
  };
}

function readApplyEvidenceTimestamp(
  lifecycleEvent: MvpAOnboardingLifecycleTrace | undefined,
  applyAuditEvent: MvpAOnboardingAuditTrace | undefined,
): string | undefined {
  if (
    lifecycleEvent !== undefined &&
    applyAuditEvent !== undefined &&
    lifecycleEvent.occurredAt !== applyAuditEvent.occurredAt
  ) {
    throwTraceError(
      "MVP-A onboarding trace requires consistent apply timestamps before selecting writeback evidence",
    );
  }

  return lifecycleEvent?.occurredAt ?? applyAuditEvent?.occurredAt;
}

function buildWritebackCorrelationChain(
  payload: MvpAOnboardingPayload,
  applyTimestamp: string | undefined,
): MvpAOnboardingWritebackCorrelationChain | undefined {
  if (applyTimestamp === undefined) return undefined;

  const writebackCorrelationId = [
    "okta",
    "mock",
    "work_email_writeback",
    "create",
    encodeMvpAOnboardingWorkEmailIdentityPart(
      payload.employment.employmentCode,
    ),
    encodeMvpAOnboardingWorkEmailIdentityPart(applyTimestamp),
  ].join(":");

  return {
    writebackCorrelationId,
    providerRefreshCorrelationPrefix: `${writebackCorrelationId}:provider_refresh:`,
    providerRefreshConflictCorrelationSuffix:
      ":conflict:provider_refresh_conflict",
    inboundConflictCorrelationId: `${writebackCorrelationId}:conflict:inbound_value_conflict`,
  };
}

function encodeMvpAOnboardingWorkEmailIdentityPart(value: string): string {
  return encodeURIComponent(value);
}

function mapTransactionRequest(
  row: MvpAOnboardingTransactionRequestRow,
  correlationId: string,
): MvpAOnboardingTransactionTrace {
  return {
    id: row.id,
    personId: row.person_id,
    requestType: row.request_type,
    statusCode: row.status_code,
    correlationId,
  };
}
