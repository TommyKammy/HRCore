import { type FastifyInstance } from "fastify";

import {
  MvpAOnboardingEvidenceAccessError,
  type MvpAOnboardingEvidenceSurface,
  type MvpAOnboardingFieldScope,
  mvpAOnboardingEvidenceAuthorizationGate,
  validateMvpAOnboardingEvidenceRuntimeAccessContext,
  validateMvpAOnboardingEvidenceScopeRequest,
} from "../mvp-a-onboarding-evidence-authorization.js";
import {
  MvpAOnboardingCorrelationTraceError,
  verifyMvpAOnboardingCorrelationTrace,
  type MvpAOnboardingTraceabilityDatabase,
} from "../mvp-a-onboarding-traceability.js";
import { isRecord, readSingleHeader } from "./http-helpers.js";
import {
  buildAuthorizedMvpAOnboardingCorrelationTraceSummary,
  buildMvpAOnboardingTraceVerificationRequirements,
} from "./mvp-a-onboarding-trace-response.js";

interface MvpAOnboardingSupportReviewDatabase extends MvpAOnboardingTraceabilityDatabase {
  prepare(sql: string): MvpAOnboardingSupportReviewSqlStatement;
}

interface MvpAOnboardingSupportReviewSqlStatement {
  get(...values: unknown[]): unknown;
  all(...values: unknown[]): unknown[];
  run(...values: unknown[]): unknown;
}

class MvpAOnboardingSupportReviewAccessError extends Error {
  override name = "MvpAOnboardingSupportReviewAccessError";
}

class MvpAOnboardingSupportReviewConflictError extends Error {
  override name = "MvpAOnboardingSupportReviewConflictError";
}

const defaultMvpAOnboardingSupportReviewEvidenceSurfaces: readonly MvpAOnboardingEvidenceSurface[] =
  [
    "transaction_request",
    "person",
    "employment",
    "assignment",
    "audit_event",
    "lifecycle_event",
  ];

const mvpAOnboardingSupportReviewBlockedGates = [
  "WORM / S3 Object Lock audit immutability and archive evidence",
  "hash-chain archive verification for production audit storage",
  "provider audit search for live Okta or other external tenants",
  "compliance restore evidence beyond the local synthetic rehearsal",
  "production support procedures, custody, ticket binding, and post-use review",
] as const;

const mvpAOnboardingSupportActorPrefix = "operator-support-";

const mvpAOnboardingSupportReviewInputKeys = new Set([
  "correlationId",
  "reviewCorrelationId",
  "reasonCode",
  "requestedEvidenceSurfaces",
  "requestedFieldScopes",
]);

const mvpAOnboardingSupportReviewPlaceholderTokens = new Set([
  "todo",
  "tbd",
  "unknown",
  "placeholder",
  "sample",
  "example",
  "dummy",
  "fake",
  "admin",
  "anonymous",
]);

type MvpAOnboardingSupportReviewReasonCode = "onboarding_evidence_review";

interface MvpAOnboardingSupportReviewInput {
  correlationId: string;
  reviewCorrelationId: string;
  reasonCode: MvpAOnboardingSupportReviewReasonCode;
  requestedEvidenceSurfaces: readonly MvpAOnboardingEvidenceSurface[];
  requestedFieldScopes?: readonly MvpAOnboardingFieldScope[];
}

export function registerMvpAOnboardingSupportReviewRoutes(
  app: FastifyInstance,
  options: { onboardingDb?: unknown },
): void {
  app.post("/support/mvp-a/onboarding-reviews", async (request, reply) => {
    const supportReviewDb = options.onboardingDb as
      | MvpAOnboardingSupportReviewDatabase
      | undefined;
    if (!supportReviewDb) {
      return reply.code(503).send({
        error: "MVP-A onboarding support review database is not configured",
      });
    }

    const actorId = readSingleHeader(
      request.headers["x-hrcore-mvp-a-actor-id"],
    );
    const tenantEnvironmentId = readSingleHeader(
      request.headers["x-hrcore-mvp-a-tenant-environment"],
    );

    try {
      const runtimeAccessContext =
        validateMvpAOnboardingEvidenceRuntimeAccessContext({
          actorId,
          tenantEnvironmentId,
        });
      const input = parseMvpAOnboardingSupportReviewInput(request.body);
      assertMvpAOnboardingSupportReviewer(runtimeAccessContext.actorId);
      const validatedScopeRequest = validateMvpAOnboardingEvidenceScopeRequest(
        mvpAOnboardingEvidenceAuthorizationGate,
        {
          requestedEvidenceSurfaces: input.requestedEvidenceSurfaces,
          requestedFieldScopes: input.requestedFieldScopes,
        },
      );
      const accessDecision = {
        decision: "allow" as const,
        gateId: "mvp_a_onboarding_support_review_v1" as const,
        actorId: runtimeAccessContext.actorId,
        tenantEnvironmentId: runtimeAccessContext.tenantEnvironmentId,
        evidenceSurfaces: validatedScopeRequest.evidenceSurfaces,
        fieldScopes: validatedScopeRequest.fieldScopes,
        dataScopes: validatedScopeRequest.dataScopes,
        auditCorrelation: "direct_onboarding_correlation_with_reason" as const,
      };
      const trace = verifyMvpAOnboardingCorrelationTrace(supportReviewDb, {
        correlationId: input.correlationId,
        ...buildMvpAOnboardingTraceVerificationRequirements(accessDecision),
      });
      const auditEvidence = recordMvpAOnboardingSupportReviewAuditEvidence(
        supportReviewDb,
        {
          actorId: runtimeAccessContext.actorId,
          reviewCorrelationId: input.reviewCorrelationId,
          reasonCode: input.reasonCode,
          transactionRequestId: trace.transactionRequest.id,
        },
      );

      return reply.code(201).send({
        reviewType: "mvp_a_onboarding_support_review" as const,
        correlationId: input.correlationId,
        reviewCorrelationId: input.reviewCorrelationId,
        reasonCode: input.reasonCode,
        authorization: accessDecision,
        trace: buildAuthorizedMvpAOnboardingCorrelationTraceSummary(
          trace,
          accessDecision,
        ),
        reviewAuditEvidence: auditEvidence,
        deferredProductionGates: [...mvpAOnboardingSupportReviewBlockedGates],
      });
    } catch (error) {
      if (
        error instanceof MvpAOnboardingSupportReviewAccessError ||
        error instanceof MvpAOnboardingEvidenceAccessError
      ) {
        return reply.code(403).send({ error: error.message });
      }

      if (error instanceof MvpAOnboardingCorrelationTraceError) {
        return reply.code(409).send({ error: error.message });
      }

      if (error instanceof MvpAOnboardingSupportReviewConflictError) {
        return reply.code(409).send({ error: error.message });
      }

      throw error;
    }
  });
}

function parseMvpAOnboardingSupportReviewInput(
  body: unknown,
): MvpAOnboardingSupportReviewInput {
  if (!isRecord(body)) {
    throw new MvpAOnboardingSupportReviewAccessError(
      "MVP-A onboarding support review requires an object request body",
    );
  }
  assertMvpAOnboardingSupportReviewInputKeys(body);

  const correlationId = requireMvpAOnboardingSupportReviewText(
    body.correlationId,
    "correlation id",
  );
  const reviewCorrelationId = requireMvpAOnboardingSupportReviewText(
    body.reviewCorrelationId,
    "review correlation id",
  );
  const reasonCode = parseMvpAOnboardingSupportReviewReasonCode(
    body.reasonCode,
  );

  return {
    correlationId,
    reviewCorrelationId,
    reasonCode,
    requestedEvidenceSurfaces:
      (parseMvpAOnboardingSupportReviewStringArray(
        body.requestedEvidenceSurfaces,
        "evidence surface",
      ) as MvpAOnboardingEvidenceSurface[] | undefined) ??
      defaultMvpAOnboardingSupportReviewEvidenceSurfaces,
    requestedFieldScopes: parseMvpAOnboardingSupportReviewStringArray(
      body.requestedFieldScopes,
      "field scope",
    ) as MvpAOnboardingFieldScope[] | undefined,
  };
}

function assertMvpAOnboardingSupportReviewInputKeys(
  body: Record<string, unknown>,
): void {
  for (const key of Object.keys(body)) {
    if (!mvpAOnboardingSupportReviewInputKeys.has(key)) {
      throw new MvpAOnboardingSupportReviewAccessError(
        `MVP-A onboarding support review rejects unsupported request field ${key}`,
      );
    }
  }
}

function parseMvpAOnboardingSupportReviewReasonCode(
  value: unknown,
): MvpAOnboardingSupportReviewReasonCode {
  const reasonCode = requireMvpAOnboardingSupportReviewText(
    value,
    "reason code",
  );
  if (reasonCode !== "onboarding_evidence_review") {
    throw new MvpAOnboardingSupportReviewAccessError(
      "MVP-A onboarding support review rejects unsupported reason code",
    );
  }

  return reasonCode;
}

function parseMvpAOnboardingSupportReviewStringArray(
  value: unknown,
  label: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new MvpAOnboardingSupportReviewAccessError(
      `MVP-A onboarding support review requires at least one ${label}`,
    );
  }

  return value.map((item) =>
    requireMvpAOnboardingSupportReviewText(item, label),
  );
}

function requireMvpAOnboardingSupportReviewText(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MvpAOnboardingSupportReviewAccessError(
      `MVP-A onboarding support review requires explicit ${label}`,
    );
  }

  const trimmed = value.trim();
  if (isMvpAOnboardingSupportReviewPlaceholderText(trimmed)) {
    throw new MvpAOnboardingSupportReviewAccessError(
      `MVP-A onboarding support review rejects placeholder ${label}`,
    );
  }

  return trimmed;
}

function isMvpAOnboardingSupportReviewPlaceholderText(value: string): boolean {
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
  return tokens.some((token) =>
    isMvpAOnboardingSupportReviewPlaceholderToken(token),
  );
}

function isMvpAOnboardingSupportReviewPlaceholderToken(token: string): boolean {
  if (mvpAOnboardingSupportReviewPlaceholderTokens.has(token)) {
    return true;
  }

  for (const placeholderToken of mvpAOnboardingSupportReviewPlaceholderTokens) {
    const suffix = token.slice(placeholderToken.length);
    if (
      token.startsWith(placeholderToken) &&
      suffix.length > 0 &&
      /^\d+$/u.test(suffix)
    ) {
      return true;
    }
  }

  return false;
}

function assertMvpAOnboardingSupportReviewer(actorId: string): void {
  if (
    !actorId.startsWith(mvpAOnboardingSupportActorPrefix) ||
    !/[a-z0-9]/iu.test(actorId.slice(mvpAOnboardingSupportActorPrefix.length))
  ) {
    throw new MvpAOnboardingSupportReviewAccessError(
      "MVP-A onboarding support review requires a bound support actor",
    );
  }
}

function recordMvpAOnboardingSupportReviewAuditEvidence(
  db: MvpAOnboardingSupportReviewDatabase,
  input: {
    actorId: string;
    reviewCorrelationId: string;
    reasonCode: MvpAOnboardingSupportReviewReasonCode;
    transactionRequestId: string;
  },
) {
  const auditEventId = `audit-event-support-review-${encodeURIComponent(
    input.reviewCorrelationId,
  )}`;
  const action = `mvp_a.support_review.inspect.reason.${input.reasonCode}`;
  const duplicateReviewAuditEvent = db
    .prepare(
      `
        SELECT id
        FROM audit_event
        WHERE id = ?
           OR (
             correlation_id = ?
             AND action LIKE 'mvp_a.support_review.%'
           )
        LIMIT 1
      `,
    )
    .get(auditEventId, input.reviewCorrelationId);

  if (duplicateReviewAuditEvent !== undefined) {
    throw new MvpAOnboardingSupportReviewConflictError(
      "MVP-A onboarding support review rejects duplicate review correlation id",
    );
  }

  try {
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
      input.actorId,
      action,
      input.transactionRequestId,
      new Date().toISOString(),
      input.reviewCorrelationId,
    );
  } catch (error) {
    if (isMvpAOnboardingSupportReviewDuplicateAuditConstraint(error)) {
      throw new MvpAOnboardingSupportReviewConflictError(
        "MVP-A onboarding support review rejects duplicate review correlation id",
      );
    }

    throw error;
  }

  return {
    auditEventId,
    actorId: input.actorId,
    action,
    subjectTable: "transaction_request" as const,
    subjectId: input.transactionRequestId,
    correlationId: input.reviewCorrelationId,
  };
}

function isMvpAOnboardingSupportReviewDuplicateAuditConstraint(
  error: unknown,
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const sqliteCode =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const sqliteErrno =
    "sqliteCode" in error && typeof error.sqliteCode === "string"
      ? error.sqliteCode
      : "";
  const message = error.message;

  return (
    (sqliteCode === "SQLITE_CONSTRAINT" ||
      sqliteCode === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
      sqliteCode === "SQLITE_CONSTRAINT_UNIQUE" ||
      sqliteErrno === "SQLITE_CONSTRAINT" ||
      sqliteErrno === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
      sqliteErrno === "SQLITE_CONSTRAINT_UNIQUE") &&
    (message.includes("audit_event.id") ||
      message.includes("PRIMARY KEY") ||
      message.includes("UNIQUE constraint failed"))
  );
}
