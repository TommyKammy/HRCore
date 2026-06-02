export type TerminationTransactionRequestStatus = "draft" | "submitted";

export interface TerminationTransactionRequestPersonInput {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface TerminationTransactionRequestCurrentEmploymentPayload {
  employmentId: string;
  employmentCode: string;
}

export interface TerminationTransactionRequestCurrentAssignmentPayload {
  assignmentId: string;
  assignmentCode: string;
}

export interface TerminationTransactionRequestReasonPayload {
  reasonCode:
    | "resignation"
    | "retirement"
    | "contract_end"
    | "mutual_agreement";
  note?: string | null;
}

export interface TerminationTransactionRequestPayload {
  tenantEnvironmentId: "repo_owned_synthetic_mvp_c_termination";
  effectiveDate: string;
  currentEmployment: TerminationTransactionRequestCurrentEmploymentPayload;
  currentAssignment: TerminationTransactionRequestCurrentAssignmentPayload;
  terminationReason: TerminationTransactionRequestReasonPayload;
}

export interface TerminationTransactionRequestInput {
  id: string;
  person: TerminationTransactionRequestPersonInput;
  requestType: "terminate";
  statusCode: TerminationTransactionRequestStatus;
  requestedAt: string;
  correlationId: string;
  payloadVersion: "mvp_c_termination_v1";
  payload: TerminationTransactionRequestPayload;
}
