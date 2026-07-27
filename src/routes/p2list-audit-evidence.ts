import {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import type { OnboardingTransactionRequestDatabase } from "../onboarding-transaction-request-types.js";
import {
  p2ListCorrelationHeader,
  readP2ListAuditEvidence,
  resolveP2ListCorrelationId,
} from "../p2list-observability.js";
import { p2ListReadiness, type P2ListErrorCode } from "../p2list-contract.js";
import {
  P2ListReadModelError,
  type P2ListActorContext,
} from "../p2list-read-model-types.js";

type MaybePromise<T> = T | Promise<T>;

export interface P2ListAuditEvidenceRuntime {
  database: OnboardingTransactionRequestDatabase;
  resolveActor(
    request: FastifyRequest,
  ): MaybePromise<P2ListActorContext | undefined>;
  createCorrelationId?: () => string;
}

export function registerP2ListAuditEvidenceRoutes(
  app: FastifyInstance,
  options: { p2ListAuditEvidenceApi?: P2ListAuditEvidenceRuntime },
): void {
  app.get(
    "/support/p2list/audit-evidence/:correlationId",
    { logLevel: "silent" },
    async (request, reply) => {
      const runtime = options.p2ListAuditEvidenceApi;
      const responseCorrelationId = resolveP2ListCorrelationId(
        request,
        runtime?.createCorrelationId,
      );
      reply.header(p2ListCorrelationHeader, responseCorrelationId);

      try {
        if (!runtime) {
          throw new P2ListReadModelError(
            "actor_context_required",
            "Server actor context is required.",
          );
        }
        const actor = await runtime.resolveActor(request);
        if (!actor) {
          throw new P2ListReadModelError(
            "actor_context_required",
            "Server actor context is required.",
          );
        }
        const evidence = readP2ListAuditEvidence(
          runtime.database,
          actor,
          (request.params as Record<string, unknown>).correlationId,
        );
        if (!evidence) {
          return unavailable(reply, responseCorrelationId);
        }
        return reply.send(evidence);
      } catch (error) {
        if (!(error instanceof P2ListReadModelError)) throw error;
        if (error.code === "data_scope_denied") {
          return unavailable(reply, responseCorrelationId);
        }
        return reply.code(statusForError(error.code)).send({
          code: error.code,
          message:
            error.code === "actor_context_required"
              ? "Server actor context is required."
              : error.code === "permission_denied"
                ? "Support audit evidence is not authorized."
                : "The support audit evidence request is invalid.",
          correlationId: responseCorrelationId,
          readiness: p2ListReadiness,
        });
      }
    },
  );
}

function unavailable(reply: FastifyReply, correlationId: string) {
  return reply.code(404).send({
    code: "data_scope_denied",
    message: "The requested support audit evidence is unavailable.",
    correlationId,
    readiness: p2ListReadiness,
  });
}

function statusForError(code: P2ListErrorCode): 400 | 401 | 403 {
  if (code === "actor_context_required") return 401;
  if (code === "permission_denied") return 403;
  return 400;
}
