import { type FastifyInstance } from "fastify";

import { isSyntheticWritebackConstraintError } from "./http-helpers.js";
import { renderTerminationWizard } from "./termination-wizard-view.js";
import { type OnboardingTransactionRequestDatabase } from "../onboarding-transaction-request.js";
import {
  parseTerminationTransactionRequestInput,
  saveTerminationTransactionRequest,
  TerminationTransactionRequestValidationError,
} from "../termination-transaction-request.js";

export function registerTerminationRoutes(
  app: FastifyInstance,
  options: { onboardingDb?: OnboardingTransactionRequestDatabase },
): void {
  app.get("/terminations", async (_request, reply) => {
    return reply
      .type("text/html; charset=utf-8")
      .send(renderTerminationWizard());
  });

  app.post(
    "/terminations/transaction-requests/validate",
    async (request, reply) => {
      try {
        const parsed = parseTerminationTransactionRequestInput(request.body);
        return reply.send({
          valid: true,
          requestType: parsed.requestType,
          statusCode: parsed.statusCode,
          payloadVersion: parsed.payloadVersion,
        });
      } catch (error) {
        if (error instanceof TerminationTransactionRequestValidationError) {
          return reply.code(400).send(buildValidationErrorResponse(error));
        }

        throw error;
      }
    },
  );

  app.post("/terminations/transaction-requests", async (request, reply) => {
    if (!options.onboardingDb) {
      return reply.code(503).send({
        error: "termination transaction request database is not configured",
      });
    }

    try {
      return reply
        .code(201)
        .send(
          saveTerminationTransactionRequest(options.onboardingDb, request.body),
        );
    } catch (error) {
      if (error instanceof TerminationTransactionRequestValidationError) {
        return reply.code(400).send(buildValidationErrorResponse(error));
      }

      if (isTerminationTransactionRequestConflict(error)) {
        return reply.code(409).send({ error: error.message });
      }

      if (isSyntheticWritebackConstraintError(error)) {
        return reply.code(409).send({
          error:
            "termination transaction request conflicts with existing local synthetic state",
        });
      }

      throw error;
    }
  });
}

function buildValidationErrorResponse(
  error: TerminationTransactionRequestValidationError,
) {
  return {
    error: error.message,
    validationErrors: [{ message: error.message }],
  };
}

function isTerminationTransactionRequestConflict(
  error: unknown,
): error is Error {
  return (
    error instanceof Error &&
    error.message.startsWith("termination transaction request ") &&
    (error.message.includes("conflicts") ||
      error.message.includes("can only be edited") ||
      error.message.includes("decision"))
  );
}
