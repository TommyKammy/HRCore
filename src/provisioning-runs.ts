export type ProvisioningRunStatus = "completed" | "needs_attention";

export type ProvisioningRunResult =
  | "success"
  | "skipped"
  | "retryable_failure"
  | "permanent_failure";

export type ProvisioningRunTargetOperation =
  | "create"
  | "update"
  | "disable"
  | "replace_user_groups";

export interface ProvisioningRunEvidence {
  runId: string;
  status: ProvisioningRunStatus;
  targetOperation: ProvisioningRunTargetOperation;
  result: ProvisioningRunResult;
  correlationId: string;
  synthetic: true;
}

export interface ProvisioningRunEvidenceResponse {
  runs: ProvisioningRunEvidence[];
}

const SYNTHETIC_PROVISIONING_RUNS: ProvisioningRunEvidence[] = [
  {
    runId: "synthetic-okta-run-001",
    status: "completed",
    targetOperation: "create",
    result: "success",
    correlationId: "okta:mock:create:EMP-LOG-001:2026-05-18T07%3A00%3A00.000Z",
    synthetic: true,
  },
  {
    runId: "synthetic-okta-run-002",
    status: "needs_attention",
    targetOperation: "disable",
    result: "permanent_failure",
    correlationId: "okta:mock:disable:EMP-PERM:2026-05-18T06%3A00%3A00.000Z",
    synthetic: true,
  },
];

export function listSyntheticProvisioningRuns(): ProvisioningRunEvidenceResponse {
  return {
    runs: SYNTHETIC_PROVISIONING_RUNS.map((run) => ({ ...run })),
  };
}
