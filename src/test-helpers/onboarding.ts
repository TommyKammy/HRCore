export const mvpAOnboardingAuditHeaders = {
  "x-hrcore-mvp-a-actor-id": "operator-people-ops-001",
  "x-hrcore-mvp-a-tenant-environment": "repo_owned_synthetic_mvp_a_onboarding",
};

export const workerAttemptCorrelationId = (
  workerCorrelationId: string,
  transactionRequestId: string,
): string =>
  `onboarding-apply-worker-attempt-${Buffer.from(
    JSON.stringify([workerCorrelationId, transactionRequestId]),
    "utf8",
  ).toString("base64url")}`;

export function recordSyntheticOnboardingApplyJobAttempt(
  db: { prepare(sql: string): { run(...values: unknown[]): unknown } },
  correlationId: string,
): void {
  db.prepare(
    `
      INSERT INTO onboarding_apply_job_attempt (
        id,
        transaction_request_id,
        person_id,
        status_code,
        attempted_at,
        worker_id,
        correlation_id,
        retryable,
        error_message
      )
      VALUES (?, ?, ?, 'applied', ?, ?, ?, 0, NULL)
    `,
  ).run(
    `onboarding-apply-job-attempt-${correlationId}`,
    "transaction-request-onboarding-001",
    "person-onboarding-001",
    "2026-05-21T02:00:00Z",
    "worker-mvp-a-onboarding-001",
    correlationId,
  );
}
