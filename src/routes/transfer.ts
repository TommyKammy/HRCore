import { type FastifyInstance } from "fastify";

import { isSyntheticWritebackConstraintError } from "./http-helpers.js";
import { renderTransferWizard } from "./transfer-wizard-view.js";
import { type OnboardingTransactionRequestDatabase } from "../onboarding-transaction-request.js";
import {
  parseTransferTransactionRequestInput,
  saveTransferTransactionRequest,
  TransferTransactionRequestValidationError,
} from "../transfer-transaction-request.js";

export function registerTransferRoutes(
  app: FastifyInstance,
  options: { onboardingDb?: OnboardingTransactionRequestDatabase },
): void {
  app.get("/transfers/assignment-change", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderTransferWizard());
  });

  app.post(
    "/transfers/assignment-change/transaction-requests/validate",
    async (request, reply) => {
      try {
        const parsed = parseTransferTransactionRequestInput(request.body);
        return reply.send({
          valid: true,
          requestType: parsed.requestType,
          statusCode: parsed.statusCode,
          payloadVersion: parsed.payloadVersion,
        });
      } catch (error) {
        if (error instanceof TransferTransactionRequestValidationError) {
          return reply.code(400).send(buildValidationErrorResponse(error));
        }

        throw error;
      }
    },
  );

  app.post(
    "/transfers/assignment-change/transaction-requests",
    async (request, reply) => {
      if (!options.onboardingDb) {
        return reply.code(503).send({
          error: "transfer transaction request database is not configured",
        });
      }

      try {
        return reply
          .code(201)
          .send(
            saveTransferTransactionRequest(options.onboardingDb, request.body),
          );
      } catch (error) {
        if (error instanceof TransferTransactionRequestValidationError) {
          return reply.code(400).send(buildValidationErrorResponse(error));
        }

        if (isTransferTransactionRequestConflict(error)) {
          return reply.code(409).send({ error: error.message });
        }

        if (isSyntheticWritebackConstraintError(error)) {
          return reply.code(409).send({
            error:
              "transfer transaction request conflicts with existing local synthetic state",
          });
        }

        throw error;
      }
    },
  );
}

function buildValidationErrorResponse(
  error: TransferTransactionRequestValidationError,
) {
  return {
    error: error.message,
    validationErrors: [{ message: error.message }],
  };
}

function isTransferTransactionRequestConflict(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message.startsWith("transfer transaction request ") &&
    (error.message.includes("conflicts") ||
      error.message.includes("can only be edited") ||
      error.message.includes("decision"))
  );
}
