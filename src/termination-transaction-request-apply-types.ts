import type {
  ApplyApprovedOnboardingTransactionRequestInput,
  OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";

export type ApplyApprovedTerminationTransactionRequestInput =
  ApplyApprovedOnboardingTransactionRequestInput;

export type TerminationApplyDatabase = OnboardingTransactionRequestDatabase;

export interface AppliedTerminationTransactionRequestResult {
  personId: string;
  employmentId: string;
  assignmentId: string;
  transactionRequestId: string;
  lifecycleEventId: string;
  statusCode: "completed";
  correlationId: string;
}

export type ExistingTerminationEmploymentRow = {
  id: string;
  person_id: string;
  employment_code: string;
  status_code: string;
  start_date: string;
  end_date: string | null;
};

export type ExistingTerminationAssignmentRow = {
  id: string;
  person_id: string;
  employment_id: string;
  assignment_code: string;
  start_date: string;
  end_date: string | null;
};

export type ExistingCompletedTerminationApplyRow = {
  transaction_status_code: string;
  request_type: string;
  person_id: string;
  payload_version: string | null;
  payload_json: string | null;
  lifecycle_event_id: string | null;
  lifecycle_event_type: string | null;
  lifecycle_effective_date: string | null;
  lifecycle_occurred_at: string | null;
  employment_id: string | null;
  employment_code: string | null;
  employment_status_code: string | null;
  employment_start_date: string | null;
  employment_end_date: string | null;
  assignment_id: string | null;
  assignment_employment_id: string | null;
  assignment_code: string | null;
  assignment_start_date: string | null;
  assignment_end_date: string | null;
  audit_event_id: string | null;
  audit_actor_id: string | null;
  audit_action: string | null;
  audit_subject_table: string | null;
  audit_subject_id: string | null;
  audit_occurred_at: string | null;
  audit_correlation_id: string | null;
};
