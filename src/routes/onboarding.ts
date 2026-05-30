import { type FastifyInstance } from "fastify";

import {
  applyApprovedOnboardingTransactionRequest,
  decideOnboardingTransactionRequest,
  OnboardingTransactionRequestValidationError,
  parseOnboardingTransactionRequestInput,
  saveEditableOnboardingTransactionRequest,
  type OnboardingTransactionRequestDatabase,
} from "../onboarding-transaction-request.js";
import { isSyntheticWritebackConstraintError } from "./http-helpers.js";
import { renderOnboardingWizard } from "./onboarding-wizard-view.js";

export function registerOnboardingRoutes(
  app: FastifyInstance,
  options: { onboardingDb?: OnboardingTransactionRequestDatabase },
): void {
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
