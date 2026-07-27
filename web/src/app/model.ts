import {
  ArrowRightLeft,
  BadgeCheck,
  BriefcaseBusiness,
  ClipboardList,
  FileSpreadsheet,
  Headphones,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  UserPlus,
  UserRound,
  UserRoundX,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { BoundedPersonaId } from "../persona";

export type RouteId =
  | "queue"
  | "employees"
  | "employee"
  | "lifecycle"
  | "onboarding"
  | "transfer"
  | "termination"
  | "csv"
  | "approvals"
  | "ops"
  | "audit"
  | "support"
  | "admin";

export interface PlannedArea {
  id: RouteId;
  label: string;
  title: string;
  eyebrow: string;
  status: "available" | "planned";
  summary: string;
  icon: LucideIcon;
  navigation?: boolean;
}

export type OnboardingStatus =
  | "submitted"
  | "returned"
  | "rejected"
  | "cancelled"
  | "approved";

export type OnboardingDecision = "approve" | "return" | "reject" | "cancel";

export type PracticalWorkflowStatus = OnboardingStatus;

export type PracticalWorkflowDecision = OnboardingDecision;

export type ApprovalKind = "onboarding" | "transfer" | "termination";

export type ProcedureKind = ApprovalKind;

export interface OnboardingFormState {
  displayName: string;
  employmentCode: string;
  startDate: string;
  departmentReference: string;
  managerReference: string;
  workEmail: string;
}

export interface OnboardingRequest {
  id: string;
  personId: string;
  correlationId: string;
  requestedAt: string;
  status: OnboardingStatus;
  form: OnboardingFormState;
  submittedByActorId: BoundedPersonaId;
  decidedByActorId?: BoundedPersonaId;
  auditActions: string[];
}

export interface TransferFormState {
  displayName: string;
  effectiveDate: string;
  currentAssignmentId: string;
  currentAssignmentCode: string;
  targetOrganizationReference: string;
  targetDepartmentReference: string;
  targetManagerReference: string;
  targetPositionCode: string;
  transferReasonCode: string;
}

export interface TerminationFormState {
  displayName: string;
  effectiveDate: string;
  employmentId: string;
  employmentCode: string;
  currentAssignmentId: string;
  currentAssignmentCode: string;
  reasonCode: string;
}

export interface TransferRequest {
  id: string;
  personId: string;
  correlationId: string;
  requestedAt: string;
  status: PracticalWorkflowStatus;
  form: TransferFormState;
  submittedByActorId: BoundedPersonaId;
  decidedByActorId?: BoundedPersonaId;
  auditActions: string[];
}

export interface TerminationRequest {
  id: string;
  personId: string;
  correlationId: string;
  requestedAt: string;
  status: PracticalWorkflowStatus;
  form: TerminationFormState;
  submittedByActorId: BoundedPersonaId;
  decidedByActorId?: BoundedPersonaId;
  auditActions: string[];
}

export type DlqDecision = "retry" | "replay" | "ignore" | "close";

export interface CsvWorkflowEvidence {
  importId: string;
  fileName: string;
  rowId: string;
  subjectId: string;
  correlationId: string;
  dryRunStatus: "review_required";
  maskedField: string;
  proposedValue: string;
  exportRequestId: string;
  deniedReason: string;
  auditActions: string[];
}

export interface OpsDlqEvidence {
  jobId: string;
  failedRowId: string;
  correlationId: string;
  status: "open" | "replayed" | "ignored" | "closed";
  retryCount: number;
  recordedDecisions: DlqDecision[];
  lastDecision: DlqDecision | null;
  decisionReason: string | null;
  auditActions: string[];
}

export const defaultOnboardingForm: OnboardingFormState = {
  displayName: "Synthetic Onboarding Hire",
  employmentCode: "EMP-ONBOARDING-001",
  startDate: "2026-06-01",
  departmentReference: "department-people-ops",
  managerReference: "manager-001",
  workEmail: "onboarding.hire.001@example.invalid",
};

export const defaultTransferForm: TransferFormState = {
  displayName: "MVP-B Transfer One",
  effectiveDate: "2026-07-01",
  currentAssignmentId: "assignment-current-transfer-001",
  currentAssignmentCode: "ASN-CURRENT-TRANSFER-001",
  targetOrganizationReference: "organization-engineering",
  targetDepartmentReference: "department-product",
  targetManagerReference: "manager-product-001",
  targetPositionCode: "position-staff-engineer-001",
  transferReasonCode: "team_change",
};

export const defaultTerminationForm: TerminationFormState = {
  displayName: "MVP-C Termination One",
  effectiveDate: "2026-08-31",
  employmentId: "employment-termination-001",
  employmentCode: "EMP-TERMINATION-001",
  currentAssignmentId: "assignment-current-termination-001",
  currentAssignmentCode: "ASN-CURRENT-TERMINATION-001",
  reasonCode: "resignation",
};

export const onboardingRequestTemplate = {
  id: "transaction-request-onboarding-001",
  personId: "person-onboarding-001",
  correlationId: "correlation-onboarding-001",
  requestedAt: "2026-05-21T00:00:00Z",
} as const;

export const transferRequestTemplate = {
  id: "transaction-request-transfer-001",
  personId: "person-transfer-001",
  correlationId: "correlation-transfer-001",
  requestedAt: "2026-06-15T00:00:00Z",
} as const;

export const terminationRequestTemplate = {
  id: "transaction-request-termination-001",
  personId: "person-termination-001",
  correlationId: "correlation-termination-001",
  requestedAt: "2026-08-01T00:00:00Z",
} as const;

export const csvWorkflowEvidence: CsvWorkflowEvidence = {
  importId: "csv-import-synthetic-001",
  fileName: "mvp-d-lifecycle-support-synthetic.csv",
  rowId: "csv-row-trace-review-001",
  subjectId: "person-csv-synthetic-001",
  correlationId: "csv-correlation-synthetic-001",
  dryRunStatus: "review_required",
  maskedField: "workEmail",
  proposedValue: "csv.synthetic.001@***",
  exportRequestId: "bounded-export-request-001",
  deniedReason:
    "Broad CSV export and raw payload viewing are blocked for this non-production WebUI workflow.",
  auditActions: [
    "mvp_d.csv.upload.synthetic",
    "mvp_d.csv.dry_run.row_diff rendered",
    "mvp_d.csv.apply.confirmation_required",
    "mvp_d.csv.export.denied broad_export_blocked",
  ],
};

export const maxOpsDlqRetries = 3;

export const terminalOpsDlqStatuses: readonly OpsDlqEvidence["status"][] = [
  "replayed",
  "ignored",
  "closed",
];

export const lifecycleSupportEvidenceVersion = "mvp_d_lifecycle_support_v1";

export const dlqFailureDecisionActionPrefix =
  "mvp_d.ops_job.failure_decision.csv_import";

export const initialOpsDlqEvidence: OpsDlqEvidence = {
  jobId: "local-ops-job-csv-import-001",
  failedRowId: "csv-row-trace-rejected-001",
  correlationId: "csv-correlation-synthetic-001",
  status: "open",
  retryCount: 0,
  recordedDecisions: [],
  lastDecision: null,
  decisionReason: null,
  auditActions: [
    "mvp_d.ops.job_status.synthetic_open",
    "mvp_d.dlq.failed_row.visible_masked",
  ],
};

export const plannedAreas: readonly PlannedArea[] = [
  {
    id: "queue",
    label: "Work queue",
    title: "ダッシュボード",
    eyebrow: "今日の業務",
    status: "available",
    summary: "今日の手続き、連携状況、未処理タスクを確認します。",
    icon: LayoutDashboard,
  },
  {
    id: "employees",
    label: "Employees",
    title: "従業員一覧",
    eyebrow: "Bounded employee collection",
    status: "available",
    summary: "許可された検索条件で従業員を確認し、詳細へ移動します。",
    icon: Users,
  },
  {
    id: "employee",
    label: "Employee detail",
    title: "従業員詳細",
    eyebrow: "Bounded employee record",
    status: "available",
    summary: "状態、履歴、外部ID、次回予定を1画面で確認します。",
    icon: UserRound,
    navigation: false,
  },
  {
    id: "lifecycle",
    label: "Procedures",
    title: "手続き一覧",
    eyebrow: "Bounded lifecycle collection",
    status: "available",
    summary: "入社・異動・退職の申請を横断して確認します。",
    icon: ClipboardList,
  },
  {
    id: "onboarding",
    label: "Onboarding",
    title: "入社手続き",
    eyebrow: "MVP-A lifecycle procedure",
    status: "available",
    summary: "入社情報を入力し、連携影響を確認して申請します。",
    icon: UserPlus,
  },
  {
    id: "transfer",
    label: "Transfer",
    title: "異動手続き",
    eyebrow: "MVP-B lifecycle procedure",
    status: "available",
    summary: "入力しながら人事情報とIdPへの影響を確認します。",
    icon: ArrowRightLeft,
  },
  {
    id: "termination",
    label: "Termination",
    title: "退職手続き",
    eyebrow: "MVP-C lifecycle procedure",
    status: "available",
    summary: "退職、雇用終了、アカウント無効化の影響を確認します。",
    icon: UserRoundX,
  },
  {
    id: "csv",
    label: "CSV dry-run",
    title: "CSV dry-run",
    eyebrow: "MVP-D bounded import",
    status: "planned",
    summary: "synthetic CSVの差分と適用前確認を行います。",
    icon: FileSpreadsheet,
  },
  {
    id: "approvals",
    label: "Approvals",
    title: "承認受信箱",
    eyebrow: "Bounded approval decisions",
    status: "planned",
    summary: "承認待ち案件を一覧と詳細で確認します。",
    icon: BadgeCheck,
  },
  {
    id: "ops",
    label: "Ops/DLQ",
    title: "Job monitor",
    eyebrow: "Synthetic runtime evidence",
    status: "planned",
    summary: "ジョブ状態とDLQの判断対象を確認します。",
    icon: BriefcaseBusiness,
  },
  {
    id: "audit",
    label: "Audit",
    title: "監査証跡",
    eyebrow: "Single correlation boundary",
    status: "planned",
    summary: "単一correlationに限定して証跡を確認します。",
    icon: ShieldCheck,
  },
  {
    id: "support",
    label: "Support review",
    title: "サポートレビュー",
    eyebrow: "Bounded support notes",
    status: "planned",
    summary: "対象者に紐づく理由付きサポート記録を確認します。",
    icon: Headphones,
  },
  {
    id: "admin",
    label: "Admin",
    title: "設定",
    eyebrow: "Non-production labels only",
    status: "planned",
    summary: "非本番の表示とroute visibilityのみを確認します。",
    icon: Settings2,
  },
];

export function formatStatus(status: string): string {
  return status[0].toUpperCase() + status.slice(1);
}

export function formatRequestedAt(requestedAt: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo",
  }).format(new Date(requestedAt));
}

export function getPreferredApprovalKind(
  request: OnboardingRequest | null,
  transferRequest: TransferRequest | null,
  terminationRequest: TerminationRequest | null,
): ApprovalKind {
  if (transferRequest?.status === "submitted") {
    return "transfer";
  }
  if (terminationRequest?.status === "submitted") {
    return "termination";
  }
  if (request?.status === "submitted") {
    return "onboarding";
  }
  if (transferRequest) {
    return "transfer";
  }
  if (terminationRequest) {
    return "termination";
  }
  return "onboarding";
}

export function getApprovalStatusPresentation(
  status: PracticalWorkflowStatus | "empty",
): { label: string; tone: string } {
  switch (status) {
    case "submitted":
      return { label: "承認待ち", tone: "state-warning" };
    case "approved":
      return { label: "承認済み", tone: "state-success" };
    case "returned":
      return { label: "差戻し", tone: "state-warning" };
    case "rejected":
      return { label: "却下", tone: "state-danger" };
    case "cancelled":
      return { label: "取消済み", tone: "state-danger" };
    case "empty":
      return { label: "fixture", tone: "" };
  }
}

export function getProcedureProgress(
  procedure: ProcedureKind,
  status: PracticalWorkflowStatus | null,
): { currentStep: number; statusLabel: string } {
  const inputStepByProcedure: Record<ProcedureKind, number> = {
    onboarding: 2,
    transfer: 3,
    termination: 2,
  };
  const inputStep = inputStepByProcedure[procedure];

  if (!status) {
    return { currentStep: inputStep, statusLabel: "下書き保存済" };
  }

  const currentStep =
    status === "approved"
      ? 5
      : status === "submitted" ||
          status === "rejected" ||
          status === "cancelled"
        ? 4
        : inputStep;

  return {
    currentStep,
    statusLabel: getApprovalStatusPresentation(status).label,
  };
}

export function isValidWorkEmail(value: string): boolean {
  return /^[^\s@]+@example\.invalid$/i.test(value.trim());
}

export function maskEmail(value: string): string {
  if (!isValidWorkEmail(value)) {
    return "Invalid work email";
  }

  const [localPart] = value.trim().split("@");
  return `${localPart}@***`;
}

export function isStartBeforeRequestedDate(startDate: string): boolean {
  return startDate < onboardingRequestTemplate.requestedAt.slice(0, 10);
}

export function blocksDuplicateOnboardingRequest(
  status: OnboardingStatus,
): boolean {
  return status !== "returned";
}

export function hasWritebackEvidence(request: OnboardingRequest): boolean {
  return request.auditActions.some((action) =>
    action.startsWith("mvp_a.onboarding.writeback"),
  );
}

export function getApplyStatus(request: OnboardingRequest): string {
  if (hasWritebackEvidence(request)) {
    return "Bounded apply completed with repository-owned writeback evidence.";
  }

  if (request.status === "approved") {
    return "Approved request is waiting for bounded apply; no writeback evidence has been recorded.";
  }

  return "No apply or writeback evidence has been recorded for this request.";
}

export function getMissingOnboardingFields(
  form: OnboardingFormState,
): string[] {
  const requiredFields: Array<[keyof OnboardingFormState, string]> = [
    ["displayName", "display name"],
    ["employmentCode", "employment code"],
    ["departmentReference", "department"],
    ["managerReference", "manager"],
    ["workEmail", "work email"],
  ];

  return requiredFields
    .filter(([field]) => !form[field].trim())
    .map(([, label]) => label);
}

export function isBeforeRequestedDate(
  effectiveDate: string,
  requestedAt: string,
) {
  return effectiveDate < requestedAt.slice(0, 10);
}

export function blocksDuplicateRequest(
  status: PracticalWorkflowStatus,
): boolean {
  return status !== "returned";
}

export function isAllowedTransferReasonCode(reasonCode: string): boolean {
  return (
    reasonCode === "team_change" ||
    reasonCode === "manager_change" ||
    reasonCode === "organization_change"
  );
}

export function isAllowedTerminationReasonCode(reasonCode: string): boolean {
  return (
    reasonCode === "resignation" ||
    reasonCode === "retirement" ||
    reasonCode === "contract_end" ||
    reasonCode === "mutual_agreement"
  );
}

export function normalizeTransferForm(
  form: TransferFormState,
): TransferFormState {
  return {
    displayName: form.displayName.trim(),
    effectiveDate: form.effectiveDate.trim(),
    currentAssignmentId: form.currentAssignmentId.trim(),
    currentAssignmentCode: form.currentAssignmentCode.trim(),
    targetOrganizationReference: form.targetOrganizationReference.trim(),
    targetDepartmentReference: form.targetDepartmentReference.trim(),
    targetManagerReference: form.targetManagerReference.trim(),
    targetPositionCode: form.targetPositionCode.trim(),
    transferReasonCode: form.transferReasonCode.trim(),
  };
}

export function normalizeTerminationForm(
  form: TerminationFormState,
): TerminationFormState {
  return {
    displayName: form.displayName.trim(),
    effectiveDate: form.effectiveDate.trim(),
    employmentId: form.employmentId.trim(),
    employmentCode: form.employmentCode.trim(),
    currentAssignmentId: form.currentAssignmentId.trim(),
    currentAssignmentCode: form.currentAssignmentCode.trim(),
    reasonCode: form.reasonCode.trim(),
  };
}

export function getNextStatus(
  decision: PracticalWorkflowDecision,
): PracticalWorkflowStatus {
  const nextStatusByDecision: Record<
    PracticalWorkflowDecision,
    PracticalWorkflowStatus
  > = {
    approve: "approved",
    return: "returned",
    reject: "rejected",
    cancel: "cancelled",
  };

  return nextStatusByDecision[decision];
}

export function formatDecisionAuditAction(
  prefix: string,
  decision: PracticalWorkflowDecision,
  actorId: BoundedPersonaId,
  comment: string,
): string {
  const normalizedComment = comment.trim().replace(/\s+/g, " ");

  return `${prefix}.${decision} decidedBy=${actorId}${
    normalizedComment ? ` comment=${JSON.stringify(normalizedComment)}` : ""
  }`;
}
