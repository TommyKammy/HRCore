import { type FastifyInstance } from "fastify";

import {
  authorizeMvpAOnboardingEvidenceRuntimeAccess,
  MvpAOnboardingEvidenceAccessError,
  type MvpAOnboardingEvidenceSurface,
  type MvpAOnboardingFieldScope,
  mvpAOnboardingEvidenceAuthorizationGate,
  validateMvpAOnboardingEvidenceRuntimeAccessContext,
  validateMvpAOnboardingEvidenceScopeRequest,
} from "../mvp-a-onboarding-evidence-authorization.js";
import {
  MvpAOnboardingCorrelationTraceError,
  readMvpAOnboardingCorrelationRequestOwnerActorId,
  verifyMvpAOnboardingCorrelationTrace,
  type MvpAOnboardingTraceabilityDatabase,
} from "../mvp-a-onboarding-traceability.js";
import { readCsvHeader, readSingleHeader } from "./http-helpers.js";
import {
  buildMvpAOnboardingCorrelationTraceResponse,
  buildMvpAOnboardingTraceVerificationRequirements,
} from "./mvp-a-onboarding-trace-response.js";

export interface MvpAOnboardingAuditRouteOptions {
  onboardingDb?: unknown;
  auditTraceDb?: MvpAOnboardingTraceabilityDatabase;
}

const defaultMvpAOnboardingTraceSummaryEvidenceSurfaces: readonly MvpAOnboardingEvidenceSurface[] =
  [
    "transaction_request",
    "person",
    "audit_event",
    "lifecycle_event",
    "apply_job_attempt",
    "okta_projection",
    "work_email_evidence",
  ];

export function registerMvpAOnboardingAuditRoutes(
  app: FastifyInstance,
  options: MvpAOnboardingAuditRouteOptions,
): void {
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
        const requestedEvidenceSurfaces =
          readMvpAOnboardingEvidenceSurfacesHeader(
            request.headers["x-hrcore-mvp-a-evidence-surfaces"],
          ) ?? defaultMvpAOnboardingTraceSummaryEvidenceSurfaces;
        const requestedFieldScopes = readMvpAOnboardingFieldScopesHeader(
          request.headers["x-hrcore-mvp-a-field-scopes"],
        );
        const validatedScopeRequest =
          validateMvpAOnboardingEvidenceScopeRequest(
            mvpAOnboardingEvidenceAuthorizationGate,
            {
              requestedEvidenceSurfaces,
              requestedFieldScopes,
            },
          );
        const requestOwnerActorId =
          readMvpAOnboardingCorrelationRequestOwnerActorId(auditTraceDb, {
            correlationId,
          });
        const accessDecision = authorizeMvpAOnboardingEvidenceRuntimeAccess(
          mvpAOnboardingEvidenceAuthorizationGate,
          {
            actorId: runtimeAccessContext.actorId,
            tenantEnvironmentId: runtimeAccessContext.tenantEnvironmentId,
            requestOwnerActorId,
            requestedEvidenceSurfaces: validatedScopeRequest.evidenceSurfaces,
            requestedFieldScopes: validatedScopeRequest.fieldScopes,
          },
        );
        const trace = verifyMvpAOnboardingCorrelationTrace(auditTraceDb, {
          correlationId,
          ...buildMvpAOnboardingTraceVerificationRequirements(accessDecision),
        });

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
