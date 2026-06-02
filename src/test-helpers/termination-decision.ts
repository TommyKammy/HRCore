import assert from "node:assert/strict";

import type { DatabaseSync } from "node:sqlite";

import {
  createTerminationTransactionRequestFixture,
  saveTerminationTransactionRequest,
} from "../termination-transaction-request.js";
import type {
  OnboardingApprovalDecision,
  OnboardingApprovalDecisionInput,
} from "../onboarding-transaction-request.js";
import { normalizeRow } from "./database.js";

export function seedSubmittedTerminationRequest(
  db: DatabaseSync,
  options: {
    requestId?: string;
    personId?: string;
    correlationId?: string;
  } = {},
): void {
  const requestId = options.requestId ?? "transaction-request-termination-001";
  const decisionSuffix = requestId.replace(
    "transaction-request-termination-",
    "",
  );

  saveTerminationTransactionRequest(
    db,
    createTerminationTransactionRequestFixture({
      id: requestId,
      person: {
        id: options.personId ?? `person-termination-${decisionSuffix}`,
      },
      correlationId:
        options.correlationId ?? `correlation-termination-${decisionSuffix}`,
    }),
  );
}

export function terminationDecisionInput(
  decision: OnboardingApprovalDecision,
  options: {
    transactionRequestId?: string;
    decidedAt?: string;
    correlationId?: string;
  } = {},
): OnboardingApprovalDecisionInput {
  return {
    transactionRequestId:
      options.transactionRequestId ?? "transaction-request-termination-001",
    decision,
    decidedAt: options.decidedAt ?? "2026-08-15T01:00:00Z",
    decidedBy: "operator-people-ops-termination-001",
    correlationId:
      options.correlationId ?? `correlation-termination-decision-${decision}`,
  };
}

export function assertTerminationRequestStatus(
  db: DatabaseSync,
  transactionRequestId: string,
  statusCode: string,
  message?: string,
): void {
  assert.deepEqual(
    normalizeRow(
      db
        .prepare(
          `
            SELECT status_code
            FROM transaction_request
            WHERE id = ?
          `,
        )
        .get(transactionRequestId) as Record<string, unknown> | undefined,
    ),
    { status_code: statusCode },
    message,
  );
}

export function assertTerminationDecisionAuditCount(
  db: DatabaseSync,
  count: number,
  message?: string,
): void {
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM audit_event").get() as
        | Record<string, unknown>
        | undefined,
    ),
    { count },
    message,
  );
}
