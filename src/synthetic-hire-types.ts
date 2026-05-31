type SqlValue = string | number | bigint | null;

export interface SqlStatement {
  run(...values: SqlValue[]): unknown;
  get(...values: SqlValue[]): unknown;
}

export interface SyntheticHireDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
}

export type SyntheticEmploymentStatus = "active" | "inactive" | "terminated";

export interface SyntheticHirePersonInput {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface SyntheticHireEmploymentInput {
  id: string;
  personId: string;
  employmentCode: string;
  statusCode: SyntheticEmploymentStatus;
  startDate: string;
  endDate?: string | null;
}

export interface SyntheticHireAssignmentInput {
  id: string;
  personId: string;
  employmentId: string;
  assignmentCode: string;
  organizationCode: string;
  positionCode?: string | null;
  startDate: string;
  endDate?: string | null;
}

export interface SyntheticHireContactPointInput {
  id: string;
  personId: string;
  contactType: "work_email";
  value: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface SyntheticHireAuditInput {
  actorId: string;
  correlationId: string;
  occurredAt: string;
  pocMarker: "synthetic_poc";
}

export interface SyntheticHireInput {
  person: SyntheticHirePersonInput;
  employment: SyntheticHireEmploymentInput;
  assignment: SyntheticHireAssignmentInput;
  contactPoint?: SyntheticHireContactPointInput;
  audit: SyntheticHireAuditInput;
}

export interface SyntheticHireTransactionRequestInput {
  id: string;
  personId: string;
  requestType: "hire";
  statusCode: "submitted";
  requestedAt: string;
  correlationId: string;
}

export interface SyntheticHireRequestInput {
  person: SyntheticHirePersonInput;
  transactionRequest: SyntheticHireTransactionRequestInput;
}

export interface SyntheticHireLifecycleEventInput {
  id: string;
  eventType: "hire";
  effectiveDate: string;
  occurredAt: string;
}

export interface ApplySyntheticHireRequestInput {
  request: SyntheticHireRequestInput;
  hire: SyntheticHireInput;
  lifecycleEvent: SyntheticHireLifecycleEventInput;
}

export interface SyntheticFutureDateApplyJobInput {
  id: string;
  correlationId: string;
  observedAt: string;
  failAfterPreconditionsReason?: string;
}

export interface ApplySyntheticFutureDateHireJobInput {
  job: SyntheticFutureDateApplyJobInput;
  apply: ApplySyntheticHireRequestInput;
}

export interface SyntheticHirePersistenceResult {
  personId: string;
  employmentId: string;
  assignmentId: string;
  contactPointId?: string;
}

export interface SyntheticHireRequestPersistenceResult {
  personId: string;
  transactionRequestId: string;
  statusCode: "submitted";
  correlationId: string;
}

export interface AppliedSyntheticHireRequestResult {
  transactionRequestId: string;
  lifecycleEventId: string;
  personId: string;
  statusCode: "completed";
  correlationId: string;
}

export interface SyntheticFutureDateApplyObservedState {
  transactionRequestStatusCode: "submitted";
  lifecycleEventCount: number;
  employmentCount: number;
  assignmentCount: number;
  lifecycleAppliedAuditCount: number;
}

export interface SyntheticFutureDateApplyFailureEvidence {
  id: string;
  jobId: string;
  transactionRequestId: string;
  lifecycleEventId: string;
  personId: string;
  correlationId: string;
  failureReason: string;
  retryable: true;
  observedAt: string;
  observedState: SyntheticFutureDateApplyObservedState;
}

export type SyntheticFutureDateApplyJobResult =
  | ({ outcome: "applied" } & AppliedSyntheticHireRequestResult)
  | {
      outcome: "retryable_failure";
      failureEvidence: SyntheticFutureDateApplyFailureEvidence;
    };
