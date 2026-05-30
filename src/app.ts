import Fastify, { type FastifyInstance } from "fastify";

import {
  applyApprovedOnboardingTransactionRequest,
  decideOnboardingTransactionRequest,
  OnboardingTransactionRequestValidationError,
  parseOnboardingTransactionRequestInput,
  saveEditableOnboardingTransactionRequest,
  type OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import { loadOpenApiContract } from "./openapi.js";
import { listSyntheticProvisioningRuns } from "./provisioning-runs.js";
import {
  authorizeMvpAOnboardingEvidenceRuntimeAccess,
  MvpAOnboardingEvidenceAccessError,
  type MvpAOnboardingEvidenceSurface,
  type MvpAOnboardingFieldScope,
  mvpAOnboardingEvidenceAuthorizationGate,
  type MvpAOnboardingEvidenceRuntimeAccessDecision,
  validateMvpAOnboardingEvidenceRuntimeAccessContext,
} from "./mvp-a-onboarding-evidence-authorization.js";
import {
  MvpAOnboardingCorrelationTraceError,
  verifyMvpAOnboardingCorrelationTrace,
  type MvpAOnboardingCorrelationTrace,
  type MvpAOnboardingTraceabilityDatabase,
} from "./mvp-a-onboarding-traceability.js";
import {
  ingestSyntheticWorkEmailWriteback,
  parseSyntheticWorkEmailWritebackInput,
  SyntheticWorkEmailWritebackValidationError,
  type SyntheticWritebackDatabase,
} from "./writeback-ingest.js";

export interface BuildAppOptions {
  logger?: boolean;
  onboardingDb?: OnboardingTransactionRequestDatabase;
  auditTraceDb?: MvpAOnboardingTraceabilityDatabase;
  writebackDb?: SyntheticWritebackDatabase;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  app.get("/health", async () => {
    return { status: "ok" as const };
  });

  app.get("/openapi.json", async (_request, reply) => {
    const contract = await loadOpenApiContract();
    return reply.type("application/json").send(contract);
  });

  app.get("/provisioning-runs", async () => {
    return listSyntheticProvisioningRuns();
  });

  app.get(
    "/audit/mvp-a/onboarding-correlations/:correlationId",
    async (request, reply) => {
      const auditTraceDb =
        options.auditTraceDb ??
        (options.onboardingDb as
          | MvpAOnboardingTraceabilityDatabase
          | undefined);
      if (!auditTraceDb) {
        return reply.code(503).send({
          error: "MVP-A onboarding audit trace database is not configured",
        });
      }

      const params = request.params as { correlationId?: string };
      const correlationId = params.correlationId ?? "";
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
        const trace = verifyMvpAOnboardingCorrelationTrace(auditTraceDb, {
          correlationId,
          requireApproval: true,
          requireApply: true,
          requireWriteback: true,
          requireProviderRefresh: true,
        });
        const accessDecision = authorizeMvpAOnboardingEvidenceRuntimeAccess(
          mvpAOnboardingEvidenceAuthorizationGate,
          {
            actorId: runtimeAccessContext.actorId,
            tenantEnvironmentId: runtimeAccessContext.tenantEnvironmentId,
            requestOwnerActorId: trace.approvalAuditEvent?.actorId,
            requestedEvidenceSurfaces:
              readMvpAOnboardingEvidenceSurfacesHeader(
                request.headers["x-hrcore-mvp-a-evidence-surfaces"],
              ) ?? defaultMvpAOnboardingTraceSummaryEvidenceSurfaces,
            requestedFieldScopes: readMvpAOnboardingFieldScopesHeader(
              request.headers["x-hrcore-mvp-a-field-scopes"],
            ),
          },
        );

        return reply.send(
          buildMvpAOnboardingCorrelationTraceResponse(
            correlationId,
            trace,
            accessDecision,
          ),
        );
      } catch (error) {
        if (error instanceof MvpAOnboardingEvidenceAccessError) {
          return reply.code(403).send({ error: error.message });
        }

        if (error instanceof MvpAOnboardingCorrelationTraceError) {
          return reply.code(409).send({ error: error.message });
        }

        throw error;
      }
    },
  );

  app.get("/onboarding/new-hire", async (_request, reply) => {
    return reply
      .type("text/html; charset=utf-8")
      .send(renderOnboardingWizard());
  });

  app.post(
    "/onboarding/new-hire/transaction-requests/validate",
    async (request, reply) => {
      try {
        const parsed = parseOnboardingTransactionRequestInput(request.body);
        return reply.send({
          valid: true,
          requestType: parsed.requestType,
          statusCode: parsed.statusCode,
          payloadVersion: parsed.payloadVersion,
        });
      } catch (error) {
        if (error instanceof OnboardingTransactionRequestValidationError) {
          return reply.code(400).send(buildValidationErrorResponse(error));
        }

        throw error;
      }
    },
  );

  app.post(
    "/onboarding/new-hire/transaction-requests",
    async (request, reply) => {
      if (!options.onboardingDb) {
        return reply.code(503).send({
          error: "onboarding transaction request database is not configured",
        });
      }

      try {
        const result = saveEditableOnboardingTransactionRequest(
          options.onboardingDb,
          request.body,
        );
        const { operation, ...responseBody } = result;
        const statusCode =
          responseBody.statusCode === "draft" && operation !== "created"
            ? 200
            : 201;

        return reply.code(statusCode).send(responseBody);
      } catch (error) {
        if (error instanceof OnboardingTransactionRequestValidationError) {
          return reply.code(400).send(buildValidationErrorResponse(error));
        }

        if (isOnboardingTransactionRequestConflict(error)) {
          return reply.code(409).send({ error: error.message });
        }

        if (isSyntheticWritebackConstraintError(error)) {
          return reply.code(409).send({
            error:
              "onboarding transaction request conflicts with existing local synthetic state",
          });
        }

        throw error;
      }
    },
  );

  app.post(
    "/onboarding/new-hire/transaction-requests/:transactionRequestId/decisions",
    async (request, reply) => {
      if (!options.onboardingDb) {
        return reply.code(503).send({
          error: "onboarding transaction request database is not configured",
        });
      }

      const params = request.params as { transactionRequestId?: string };
      const body =
        typeof request.body === "object" &&
        request.body !== null &&
        !Array.isArray(request.body)
          ? (request.body as Record<string, unknown>)
          : {};

      try {
        return reply.code(200).send(
          decideOnboardingTransactionRequest(options.onboardingDb, {
            ...body,
            transactionRequestId: params.transactionRequestId,
          }),
        );
      } catch (error) {
        if (error instanceof OnboardingTransactionRequestValidationError) {
          return reply.code(400).send(buildValidationErrorResponse(error));
        }

        if (isOnboardingTransactionRequestDecisionTargetNotFound(error)) {
          return reply.code(404).send({ error: error.message });
        }

        if (isOnboardingTransactionRequestConflict(error)) {
          return reply.code(409).send({ error: error.message });
        }

        if (isSyntheticWritebackConstraintError(error)) {
          return reply.code(409).send({
            error:
              "onboarding transaction request decision conflicts with existing local synthetic state",
          });
        }

        throw error;
      }
    },
  );

  app.post(
    "/onboarding/new-hire/transaction-requests/:transactionRequestId/apply",
    async (request, reply) => {
      if (!options.onboardingDb) {
        return reply.code(503).send({
          error: "onboarding transaction request database is not configured",
        });
      }

      const params = request.params as { transactionRequestId?: string };
      const body =
        typeof request.body === "object" &&
        request.body !== null &&
        !Array.isArray(request.body)
          ? (request.body as Record<string, unknown>)
          : {};

      try {
        return reply.code(200).send(
          applyApprovedOnboardingTransactionRequest(options.onboardingDb, {
            ...body,
            transactionRequestId: params.transactionRequestId,
          }),
        );
      } catch (error) {
        if (error instanceof OnboardingTransactionRequestValidationError) {
          return reply.code(400).send(buildValidationErrorResponse(error));
        }

        if (isApprovedOnboardingApplyConflict(error)) {
          return reply.code(409).send({ error: error.message });
        }

        if (isSyntheticWritebackConstraintError(error)) {
          return reply.code(409).send({
            error:
              "approved onboarding apply conflicts with existing local synthetic state",
          });
        }

        throw error;
      }
    },
  );

  app.post("/writeback-events/work-email", async (request, reply) => {
    if (!options.writebackDb) {
      return reply.code(503).send({
        error: "writeback ingest database is not configured",
      });
    }

    try {
      const input = parseSyntheticWorkEmailWritebackInput(request.body);
      const result = ingestSyntheticWorkEmailWriteback(
        options.writebackDb,
        input,
      );

      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof SyntheticWorkEmailWritebackValidationError) {
        return reply.code(400).send({ error: error.message });
      }

      if (isSyntheticWritebackConstraintError(error)) {
        return reply.code(400).send({
          error: "writeback event violates local synthetic constraints",
        });
      }

      throw error;
    }
  });

  return app;
}

const defaultMvpAOnboardingTraceSummaryEvidenceSurfaces: readonly MvpAOnboardingEvidenceSurface[] =
  [
    "transaction_request",
    "audit_event",
    "lifecycle_event",
    "apply_job_attempt",
    "okta_projection",
    "work_email_evidence",
  ];

function buildMvpAOnboardingCorrelationTraceResponse(
  correlationId: string,
  trace: MvpAOnboardingCorrelationTrace,
  accessDecision: MvpAOnboardingEvidenceRuntimeAccessDecision,
) {
  return {
    correlationId,
    evidenceType: "mvp_a_onboarding_correlation_trace" as const,
    authorization: {
      decision: accessDecision.decision,
      gateId: accessDecision.gateId,
      actorId: accessDecision.actorId,
      tenantEnvironmentId: accessDecision.tenantEnvironmentId,
      evidenceSurfaces: accessDecision.evidenceSurfaces,
      fieldScopes: accessDecision.fieldScopes,
      dataScopes: accessDecision.dataScopes,
      auditCorrelation: accessDecision.auditCorrelation,
    },
    trace: buildAuthorizedMvpAOnboardingCorrelationTraceSummary(
      trace,
      accessDecision,
    ),
    deferredProductionGates: trace.remainingP2A02Gates,
  };
}

function buildAuthorizedMvpAOnboardingCorrelationTraceSummary(
  trace: MvpAOnboardingCorrelationTrace,
  accessDecision: MvpAOnboardingEvidenceRuntimeAccessDecision,
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "transaction_request",
      "request_metadata",
    )
  ) {
    summary.transactionRequest = trace.transactionRequest;
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "audit_event",
      "audit_evidence",
    )
  ) {
    summary.approvalAuditEvent = trace.approvalAuditEvent;
    summary.applyAuditEvent = trace.applyAuditEvent;
    summary.auditEventCount = trace.auditEvents.length;
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "lifecycle_event",
      "lifecycle_evidence",
    )
  ) {
    summary.lifecycleEventId = trace.lifecycleEvent?.id ?? null;
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "apply_job_attempt",
      "apply_job_attempt_evidence",
    )
  ) {
    summary.applyJobAttemptCount = trace.applyJobAttempts.length;
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "work_email_evidence",
      "work_email_contact",
    )
  ) {
    summary.workEmailWritebackEventId =
      trace.workEmailWriteback?.eventId ?? null;
    summary.workEmailConflictId = trace.workEmailConflict?.id ?? null;
  }

  if (
    hasAuthorizedMvpAOnboardingTraceEvidence(
      accessDecision,
      "okta_projection",
      "provider_projection",
    )
  ) {
    summary.providerRefreshId = trace.providerRefresh?.id ?? null;
  }

  return summary;
}

function hasAuthorizedMvpAOnboardingTraceEvidence(
  accessDecision: MvpAOnboardingEvidenceRuntimeAccessDecision,
  evidenceSurface: MvpAOnboardingEvidenceSurface,
  fieldScope: MvpAOnboardingFieldScope,
): boolean {
  return (
    accessDecision.evidenceSurfaces.includes(evidenceSurface) &&
    accessDecision.fieldScopes.includes(fieldScope)
  );
}

function readSingleHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readMvpAOnboardingEvidenceSurfacesHeader(
  value: string | string[] | undefined,
): MvpAOnboardingEvidenceSurface[] | undefined {
  return readCsvHeader(value) as MvpAOnboardingEvidenceSurface[] | undefined;
}

function readMvpAOnboardingFieldScopesHeader(
  value: string | string[] | undefined,
): MvpAOnboardingFieldScope[] | undefined {
  return readCsvHeader(value) as MvpAOnboardingFieldScope[] | undefined;
}

function readCsvHeader(
  value: string | string[] | undefined,
): string[] | undefined {
  const rawValue = readSingleHeader(value);
  if (rawValue === undefined) return undefined;

  return rawValue
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function renderOnboardingWizard(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>HRCore MVP-A New Hire</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f7f9;
        color: #17202a;
      }
      body {
        margin: 0;
        min-height: 100vh;
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      h1 {
        margin: 0 0 24px;
        font-size: 28px;
        line-height: 1.2;
        letter-spacing: 0;
      }
      form {
        display: grid;
        gap: 18px;
      }
      fieldset {
        border: 1px solid #d9dee7;
        border-radius: 8px;
        padding: 18px;
        background: #ffffff;
      }
      legend {
        padding: 0 6px;
        font-weight: 700;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
      }
      label {
        display: grid;
        gap: 6px;
        font-size: 13px;
        font-weight: 650;
      }
      input {
        min-height: 38px;
        border: 1px solid #b8c1ce;
        border-radius: 6px;
        padding: 0 10px;
        font: inherit;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      button {
        min-height: 38px;
        border: 1px solid #1e5b8f;
        border-radius: 6px;
        padding: 0 14px;
        background: #1e5b8f;
        color: #ffffff;
        font: inherit;
        font-weight: 700;
      }
      button.secondary {
        background: #ffffff;
        color: #1e5b8f;
      }
      output {
        display: block;
        min-height: 24px;
        color: #6b2a1f;
        font-weight: 650;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>MVP-A New Hire Onboarding</h1>
      <form id="mvp-a-onboarding-wizard" action="/onboarding/new-hire/transaction-requests" method="post">
        <fieldset>
          <legend>Request</legend>
          <div class="grid">
            <label>Request ID<input name="id" value="transaction-request-onboarding-001" required></label>
            <label>Correlation ID<input name="correlationId" value="correlation-onboarding-001" required></label>
            <label>Requested At<input name="requestedAt" value="2026-05-21T00:00:00Z" required></label>
            <label>Status<input name="statusCode" value="draft" required></label>
            <label>Tenant Environment<input name="payload.tenantEnvironmentId" value="repo_owned_synthetic_mvp_a_onboarding" readonly required></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Person</legend>
          <div class="grid">
            <label>Person ID<input name="person.id" value="person-onboarding-001" required></label>
            <label>Display Name<input name="person.displayName" value="MVP-A Onboarding Hire One" required></label>
            <label>Created At<input name="person.createdAt" value="2026-05-21T00:00:00Z" required></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Employment</legend>
          <div class="grid">
            <label>Effective Date<input name="payload.effectiveDate" value="2026-06-01" required></label>
            <label>Employment ID<input name="payload.employment.id" value="employment-onboarding-001" required></label>
            <label>Employment Code<input name="payload.employment.employmentCode" value="EMP-ONBOARDING-001" required></label>
            <label>Start Date<input name="payload.employment.startDate" value="2026-06-01" required></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Assignment</legend>
          <div class="grid">
            <label>Assignment ID<input name="payload.assignment.id" value="assignment-onboarding-001" required></label>
            <label>Assignment Code<input name="payload.assignment.assignmentCode" value="ASN-ONBOARDING-001" required></label>
            <label>Department Reference<input name="payload.assignment.departmentReference" value="department-people-ops" required></label>
            <label>Legal Entity Reference<input name="payload.assignment.legalEntityReference" value="legal-entity-jp-001" required></label>
            <label>Manager Reference<input name="payload.assignment.managerReference" value="manager-001" required></label>
            <label>Position Code<input name="payload.assignment.positionCode" value="position-engineer-001"></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Okta Projection</legend>
          <div class="grid">
            <label>Contact Point ID<input name="payload.workEmailExpectation.contactPointId" value="contact-point-onboarding-001" required></label>
            <label>Work Email<input name="payload.workEmailExpectation.value" value="onboarding.hire.001@example.invalid" required></label>
          </div>
        </fieldset>
        <div class="actions">
          <button type="button" class="secondary" data-action="validate">Validate</button>
          <button type="button" class="secondary" data-action="draft">Save Draft</button>
          <button type="button" data-action="submitted">Submit</button>
        </div>
        <output id="mvp-a-onboarding-status" role="status"></output>
      </form>
      <script>
        const form = document.getElementById("mvp-a-onboarding-wizard");
        const statusOutput = document.getElementById("mvp-a-onboarding-status");
        const read = (name) => new FormData(form).get(name);
        const payload = (statusCode) => ({
          id: read("id"),
          requestType: "hire",
          statusCode,
          requestedAt: read("requestedAt"),
          correlationId: read("correlationId"),
          payloadVersion: "mvp_a_onboarding_v1",
          person: {
            id: read("person.id"),
            displayName: read("person.displayName"),
            createdAt: read("person.createdAt")
          },
          payload: {
            tenantEnvironmentId: read("payload.tenantEnvironmentId"),
            effectiveDate: read("payload.effectiveDate"),
            employment: {
              id: read("payload.employment.id"),
              employmentCode: read("payload.employment.employmentCode"),
              startDate: read("payload.employment.startDate")
            },
            assignment: {
              id: read("payload.assignment.id"),
              assignmentCode: read("payload.assignment.assignmentCode"),
              departmentReference: read("payload.assignment.departmentReference"),
              legalEntityReference: read("payload.assignment.legalEntityReference"),
              managerReference: read("payload.assignment.managerReference"),
              positionCode: read("payload.assignment.positionCode") || null
            },
            workEmailExpectation: {
              contactPointId: read("payload.workEmailExpectation.contactPointId"),
              value: read("payload.workEmailExpectation.value")
            }
          }
        });
        form.addEventListener("click", async (event) => {
          const action = event.target?.dataset?.action;
          if (!action) return;
          statusOutput.value = "Loading";
          const isValidation = action === "validate";
          const response = await fetch(isValidation ? "/onboarding/new-hire/transaction-requests/validate" : form.action, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload(isValidation ? read("statusCode") : action))
          });
          const body = await response.json();
          statusOutput.value = response.ok ? "Success" : body.error;
        });
      </script>
    </main>
  </body>
</html>`;
}

function buildValidationErrorResponse(
  error: OnboardingTransactionRequestValidationError,
) {
  return {
    error: error.message,
    validationErrors: [{ message: error.message }],
  };
}

function isOnboardingTransactionRequestConflict(
  error: unknown,
): error is Error {
  return (
    error instanceof Error &&
    error.message.startsWith("onboarding transaction request ") &&
    (error.message.includes("conflicts") ||
      error.message.includes("can only be edited") ||
      error.message.includes("decision"))
  );
}

function isOnboardingTransactionRequestDecisionTargetNotFound(
  error: unknown,
): error is Error {
  return (
    error instanceof Error &&
    error.message === "onboarding transaction request decision target not found"
  );
}

function isApprovedOnboardingApplyConflict(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message.startsWith("approved onboarding apply ")
  );
}

function isSyntheticWritebackConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const sqliteCode =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const sqliteErrno =
    "sqliteCode" in error && typeof error.sqliteCode === "string"
      ? error.sqliteCode
      : "";
  const message = error.message.toLowerCase();

  return (
    sqliteCode.includes("SQLITE_CONSTRAINT") ||
    sqliteErrno.includes("SQLITE_CONSTRAINT") ||
    message.includes("constraint failed")
  );
}
