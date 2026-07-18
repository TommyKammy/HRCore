import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  Cloud,
  FileSpreadsheet,
  Headphones,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Search,
  Settings2,
  ShieldCheck,
  UserPlus,
  UserRound,
  UserRoundX,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  type ApiContract,
  ApiClientError,
  fetchOpenApiContract,
} from "./api-client";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  boundedPersonas,
  resolveBoundedPersona,
  type BoundedPersonaId,
} from "./persona";

type RouteId =
  | "queue"
  | "employee"
  | "onboarding"
  | "transfer"
  | "termination"
  | "csv"
  | "approvals"
  | "ops"
  | "audit"
  | "support"
  | "admin";

interface PlannedArea {
  id: RouteId;
  label: string;
  title: string;
  eyebrow: string;
  status: "available" | "planned";
  summary: string;
  icon: LucideIcon;
}

type OnboardingStatus =
  | "submitted"
  | "returned"
  | "rejected"
  | "cancelled"
  | "approved";

type OnboardingDecision = "approve" | "return" | "reject" | "cancel";
type PracticalWorkflowStatus = OnboardingStatus;
type PracticalWorkflowDecision = OnboardingDecision;
type ApprovalKind = "onboarding" | "transfer" | "termination";

interface OnboardingFormState {
  displayName: string;
  employmentCode: string;
  startDate: string;
  departmentReference: string;
  managerReference: string;
  workEmail: string;
}

interface OnboardingRequest {
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

interface TransferFormState {
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

interface TerminationFormState {
  displayName: string;
  effectiveDate: string;
  employmentId: string;
  employmentCode: string;
  currentAssignmentId: string;
  currentAssignmentCode: string;
  reasonCode: string;
}

interface TransferRequest {
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

interface TerminationRequest {
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

type DlqDecision = "retry" | "replay" | "ignore" | "close";

interface CsvWorkflowEvidence {
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

interface OpsDlqEvidence {
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

const defaultOnboardingForm: OnboardingFormState = {
  displayName: "Synthetic Onboarding Hire",
  employmentCode: "EMP-ONBOARDING-001",
  startDate: "2026-06-01",
  departmentReference: "department-people-ops",
  managerReference: "manager-001",
  workEmail: "onboarding.hire.001@example.invalid",
};

const defaultTransferForm: TransferFormState = {
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

const defaultTerminationForm: TerminationFormState = {
  displayName: "MVP-C Termination One",
  effectiveDate: "2026-08-31",
  employmentId: "employment-termination-001",
  employmentCode: "EMP-TERMINATION-001",
  currentAssignmentId: "assignment-current-termination-001",
  currentAssignmentCode: "ASN-CURRENT-TERMINATION-001",
  reasonCode: "resignation",
};

const onboardingRequestTemplate = {
  id: "transaction-request-onboarding-001",
  personId: "person-onboarding-001",
  correlationId: "correlation-onboarding-001",
  requestedAt: "2026-05-21T00:00:00Z",
} as const;

const transferRequestTemplate = {
  id: "transaction-request-transfer-001",
  personId: "person-transfer-001",
  correlationId: "correlation-transfer-001",
  requestedAt: "2026-06-15T00:00:00Z",
} as const;

const terminationRequestTemplate = {
  id: "transaction-request-termination-001",
  personId: "person-termination-001",
  correlationId: "correlation-termination-001",
  requestedAt: "2026-08-01T00:00:00Z",
} as const;

const csvWorkflowEvidence: CsvWorkflowEvidence = {
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

const maxOpsDlqRetries = 3;
const terminalOpsDlqStatuses: readonly OpsDlqEvidence["status"][] = [
  "replayed",
  "ignored",
  "closed",
];
const lifecycleSupportEvidenceVersion = "mvp_d_lifecycle_support_v1";
const dlqFailureDecisionActionPrefix =
  "mvp_d.ops_job.failure_decision.csv_import";

const initialOpsDlqEvidence: OpsDlqEvidence = {
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

const plannedAreas: readonly PlannedArea[] = [
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
    id: "employee",
    label: "Employees",
    title: "従業員詳細",
    eyebrow: "Bounded employee record",
    status: "available",
    summary: "状態、履歴、外部ID、次回予定を1画面で確認します。",
    icon: Users,
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

function EmptyState() {
  return (
    <section className="empty-state" aria-labelledby="empty-title">
      <h2 id="empty-title">No bounded queue records yet</h2>
      <p>
        This shell is ready for later workflow children to attach synthetic or
        explicitly approved non-production records. It does not expose real
        employee data.
      </p>
    </section>
  );
}

function formatStatus(status: string): string {
  return status[0].toUpperCase() + status.slice(1);
}

function getPreferredApprovalKind(
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

function getApprovalStatusPresentation(
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

function isValidWorkEmail(value: string): boolean {
  return /^[^\s@]+@example\.invalid$/i.test(value.trim());
}

function maskEmail(value: string): string {
  if (!isValidWorkEmail(value)) {
    return "Invalid work email";
  }

  const [localPart] = value.trim().split("@");
  return `${localPart}@***`;
}

function isStartBeforeRequestedDate(startDate: string): boolean {
  return startDate < onboardingRequestTemplate.requestedAt.slice(0, 10);
}

function blocksDuplicateOnboardingRequest(status: OnboardingStatus): boolean {
  return status !== "returned";
}

function hasWritebackEvidence(request: OnboardingRequest): boolean {
  return request.auditActions.some((action) =>
    action.startsWith("mvp_a.onboarding.writeback"),
  );
}

function getApplyStatus(request: OnboardingRequest): string {
  if (hasWritebackEvidence(request)) {
    return "Bounded apply completed with repository-owned writeback evidence.";
  }

  if (request.status === "approved") {
    return "Approved request is waiting for bounded apply; no writeback evidence has been recorded.";
  }

  return "No apply or writeback evidence has been recorded for this request.";
}

function getMissingOnboardingFields(form: OnboardingFormState): string[] {
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

function isBeforeRequestedDate(effectiveDate: string, requestedAt: string) {
  return effectiveDate < requestedAt.slice(0, 10);
}

function blocksDuplicateRequest(status: PracticalWorkflowStatus): boolean {
  return status !== "returned";
}

function isAllowedTransferReasonCode(reasonCode: string): boolean {
  return (
    reasonCode === "team_change" ||
    reasonCode === "manager_change" ||
    reasonCode === "organization_change"
  );
}

function isAllowedTerminationReasonCode(reasonCode: string): boolean {
  return (
    reasonCode === "resignation" ||
    reasonCode === "retirement" ||
    reasonCode === "contract_end" ||
    reasonCode === "mutual_agreement"
  );
}

function normalizeTransferForm(form: TransferFormState): TransferFormState {
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

function normalizeTerminationForm(
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

function getNextStatus(
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

function OnboardingWorkflow({
  personaId,
  personaRole,
  request,
  setRequest,
}: {
  personaId: BoundedPersonaId | "";
  personaRole: string | undefined;
  request: OnboardingRequest | null;
  setRequest: (request: OnboardingRequest) => void;
}) {
  const [form, setForm] = useState<OnboardingFormState>(defaultOnboardingForm);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"error" | "ok">("ok");
  const isOperator = personaRole === "bounded_hr_operator";

  useEffect(() => {
    if (request?.status === "returned") {
      setForm(request.form);
    }
  }, [request?.form, request?.status]);

  const updateField =
    (field: keyof OnboardingFormState) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    };

  const createRequest = () => {
    if (!isOperator) {
      setMessageKind("error");
      setMessage(
        "Only the bounded HR operator persona can create onboarding requests in this synthetic workflow.",
      );
      return;
    }

    const missingFields = getMissingOnboardingFields(form);

    if (missingFields.length > 0) {
      setMessageKind("error");
      setMessage(
        `Complete ${missingFields.join(
          ", ",
        )} before submitting this bounded onboarding request.`,
      );
      return;
    }

    if (isStartBeforeRequestedDate(form.startDate)) {
      setMessageKind("error");
      setMessage(
        "Start date must be on or after the requested date for this bounded workflow.",
      );
      return;
    }

    if (request && blocksDuplicateOnboardingRequest(request.status)) {
      setMessageKind("error");
      setMessage(
        "An onboarding request already exists for this synthetic employment code.",
      );
      return;
    }

    if (!isValidWorkEmail(form.workEmail)) {
      setMessageKind("error");
      setMessage(
        "Enter a synthetic example.invalid work email before creating projection or writeback evidence.",
      );
      return;
    }

    const isReturnedRequest = request?.status === "returned";

    setRequest({
      ...(isReturnedRequest ? request : onboardingRequestTemplate),
      status: "submitted",
      form: { ...form },
      submittedByActorId: personaId || "hr-operator",
      decidedByActorId: undefined,
      auditActions: isReturnedRequest
        ? [...request.auditActions, "mvp_a.onboarding.submit"]
        : ["mvp_a.onboarding.submit"],
    });
    setMessageKind("ok");
    setMessage(
      request?.status === "returned"
        ? "Returned onboarding request resubmitted with synthetic data only."
        : "Bounded onboarding request created with synthetic data only.",
    );
  };

  return (
    <div className="workflow-grid">
      <section className="workflow-panel" aria-labelledby="onboarding-form">
        <div>
          <p className="context-label">Synthetic request input</p>
          <h3 id="onboarding-form">Create bounded request</h3>
        </div>
        <div className="form-grid">
          <label>
            Display name
            <input
              value={form.displayName}
              onChange={updateField("displayName")}
            />
          </label>
          <label>
            Employment code
            <input
              value={form.employmentCode}
              onChange={updateField("employmentCode")}
            />
          </label>
          <label>
            Start date
            <input
              type="date"
              value={form.startDate}
              onChange={updateField("startDate")}
            />
          </label>
          <label>
            Department
            <input
              value={form.departmentReference}
              onChange={updateField("departmentReference")}
            />
          </label>
          <label>
            Manager
            <input
              value={form.managerReference}
              onChange={updateField("managerReference")}
            />
          </label>
          <label>
            Work email
            <input value={form.workEmail} onChange={updateField("workEmail")} />
          </label>
        </div>
        <div className="evidence-row">
          <span>Masked contact preview</span>
          <strong>{maskEmail(form.workEmail)}</strong>
        </div>
        <button type="button" onClick={createRequest} disabled={!isOperator}>
          Create request
        </button>
        {message ? (
          <section
            className={
              messageKind === "error"
                ? "notice notice-error compact"
                : "notice notice-ok compact"
            }
            role={messageKind === "error" ? "alert" : "status"}
          >
            <p>{message}</p>
          </section>
        ) : null}
      </section>

      <section className="workflow-panel" aria-labelledby="onboarding-detail">
        <div>
          <p className="context-label">Request detail</p>
          <h3 id="onboarding-detail">
            {request?.id ?? "No onboarding request selected"}
          </h3>
        </div>
        {request ? (
          <>
            <dl className="detail-list">
              <div>
                <dt>Status</dt>
                <dd>{formatStatus(request.status)}</dd>
              </div>
              <div>
                <dt>Person</dt>
                <dd>{request.form.displayName}</dd>
              </div>
              <div>
                <dt>Employment</dt>
                <dd>{request.form.employmentCode}</dd>
              </div>
              <div>
                <dt>Correlation trace</dt>
                <dd>{request.correlationId}</dd>
              </div>
            </dl>
            <div className="evidence-stack" aria-label="Evidence">
              <EvidenceItem
                title="Okta projection evidence"
                body={`Synthetic profile projection prepared for ${maskEmail(
                  request.form.workEmail,
                )}. No live provider mutation.`}
              />
              <EvidenceItem
                title="Apply status"
                body={getApplyStatus(request)}
              />
              {hasWritebackEvidence(request) ? (
                <EvidenceItem
                  title="Writeback evidence"
                  body="Work email writeback remains repository-owned synthetic evidence."
                />
              ) : null}
              <EvidenceItem
                title="Audit evidence"
                body={request.auditActions.join(", ")}
              />
            </div>
          </>
        ) : (
          <p className="muted">
            Create a bounded onboarding request to inspect status, evidence, and
            correlation trace.
          </p>
        )}
      </section>
    </div>
  );
}

function TransferWorkflow({
  personaId,
  personaRole,
  request,
  setRequest,
}: {
  personaId: BoundedPersonaId | "";
  personaRole: string | undefined;
  request: TransferRequest | null;
  setRequest: (request: TransferRequest) => void;
}) {
  const [form, setForm] = useState<TransferFormState>(defaultTransferForm);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"error" | "ok">("ok");
  const isOperator = personaRole === "bounded_hr_operator";

  useEffect(() => {
    if (request?.status === "returned") {
      setForm(request.form);
    }
  }, [request?.form, request?.status]);

  const updateField =
    (field: keyof TransferFormState) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    };

  const createRequest = () => {
    if (!isOperator) {
      setMessageKind("error");
      setMessage(
        "Only the bounded HR operator persona can create transfer requests in this synthetic workflow.",
      );
      return;
    }

    const submittedForm = normalizeTransferForm(form);
    const missingFields = [
      ["displayName", "display name"],
      ["effectiveDate", "effective date"],
      ["currentAssignmentId", "current assignment"],
      ["currentAssignmentCode", "current assignment code"],
      ["targetOrganizationReference", "target organization"],
      ["targetDepartmentReference", "target department"],
      ["targetManagerReference", "target manager"],
      ["transferReasonCode", "transfer reason"],
    ] as const;
    const missing = missingFields
      .filter(([field]) => !submittedForm[field])
      .map(([, label]) => label);

    if (missing.length > 0) {
      setMessageKind("error");
      setMessage(
        `Complete ${missing.join(
          ", ",
        )} before submitting this bounded transfer request.`,
      );
      return;
    }

    if (!isAllowedTransferReasonCode(submittedForm.transferReasonCode)) {
      setMessageKind("error");
      setMessage(
        "Transfer reason must be team_change, manager_change, or organization_change for this bounded workflow.",
      );
      return;
    }

    if (
      isBeforeRequestedDate(
        submittedForm.effectiveDate,
        transferRequestTemplate.requestedAt,
      )
    ) {
      setMessageKind("error");
      setMessage(
        "Transfer effective date must be on or after the requested date for this bounded workflow.",
      );
      return;
    }

    if (request && blocksDuplicateRequest(request.status)) {
      setMessageKind("error");
      setMessage(
        "A transfer request already exists for this synthetic assignment.",
      );
      return;
    }

    const isReturnedRequest = request?.status === "returned";

    setRequest({
      ...(isReturnedRequest ? request : transferRequestTemplate),
      status: "submitted",
      form: submittedForm,
      submittedByActorId: personaId || "hr-operator",
      decidedByActorId: undefined,
      auditActions: isReturnedRequest
        ? [...request.auditActions, "mvp_b.transfer.submit"]
        : ["mvp_b.transfer.submit"],
    });
    setMessageKind("ok");
    setMessage(
      isReturnedRequest
        ? "Returned transfer request resubmitted with synthetic data only."
        : "Bounded transfer request created with synthetic data only.",
    );
  };

  return (
    <div className="workflow-grid">
      <section className="workflow-panel" aria-labelledby="transfer-form">
        <div>
          <p className="context-label">Synthetic transfer input</p>
          <h3 id="transfer-form">Create bounded request</h3>
        </div>
        <div className="form-grid">
          <label>
            Transfer subject
            <input
              value={form.displayName}
              onChange={updateField("displayName")}
            />
          </label>
          <label>
            Transfer effective date
            <input
              type="date"
              value={form.effectiveDate}
              onChange={updateField("effectiveDate")}
            />
          </label>
          <label>
            Current assignment
            <input
              value={form.currentAssignmentId}
              onChange={updateField("currentAssignmentId")}
            />
          </label>
          <label>
            Current assignment code
            <input
              value={form.currentAssignmentCode}
              onChange={updateField("currentAssignmentCode")}
            />
          </label>
          <label>
            Target organization
            <input
              value={form.targetOrganizationReference}
              onChange={updateField("targetOrganizationReference")}
            />
          </label>
          <label>
            Target department
            <input
              value={form.targetDepartmentReference}
              onChange={updateField("targetDepartmentReference")}
            />
          </label>
          <label>
            Target manager
            <input
              value={form.targetManagerReference}
              onChange={updateField("targetManagerReference")}
            />
          </label>
          <label>
            Target position
            <input
              value={form.targetPositionCode}
              onChange={updateField("targetPositionCode")}
            />
          </label>
          <label>
            Transfer reason
            <input
              value={form.transferReasonCode}
              onChange={updateField("transferReasonCode")}
            />
          </label>
        </div>
        <EvidenceItem
          title="Transfer impact preview"
          body={`${form.currentAssignmentId} (${form.currentAssignmentCode}) closes and ${form.targetOrganizationReference}/${form.targetDepartmentReference} opens under ${form.targetManagerReference}.`}
        />
        <button type="button" onClick={createRequest} disabled={!isOperator}>
          Create transfer request
        </button>
        {message ? (
          <section
            className={
              messageKind === "error"
                ? "notice notice-error compact"
                : "notice notice-ok compact"
            }
            role={messageKind === "error" ? "alert" : "status"}
          >
            <p>{message}</p>
          </section>
        ) : null}
      </section>

      <section className="workflow-panel" aria-labelledby="transfer-detail">
        <div>
          <p className="context-label">Request detail</p>
          <h3 id="transfer-detail">
            {request?.id ?? "No transfer request selected"}
          </h3>
        </div>
        {request ? (
          <>
            <dl className="detail-list">
              <div>
                <dt>Status</dt>
                <dd>{formatStatus(request.status)}</dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>{request.form.displayName}</dd>
              </div>
              <div>
                <dt>Correlation trace</dt>
                <dd>{request.correlationId}</dd>
              </div>
            </dl>
            <div className="evidence-stack" aria-label="Evidence">
              <EvidenceItem
                title="Assignment close evidence"
                body={`${request.form.currentAssignmentId} (${request.form.currentAssignmentCode}) closes on ${request.form.effectiveDate}.`}
              />
              <EvidenceItem
                title="Target assignment evidence"
                body={`${request.form.targetOrganizationReference}/${request.form.targetDepartmentReference} opens for ${request.form.targetPositionCode} under ${request.form.targetManagerReference}. Reason: ${request.form.transferReasonCode}.`}
              />
              <EvidenceItem
                title="Okta transfer projection"
                body="Synthetic mock-mode group and profile projection only. No live provider mutation."
              />
              <EvidenceItem
                title="Audit evidence"
                body={request.auditActions.join(", ")}
              />
            </div>
          </>
        ) : (
          <p className="muted">
            Create a bounded transfer request to inspect assignment close,
            target assignment, projection, audit, and correlation evidence.
          </p>
        )}
      </section>
    </div>
  );
}

function TerminationWorkflow({
  personaId,
  personaRole,
  request,
  setRequest,
}: {
  personaId: BoundedPersonaId | "";
  personaRole: string | undefined;
  request: TerminationRequest | null;
  setRequest: (request: TerminationRequest) => void;
}) {
  const [form, setForm] = useState<TerminationFormState>(
    defaultTerminationForm,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"error" | "ok">("ok");
  const isOperator = personaRole === "bounded_hr_operator";

  useEffect(() => {
    if (request?.status === "returned") {
      setForm(request.form);
    }
  }, [request?.form, request?.status]);

  const updateField =
    (field: keyof TerminationFormState) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    };

  const createRequest = () => {
    if (!isOperator) {
      setMessageKind("error");
      setMessage(
        "Only the bounded HR operator persona can create termination requests in this synthetic workflow.",
      );
      return;
    }

    const submittedForm = normalizeTerminationForm(form);
    const missingFields = [
      ["displayName", "display name"],
      ["effectiveDate", "effective date"],
      ["employmentId", "employment"],
      ["employmentCode", "employment code"],
      ["currentAssignmentId", "current assignment"],
      ["currentAssignmentCode", "current assignment code"],
      ["reasonCode", "termination reason"],
    ] as const;
    const missing = missingFields
      .filter(([field]) => !submittedForm[field])
      .map(([, label]) => label);

    if (missing.length > 0) {
      setMessageKind("error");
      setMessage(
        `Complete ${missing.join(
          ", ",
        )} before submitting this bounded termination request.`,
      );
      return;
    }

    if (
      isBeforeRequestedDate(
        submittedForm.effectiveDate,
        terminationRequestTemplate.requestedAt,
      )
    ) {
      setMessageKind("error");
      setMessage(
        "Termination effective date must be on or after the requested date for this bounded workflow.",
      );
      return;
    }

    if (!isAllowedTerminationReasonCode(submittedForm.reasonCode)) {
      setMessageKind("error");
      setMessage(
        "Termination reason must be resignation, retirement, contract_end, or mutual_agreement for this bounded workflow.",
      );
      return;
    }

    if (request && blocksDuplicateRequest(request.status)) {
      setMessageKind("error");
      setMessage(
        "A termination request already exists for this synthetic employment.",
      );
      return;
    }

    const isReturnedRequest = request?.status === "returned";

    setRequest({
      ...(isReturnedRequest ? request : terminationRequestTemplate),
      status: "submitted",
      form: submittedForm,
      submittedByActorId: personaId || "hr-operator",
      decidedByActorId: undefined,
      auditActions: isReturnedRequest
        ? [...request.auditActions, "mvp_c.termination.submit"]
        : ["mvp_c.termination.submit"],
    });
    setMessageKind("ok");
    setMessage(
      isReturnedRequest
        ? "Returned termination request resubmitted with synthetic data only."
        : "Bounded termination request created with synthetic data only.",
    );
  };

  return (
    <div className="workflow-grid">
      <section className="workflow-panel" aria-labelledby="termination-form">
        <div>
          <p className="context-label">Synthetic termination input</p>
          <h3 id="termination-form">Create bounded request</h3>
        </div>
        <div className="form-grid">
          <label>
            Termination subject
            <input
              value={form.displayName}
              onChange={updateField("displayName")}
            />
          </label>
          <label>
            Termination effective date
            <input
              type="date"
              value={form.effectiveDate}
              onChange={updateField("effectiveDate")}
            />
          </label>
          <label>
            Employment
            <input
              value={form.employmentId}
              onChange={updateField("employmentId")}
            />
          </label>
          <label>
            Employment code
            <input
              value={form.employmentCode}
              onChange={updateField("employmentCode")}
            />
          </label>
          <label>
            Current assignment
            <input
              value={form.currentAssignmentId}
              onChange={updateField("currentAssignmentId")}
            />
          </label>
          <label>
            Current assignment code
            <input
              value={form.currentAssignmentCode}
              onChange={updateField("currentAssignmentCode")}
            />
          </label>
          <label>
            Reason
            <input
              value={form.reasonCode}
              onChange={updateField("reasonCode")}
            />
          </label>
        </div>
        <EvidenceItem
          title="Effective-date confirmation"
          body={`${form.employmentCode} and ${form.currentAssignmentId} close on ${form.effectiveDate}.`}
        />
        <EvidenceItem
          title="Retention/deletion runtime blocked"
          body="Retention, anonymization, legal hold, and deletion jobs remain blocked future-extension surfaces."
        />
        <button type="button" onClick={createRequest} disabled={!isOperator}>
          Create termination request
        </button>
        {message ? (
          <section
            className={
              messageKind === "error"
                ? "notice notice-error compact"
                : "notice notice-ok compact"
            }
            role={messageKind === "error" ? "alert" : "status"}
          >
            <p>{message}</p>
          </section>
        ) : null}
      </section>

      <section className="workflow-panel" aria-labelledby="termination-detail">
        <div>
          <p className="context-label">Request detail</p>
          <h3 id="termination-detail">
            {request?.id ?? "No termination request selected"}
          </h3>
        </div>
        {request ? (
          <>
            <dl className="detail-list">
              <div>
                <dt>Status</dt>
                <dd>{formatStatus(request.status)}</dd>
              </div>
              <div>
                <dt>Subject</dt>
                <dd>{request.form.displayName}</dd>
              </div>
              <div>
                <dt>Correlation trace</dt>
                <dd>{request.correlationId}</dd>
              </div>
            </dl>
            <div className="evidence-stack" aria-label="Evidence">
              <EvidenceItem
                title="Employment close evidence"
                body={`${request.form.employmentId} (${request.form.employmentCode}) closes on ${request.form.effectiveDate}. Reason: ${request.form.reasonCode}.`}
              />
              <EvidenceItem
                title="Assignment close evidence"
                body={`${request.form.currentAssignmentId} (${request.form.currentAssignmentCode}) closes on ${request.form.effectiveDate}.`}
              />
              <EvidenceItem
                title="Okta disable projection"
                body="Synthetic mock-mode disable projection only. No live provider mutation."
              />
              <EvidenceItem
                title="Retention/deletion runtime blocked"
                body="No hard delete, anonymization, legal hold, or deletion job is introduced."
              />
              <EvidenceItem
                title="Audit evidence"
                body={request.auditActions.join(", ")}
              />
            </div>
          </>
        ) : (
          <p className="muted">
            Create a bounded termination request to inspect employment close,
            assignment close, disable projection, audit, and correlation
            evidence.
          </p>
        )}
      </section>
    </div>
  );
}

function EvidenceItem({ title, body }: { title: string; body: string }) {
  return (
    <article className="evidence-item">
      <h4>{title}</h4>
      <p>{body}</p>
    </article>
  );
}

function CsvWorkflow({
  actorId,
  evidence,
}: {
  actorId: BoundedPersonaId;
  evidence: CsvWorkflowEvidence;
}) {
  const auditActions = evidence.auditActions.map((action) =>
    action === "mvp_d.csv.upload.synthetic"
      ? `${action} acceptedBy=${actorId}`
      : action,
  );

  return (
    <div className="workflow-grid">
      <section className="workflow-panel" aria-labelledby="csv-dry-run">
        <div>
          <p className="context-label">Repository-owned synthetic CSV only</p>
          <h3 id="csv-dry-run">Upload bounded CSV</h3>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Template</dt>
            <dd>{lifecycleSupportEvidenceVersion}</dd>
          </div>
          <div>
            <dt>File</dt>
            <dd>{evidence.fileName}</dd>
          </div>
          <div>
            <dt>Import</dt>
            <dd>{evidence.importId}</dd>
          </div>
        </dl>
        <EvidenceItem
          title="Dry-run row diff"
          body={`${evidence.rowId} updates ${evidence.maskedField} for ${evidence.subjectId} to ${evidence.proposedValue}. Raw payload and real employee values stay blocked.`}
        />
        <EvidenceItem
          title="Apply confirmation"
          body="Apply remains a bounded confirmation step for this synthetic dry-run result; destructive changes require an explicit operator confirmation and audit trail."
        />
      </section>

      <section className="workflow-panel" aria-labelledby="csv-export">
        <div>
          <p className="context-label">Bounded export request</p>
          <h3 id="csv-export">Bounded export denial</h3>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Request</dt>
            <dd>{evidence.exportRequestId}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Denied</dd>
          </div>
          <div>
            <dt>Correlation</dt>
            <dd>{evidence.correlationId}</dd>
          </div>
        </dl>
        <EvidenceItem title="Denied reason" body={evidence.deniedReason} />
        <EvidenceItem title="Audit evidence" body={auditActions.join(", ")} />
      </section>
    </div>
  );
}

function OpsDlqWorkflow({
  evidence,
  operatorActorId,
  setEvidence,
}: {
  evidence: OpsDlqEvidence;
  operatorActorId: BoundedPersonaId;
  setEvidence: (evidence: OpsDlqEvidence) => void;
}) {
  const [decision, setDecision] = useState<DlqDecision>("retry");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"error" | "ok">("ok");
  const latestEvidenceRef = useRef(evidence);

  useEffect(() => {
    latestEvidenceRef.current = evidence;
  }, [evidence]);

  const submitDecision = (selectedDecision: DlqDecision) => {
    const submittedReason = reason.trim();
    const currentEvidence = latestEvidenceRef.current;

    if (terminalOpsDlqStatuses.includes(currentEvidence.status)) {
      setMessageKind("error");
      setMessage(
        `DLQ decision rejected because ${currentEvidence.failedRowId} is ${formatStatus(
          currentEvidence.status,
        )}; terminal decisions cannot be overwritten.`,
      );
      return;
    }

    if (
      selectedDecision === "retry" &&
      currentEvidence.retryCount >= maxOpsDlqRetries
    ) {
      setMessageKind("error");
      setMessage(
        `DLQ decision rejected because ${currentEvidence.failedRowId} already reached ${maxOpsDlqRetries}/${maxOpsDlqRetries} retries.`,
      );
      return;
    }

    if (
      selectedDecision === "replay" &&
      currentEvidence.recordedDecisions.includes("replay")
    ) {
      setMessageKind("error");
      setMessage(
        `DLQ decision rejected because ${currentEvidence.failedRowId} already has replay evidence; duplicate replay cannot be recorded.`,
      );
      return;
    }

    if (!submittedReason) {
      setMessageKind("error");
      setMessage(
        "Capture a decision reason before retry, replay, ignore, or close.",
      );
      return;
    }

    if (!confirmed) {
      setMessageKind("error");
      setMessage(
        "Confirm this destructive DLQ decision before writing audit evidence.",
      );
      return;
    }

    const nextStatusByDecision: Record<DlqDecision, OpsDlqEvidence["status"]> =
      {
        retry: "open",
        replay: "replayed",
        ignore: "ignored",
        close: "closed",
      };

    const nextEvidence = {
      ...currentEvidence,
      status: nextStatusByDecision[selectedDecision],
      retryCount:
        selectedDecision === "retry"
          ? currentEvidence.retryCount + 1
          : currentEvidence.retryCount,
      recordedDecisions: [
        ...currentEvidence.recordedDecisions,
        selectedDecision,
      ],
      lastDecision: selectedDecision,
      decisionReason: submittedReason,
      auditActions: [
        ...currentEvidence.auditActions,
        `${dlqFailureDecisionActionPrefix}.${selectedDecision} evidenceVersion=${lifecycleSupportEvidenceVersion} reason=${submittedReason} decidedBy=${operatorActorId}`,
      ],
    };

    latestEvidenceRef.current = nextEvidence;
    setEvidence(nextEvidence);
    setMessageKind("ok");
    setMessage("DLQ decision recorded with bounded audit evidence.");
  };

  return (
    <div className="job-monitor">
      <section className="summary-grid" aria-label="Job status summary">
        <SummaryCard
          label="Queued"
          value="14"
          detail="scheduler backlog"
          tone="amber"
          icon={CalendarClock}
        />
        <SummaryCard
          label="Running"
          value="5"
          detail="current workers"
          tone="blue"
          icon={BriefcaseBusiness}
        />
        <SummaryCard
          label="Failed"
          value="2"
          detail="needs replay"
          tone="red"
          icon={CircleAlert}
        />
        <SummaryCard
          label="DLQ open"
          value={evidence.status === "open" ? "3" : "2"}
          detail="awaiting resolution"
          tone="green"
          icon={ClipboardList}
        />
      </section>

      <div className="job-overview">
        <section className="surface" aria-labelledby="recent-runs">
          <div className="section-heading">
            <div>
              <p className="context-label">Repository-owned synthetic jobs</p>
              <h2 id="recent-runs">Recent runs</h2>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Retry</th>
                  <th>Correlation</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Future effective apply</td>
                  <td>
                    <span className="table-status status-running">Running</span>
                  </td>
                  <td>18:00</td>
                  <td>0</td>
                  <td>
                    <code>txn-9472</code>
                  </td>
                </tr>
                <tr>
                  <td>Okta provisioning retry</td>
                  <td>
                    <span className="table-status status-failed">Failed</span>
                  </td>
                  <td>17:42</td>
                  <td>2</td>
                  <td>
                    <code>prov-1204</code>
                  </td>
                </tr>
                <tr>
                  <td>Writeback replay</td>
                  <td>
                    <span className="table-status status-success">
                      Succeeded
                    </span>
                  </td>
                  <td>17:20</td>
                  <td>1</td>
                  <td>
                    <code>wb-7711</code>
                  </td>
                </tr>
                <tr>
                  <td>SmartHR reconcile</td>
                  <td>
                    <span className="table-status status-queued">Queued</span>
                  </td>
                  <td>20:00</td>
                  <td>0</td>
                  <td>
                    <code>sync-2102</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="surface" aria-labelledby="failed-items">
          <div className="section-heading">
            <div>
              <p className="context-label">Needs operator review</p>
              <h2 id="failed-items">Failed items</h2>
            </div>
          </div>
          <div className="failed-list">
            <div>
              <strong>Assignment</strong>
              <code>E-1021</code>
              <span>Missing target group</span>
            </div>
            <div>
              <strong>Assignment</strong>
              <code>E-1147</code>
              <span>Manager link invalid</span>
            </div>
            <div>
              <strong>Contact</strong>
              <code>{evidence.failedRowId}</code>
              <span>writeback ownership conflict</span>
            </div>
          </div>
        </section>
      </div>

      <div className="workflow-grid">
        <section className="workflow-panel" aria-labelledby="ops-job-detail">
          <div>
            <p className="context-label">Synthetic non-production Ops only</p>
            <h3 id="ops-job-detail">Ops job detail</h3>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Job</dt>
              <dd>{evidence.jobId}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{formatStatus(evidence.status)}</dd>
            </div>
            <div>
              <dt>Retry count</dt>
              <dd>
                {evidence.retryCount}/{maxOpsDlqRetries}
              </dd>
            </div>
            <div>
              <dt>Correlation</dt>
              <dd>{evidence.correlationId}</dd>
            </div>
          </dl>
          <EvidenceItem
            title="Status evidence"
            body="Local synthetic job status is visible for inspection only. Production scheduler, queue readiness, incident, on-call, SLO, and custody surfaces remain blocked."
          />
          <EvidenceItem
            title="Field-level masking"
            body={`${evidence.failedRowId} exposes masked row evidence only; raw payload viewing is blocked.`}
          />
        </section>

        <section className="workflow-panel" aria-labelledby="dlq-decision">
          <div>
            <p className="context-label">Reasoned failed-row decision</p>
            <h3 id="dlq-decision">DLQ decision</h3>
          </div>
          <div className="form-grid compact-form">
            <label>
              Decision action
              <select
                value={decision}
                onChange={(event) =>
                  setDecision(event.target.value as DlqDecision)
                }
              >
                <option value="retry">Retry</option>
                <option value="replay">Replay</option>
                <option value="ignore">Ignore</option>
                <option value="close">Close</option>
              </select>
            </label>
            <label>
              Decision reason
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Confirm bounded non-production DLQ action
            </label>
          </div>
          <div className="decision-bar">
            <button type="button" onClick={() => submitDecision(decision)}>
              Record selected DLQ decision
            </button>
          </div>
          {message ? (
            <section
              className={
                messageKind === "error"
                  ? "notice notice-error compact"
                  : "notice notice-ok compact"
              }
              role={messageKind === "error" ? "alert" : "status"}
            >
              <p>{message}</p>
            </section>
          ) : null}
          <EvidenceItem
            title="Audit evidence"
            body={evidence.auditActions.join(", ")}
          />
          {evidence.decisionReason ? (
            <EvidenceItem
              title="Last decision reason"
              body={`${evidence.lastDecision}: ${evidence.decisionReason}`}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "green" | "amber" | "red";
  icon: LucideIcon;
}) {
  return (
    <article className={`summary-card tone-${tone}`}>
      <span className="summary-icon" aria-hidden="true">
        <Icon size={20} strokeWidth={2} />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function DashboardView({
  onboardingRequest,
  transferRequest,
  terminationRequest,
  opsDlqEvidence,
  onNavigate,
  canNavigate,
}: {
  onboardingRequest: OnboardingRequest | null;
  transferRequest: TransferRequest | null;
  terminationRequest: TerminationRequest | null;
  opsDlqEvidence: OpsDlqEvidence;
  onNavigate: (route: RouteId) => void;
  canNavigate: (route: RouteId) => boolean;
}) {
  const requests = [
    onboardingRequest,
    transferRequest,
    terminationRequest,
  ].filter(
    (
      request,
    ): request is OnboardingRequest | TransferRequest | TerminationRequest =>
      request !== null,
  );
  const submittedCount = requests.filter(
    (request) => request.status === "submitted",
  ).length;
  const draftCount = Math.max(3, requests.length);

  const schedule: Array<{
    time: string;
    title: string;
    meta: string;
    route: RouteId;
  }> = [
    {
      time: "09:00",
      title: "入社開始",
      meta: "3名 / 東京",
      route: "onboarding",
    },
    {
      time: "11:30",
      title: "異動適用",
      meta: "2件が承認待ち",
      route: "transfer",
    },
    {
      time: "18:00",
      title: "future-date apply",
      meta: "7件の予定変更",
      route: "ops",
    },
    {
      time: "20:00",
      title: "SmartHR 再照合",
      meta: "夜間ジョブ",
      route: "ops",
    },
  ];
  const visibleSchedule = schedule.filter((item) => canNavigate(item.route));
  const drafts: Array<{
    title: string;
    detail: string;
    time: string;
    route: RouteId;
  }> = [
    {
      title: "異動手続き / 山田 太郎",
      detail: "営業本部からコーポレートIT",
      time: "09:18",
      route: "transfer",
    },
    {
      title: "退職手続き / 鈴木 一郎",
      detail: "有効日 2026/08/31",
      time: "08:42",
      route: "termination",
    },
    {
      title: "入社手続き / 田中 美咲",
      detail: "必須項目を確認中",
      time: "昨日 18:11",
      route: "onboarding",
    },
  ];
  const visibleDrafts = drafts.filter((item) => canNavigate(item.route));

  return (
    <div className="dashboard-view">
      <section className="summary-grid" aria-label="本日の業務サマリー">
        <SummaryCard
          label="本日の対応"
          value="12"
          detail={`承認 ${submittedCount || 3}件 / 下書き ${draftCount}件`}
          tone="blue"
          icon={ClipboardList}
        />
        <SummaryCard
          label="連携ヘルス"
          value="98.7%"
          detail="writeback 保留 1件"
          tone="green"
          icon={Cloud}
        />
        <SummaryCard
          label="要確認"
          value={String(Math.max(4, submittedCount))}
          detail="影響レビューあり"
          tone="amber"
          icon={CircleAlert}
        />
        <SummaryCard
          label="DLQ"
          value={opsDlqEvidence.status === "open" ? "2" : "1"}
          detail="担当割当待ち"
          tone="red"
          icon={Bell}
        />
      </section>

      <div className="dashboard-grid">
        <section
          className="surface schedule-surface"
          aria-labelledby="schedule"
        >
          <div className="section-heading">
            <div>
              <p className="context-label">Work queue</p>
              <h2 id="schedule">今日と7日以内</h2>
            </div>
            <CalendarClock size={20} aria-hidden="true" />
          </div>
          <div className="schedule-list">
            {visibleSchedule.length > 0 ? (
              visibleSchedule.map((item) => (
                <button
                  className="schedule-row"
                  key={`${item.time}-${item.title}`}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                >
                  <time>{item.time}</time>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.meta}</small>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))
            ) : (
              <p className="muted">
                この persona で利用できる予定導線はありません。
              </p>
            )}
          </div>
        </section>

        <section
          className="surface integration-surface"
          aria-labelledby="integration-status"
        >
          <div className="section-heading">
            <div>
              <p className="context-label">Integration health</p>
              <h2 id="integration-status">連携状況</h2>
            </div>
            <CircleCheck size={20} aria-hidden="true" />
          </div>
          <div className="integration-list">
            <div>
              <span>Okta 主系同期</span>
              <strong className="state-success">正常</strong>
              <time>09:42</time>
            </div>
            <div>
              <span>Entra シャドー同期</span>
              <strong className="state-warning">差分 2件</strong>
              <time>09:40</time>
            </div>
            <div>
              <span>会社メール writeback</span>
              <strong className="state-warning">1件保留</strong>
              <time>09:37</time>
            </div>
            <div>
              <span>SmartHR 再照合</span>
              <strong className="state-success">完了</strong>
              <time>02:10</time>
            </div>
          </div>
        </section>

        <section className="surface drafts-surface" aria-labelledby="drafts">
          <div className="section-heading">
            <div>
              <p className="context-label">Recent activity</p>
              <h2 id="drafts">最近の下書き</h2>
            </div>
          </div>
          <div className="draft-list">
            {visibleDrafts.length > 0 ? (
              visibleDrafts.map((item) => (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                >
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <time>{item.time}</time>
                </button>
              ))
            ) : (
              <p className="muted">
                この persona で利用できる下書き導線はありません。
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function EmployeeDetailView({
  onOpenTransfer,
}: {
  onOpenTransfer: (() => void) | null;
}) {
  return (
    <div className="employee-detail">
      <section className="surface employee-hero">
        <div className="employee-avatar" aria-hidden="true">
          山
        </div>
        <div className="employee-identity">
          <p className="context-label">Repository-owned synthetic record</p>
          <h2>山田 太郎</h2>
          <p>社員番号 EMP-000128 / 正社員 / 2024/04/01 入社</p>
          <div className="badge-row" aria-label="従業員状態">
            <span className="soft-badge state-success">在籍中</span>
            <span className="soft-badge">主系: Okta</span>
            <span className="soft-badge">会社メール連携済</span>
          </div>
        </div>
        {onOpenTransfer ? (
          <button
            className="secondary-button"
            type="button"
            onClick={onOpenTransfer}
          >
            異動手続きを開く
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        ) : null}
      </section>

      <div className="employee-grid">
        <section className="surface" aria-labelledby="basic-information">
          <div className="section-heading">
            <div>
              <p className="context-label">Masked where required</p>
              <h2 id="basic-information">基本情報</h2>
            </div>
          </div>
          <dl className="profile-grid">
            <div>
              <dt>氏名</dt>
              <dd>山田 太郎</dd>
            </div>
            <div>
              <dt>氏名カナ</dt>
              <dd>ヤマダ タロウ</dd>
            </div>
            <div>
              <dt>個人番号</dt>
              <dd>PER-000128</dd>
            </div>
            <div>
              <dt>社員番号</dt>
              <dd>EMP-000128</dd>
            </div>
            <div>
              <dt>所属</dt>
              <dd>営業本部 / 第1営業部</dd>
            </div>
            <div>
              <dt>役職</dt>
              <dd>主任</dd>
            </div>
            <div>
              <dt>勤務地</dt>
              <dd>東京本社</dd>
            </div>
            <div>
              <dt>上長</dt>
              <dd>佐藤 花子</dd>
            </div>
            <div>
              <dt>会社メール</dt>
              <dd>taro.yamada@***</dd>
            </div>
            <div>
              <dt>携帯番号</dt>
              <dd>090-****-5678</dd>
            </div>
          </dl>
        </section>

        <section
          className="surface timeline-surface"
          aria-labelledby="timeline"
        >
          <div className="section-heading">
            <div>
              <p className="context-label">Lifecycle evidence</p>
              <h2 id="timeline">履歴タイムライン</h2>
            </div>
          </div>
          <ol className="timeline">
            <li>
              <time>2026/04/01</time>
              <span>
                <strong>会社メール連携</strong>
                <small>Okta から work_email を反映</small>
              </span>
            </li>
            <li>
              <time>2025/10/01</time>
              <span>
                <strong>異動</strong>
                <small>営業第2グループから第1グループ</small>
              </span>
            </li>
            <li>
              <time>2024/04/01</time>
              <span>
                <strong>入社</strong>
                <small>営業本部へ配属、アカウント自動作成</small>
              </span>
            </li>
          </ol>
        </section>

        <section
          className="surface external-identities"
          aria-labelledby="external-identities"
        >
          <div className="section-heading">
            <div>
              <p className="context-label">Bounded provider evidence</p>
              <h2 id="external-identities">外部ID / 連携状態</h2>
            </div>
          </div>
          <div className="integration-list">
            <div>
              <span>Okta</span>
              <code>00u3abcxyz</code>
              <strong className="state-success">同期正常</strong>
            </div>
            <div>
              <span>Entra</span>
              <code>shadow:9c1f...</code>
              <strong className="state-success">差分なし</strong>
            </div>
            <div>
              <span>SmartHR</span>
              <code>employee:128</code>
              <strong className="state-warning">再照合予定</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SecondaryAreaView({ area }: { area: PlannedArea }) {
  const Icon = area.icon;
  const isSupport = area.id === "support";

  return (
    <section
      className="surface secondary-area"
      aria-labelledby="secondary-area"
    >
      <span className="secondary-area-icon" aria-hidden="true">
        <Icon size={22} />
      </span>
      <div>
        <p className="context-label">{area.eyebrow}</p>
        <h2 id="secondary-area">{area.title}</h2>
        <p>{area.summary}</p>
      </div>
      <div className="secondary-area-list">
        {isSupport ? (
          <>
            <div>
              <span>対象</span>
              <strong>EMP-000128 / 山田 太郎</strong>
            </div>
            <div>
              <span>参照境界</span>
              <strong>single subject only</strong>
            </div>
            <div>
              <span>最新記録</span>
              <strong>異動影響の確認依頼</strong>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>Environment label</span>
              <strong>non-production</strong>
            </div>
            <div>
              <span>Primary provider</span>
              <strong>Okta mock</strong>
            </div>
            <div>
              <span>Production controls</span>
              <strong className="state-warning">blocked</strong>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function AuditWorkflow() {
  return (
    <div className="workflow-grid">
      <section className="workflow-panel" aria-labelledby="audit-lookup">
        <div>
          <p className="context-label">Single correlation boundary</p>
          <h3 id="audit-lookup">Direct correlation lookup</h3>
        </div>
        <label className="audit-lookup">
          Correlation ID
          <span>
            <Search size={17} aria-hidden="true" />
            <input
              defaultValue="correlation-transfer-001"
              aria-describedby="audit-lookup-boundary"
            />
          </span>
        </label>
        <EvidenceItem
          title="Lookup boundary"
          body="Operators can inspect one explicit synthetic correlation at a time. Broad search, raw payload export, production authorization, and immutable production audit claims remain blocked."
        />
        <p id="audit-lookup-boundary" className="muted">
          完全一致する repository-owned synthetic ID のみ参照できます。
        </p>
      </section>

      <section className="workflow-panel" aria-labelledby="audit-evidence">
        <div>
          <p className="context-label">Authoritative lifecycle evidence</p>
          <h3 id="audit-evidence">Evidence timeline</h3>
        </div>
        <ol className="audit-timeline">
          <li>
            <CircleCheck size={17} aria-hidden="true" />
            <span>
              <strong>Request submitted</strong>
              <small>mvp_b.transfer.submitted / 09:18</small>
            </span>
          </li>
          <li>
            <CircleCheck size={17} aria-hidden="true" />
            <span>
              <strong>Impact projection recorded</strong>
              <small>repository-owned mock provider / 09:18</small>
            </span>
          </li>
          <li>
            <CalendarClock size={17} aria-hidden="true" />
            <span>
              <strong>Approval pending</strong>
              <small>bounded approver queue / due 17:00</small>
            </span>
          </li>
        </ol>
      </section>
    </div>
  );
}

function ApprovalsWorkflow({
  approverActorId,
  request,
  transferRequest,
  terminationRequest,
  onDecision,
  onTransferDecision,
  onTerminationDecision,
}: {
  approverActorId: BoundedPersonaId | null;
  request: OnboardingRequest | null;
  transferRequest: TransferRequest | null;
  terminationRequest: TerminationRequest | null;
  onDecision: (decision: OnboardingDecision) => void;
  onTransferDecision: (decision: PracticalWorkflowDecision) => void;
  onTerminationDecision: (decision: PracticalWorkflowDecision) => void;
}) {
  const [selectedKind, setSelectedKind] = useState<ApprovalKind>(() =>
    getPreferredApprovalKind(request, transferRequest, terminationRequest),
  );
  const [comment, setComment] = useState("");
  const decisionDisabled = !approverActorId || request?.status !== "submitted";
  const transferDecisionDisabled =
    !approverActorId || transferRequest?.status !== "submitted";
  const terminationDecisionDisabled =
    !approverActorId || terminationRequest?.status !== "submitted";

  const approvalItems: Array<{
    kind: ApprovalKind;
    title: string;
    subject: string;
    effectiveDate: string;
    priority: "高" | "中" | "低";
    status: PracticalWorkflowStatus | "empty";
  }> = [
    {
      kind: "onboarding",
      title: "入社",
      subject: request?.form.displayName ?? "田中 美咲",
      effectiveDate: request?.form.startDate ?? "2026/05/01",
      priority: "低",
      status: request?.status ?? "empty",
    },
    {
      kind: "transfer",
      title: "異動",
      subject: transferRequest?.form.displayName ?? "山田 太郎",
      effectiveDate: transferRequest?.form.effectiveDate ?? "2026/05/01",
      priority: "高",
      status: transferRequest?.status ?? "empty",
    },
    {
      kind: "termination",
      title: "退職",
      subject: terminationRequest?.form.displayName ?? "鈴木 一郎",
      effectiveDate: terminationRequest?.form.effectiveDate ?? "2026/04/26",
      priority: "中",
      status: terminationRequest?.status ?? "empty",
    },
  ];

  const selectedItem =
    approvalItems.find((item) => item.kind === selectedKind) ??
    approvalItems[0];
  const selectedStatus = getApprovalStatusPresentation(selectedItem.status);

  return (
    <div className="approval-layout">
      <section
        className="surface approval-list"
        aria-labelledby="approval-list"
      >
        <div className="section-heading">
          <div>
            <p className="context-label">Bounded approver queue</p>
            <h2 id="approval-list">承認待ち一覧</h2>
          </div>
          <span className="queue-count">3</span>
        </div>
        <div className="approval-items">
          {approvalItems.map((item) => (
            <button
              className={
                item.kind === selectedKind
                  ? "approval-item approval-item-active"
                  : "approval-item"
              }
              key={item.kind}
              type="button"
              aria-pressed={item.kind === selectedKind}
              onClick={() => setSelectedKind(item.kind)}
            >
              <span>
                <strong>
                  {item.title} / {item.subject}
                </strong>
                <small>有効日 {item.effectiveDate}</small>
              </span>
              <span className={`priority priority-${item.priority}`}>
                優先度 {item.priority}
              </span>
              <small className="approval-status">
                {item.status === "empty"
                  ? "fixture"
                  : formatStatus(item.status)}
              </small>
            </button>
          ))}
        </div>
      </section>

      <section
        className="surface approval-detail"
        aria-labelledby="approval-detail"
      >
        <div className="approval-detail-header">
          <div>
            <p className="context-label">Selected bounded request</p>
            <h2 id="approval-detail">
              {selectedItem.title} / {selectedItem.subject}
            </h2>
            <p>起票者: HR operator / 提出: 2026/04/21 09:18</p>
          </div>
          <span className={`soft-badge ${selectedStatus.tone}`.trim()}>
            {selectedStatus.label}
          </span>
        </div>

        {selectedKind === "onboarding" ? (
          <>
            <h3>{request?.id ?? "No submitted onboarding request"}</h3>
            {request ? (
              <>
                <p>
                  {request.form.displayName} is {formatStatus(request.status)}{" "}
                  for {request.correlationId}.
                </p>
                <dl className="detail-list">
                  <div>
                    <dt>対象者</dt>
                    <dd>{request.form.displayName}</dd>
                  </div>
                  <div>
                    <dt>有効日</dt>
                    <dd>{request.form.startDate}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{formatStatus(request.status)}</dd>
                  </div>
                  <div>
                    <dt>Correlation</dt>
                    <dd>{request.correlationId}</dd>
                  </div>
                </dl>
                <div className="impact-checks">
                  <p>
                    <Check size={16} aria-hidden="true" />
                    Okta アカウントを synthetic projection で作成
                  </p>
                  <p>
                    <Check size={16} aria-hidden="true" />
                    会社メールは masked preview のみ
                  </p>
                  <p>
                    <Check size={16} aria-hidden="true" />
                    手動対応は不要
                  </p>
                </div>
                <EvidenceItem
                  title="Audit evidence"
                  body={request.auditActions.join(", ")}
                />
                {request.decidedByActorId ? (
                  <EvidenceItem
                    title="Decision actor"
                    body={`decidedBy=${request.decidedByActorId}`}
                  />
                ) : null}
              </>
            ) : (
              <p className="muted">
                Submitted onboarding requests appear here for bounded approver
                decisions.
              </p>
            )}
          </>
        ) : null}

        {selectedKind === "transfer" ? (
          <>
            <h3>Transfer approvals</h3>
            {transferRequest ? (
              <>
                <p>
                  Transfer is {formatStatus(transferRequest.status)} for{" "}
                  {transferRequest.correlationId}.
                </p>
                <div
                  className="evidence-stack"
                  role="group"
                  aria-label="Transfer approval context"
                >
                  <EvidenceItem
                    title="Assignment close evidence"
                    body={`${transferRequest.form.currentAssignmentId} (${transferRequest.form.currentAssignmentCode}) closes on ${transferRequest.form.effectiveDate}.`}
                  />
                  <EvidenceItem
                    title="Target assignment evidence"
                    body={`${transferRequest.form.targetOrganizationReference}/${transferRequest.form.targetDepartmentReference} opens for ${transferRequest.form.targetPositionCode} under ${transferRequest.form.targetManagerReference}. Reason: ${transferRequest.form.transferReasonCode}.`}
                  />
                  <EvidenceItem
                    title="Okta transfer projection"
                    body="Synthetic mock-mode group and profile projection only. No live provider mutation."
                  />
                </div>
                <EvidenceItem
                  title="Audit evidence"
                  body={transferRequest.auditActions.join(", ")}
                />
              </>
            ) : (
              <p className="muted">
                Submitted transfer requests appear here for bounded approver
                decisions.
              </p>
            )}
          </>
        ) : null}

        {selectedKind === "termination" ? (
          <>
            <h3>Termination approvals</h3>
            {terminationRequest ? (
              <>
                <p>
                  Termination is {formatStatus(terminationRequest.status)} for{" "}
                  {terminationRequest.correlationId}.
                </p>
                <div
                  className="evidence-stack"
                  role="group"
                  aria-label="Termination approval context"
                >
                  <EvidenceItem
                    title="Employment close evidence"
                    body={`${terminationRequest.form.employmentId} (${terminationRequest.form.employmentCode}) closes on ${terminationRequest.form.effectiveDate}. Reason: ${terminationRequest.form.reasonCode}.`}
                  />
                  <EvidenceItem
                    title="Assignment close evidence"
                    body={`${terminationRequest.form.currentAssignmentId} (${terminationRequest.form.currentAssignmentCode}) closes on ${terminationRequest.form.effectiveDate}.`}
                  />
                  <EvidenceItem
                    title="Okta disable projection"
                    body="Synthetic mock-mode disable projection only. No live provider mutation."
                  />
                  <EvidenceItem
                    title="Retention/deletion runtime blocked"
                    body="No hard delete, anonymization, legal hold, or deletion job is introduced."
                  />
                </div>
                <EvidenceItem
                  title="Audit evidence"
                  body={terminationRequest.auditActions.join(", ")}
                />
              </>
            ) : (
              <p className="muted">
                Submitted termination requests appear here for bounded approver
                decisions.
              </p>
            )}
          </>
        ) : null}

        <label className="approval-comment">
          承認コメント
          <textarea
            value={comment}
            placeholder="判断理由を入力（任意）"
            onChange={(event) => setComment(event.target.value)}
          />
        </label>

        {selectedKind === "onboarding" ? (
          <div className="decision-bar">
            <button
              className="button-danger"
              type="button"
              disabled={decisionDisabled}
              onClick={() => onDecision("reject")}
            >
              Reject request
            </button>
            <button
              className="button-secondary"
              type="button"
              disabled={decisionDisabled}
              onClick={() => onDecision("return")}
            >
              Return request
            </button>
            <button
              type="button"
              disabled={decisionDisabled}
              onClick={() => onDecision("approve")}
            >
              Approve request
            </button>
            <button
              className="button-quiet"
              type="button"
              disabled={decisionDisabled}
              onClick={() => onDecision("cancel")}
            >
              Cancel request
            </button>
          </div>
        ) : null}

        {selectedKind === "transfer" ? (
          <div className="decision-bar">
            <button
              className="button-danger"
              type="button"
              disabled={transferDecisionDisabled}
              onClick={() => onTransferDecision("reject")}
            >
              Reject transfer request
            </button>
            <button
              className="button-secondary"
              type="button"
              disabled={transferDecisionDisabled}
              onClick={() => onTransferDecision("return")}
            >
              Return transfer request
            </button>
            <button
              type="button"
              disabled={transferDecisionDisabled}
              onClick={() => onTransferDecision("approve")}
            >
              Approve transfer request
            </button>
            <button
              className="button-quiet"
              type="button"
              disabled={transferDecisionDisabled}
              onClick={() => onTransferDecision("cancel")}
            >
              Cancel transfer request
            </button>
          </div>
        ) : null}

        {selectedKind === "termination" ? (
          <div className="decision-bar">
            <button
              className="button-danger"
              type="button"
              disabled={terminationDecisionDisabled}
              onClick={() => onTerminationDecision("reject")}
            >
              Reject termination request
            </button>
            <button
              className="button-secondary"
              type="button"
              disabled={terminationDecisionDisabled}
              onClick={() => onTerminationDecision("return")}
            >
              Return termination request
            </button>
            <button
              type="button"
              disabled={terminationDecisionDisabled}
              onClick={() => onTerminationDecision("approve")}
            >
              Approve termination request
            </button>
            <button
              className="button-quiet"
              type="button"
              disabled={terminationDecisionDisabled}
              onClick={() => onTerminationDecision("cancel")}
            >
              Cancel termination request
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="skeleton-panel" aria-busy="true" aria-label="Loading">
      <span />
      <span />
      <span />
    </section>
  );
}

function ProcedureFrame({
  procedure,
  children,
}: {
  procedure: "onboarding" | "transfer" | "termination";
  children: ReactNode;
}) {
  const currentStepByProcedure = {
    onboarding: 2,
    transfer: 3,
    termination: 2,
  } as const;
  const currentStep = currentStepByProcedure[procedure];
  const steps = ["対象者", "入力", "影響確認", "承認", "適用"];

  return (
    <div className="procedure-view">
      <div className="procedure-toolbar">
        <ol aria-label="手続き進捗">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const state =
              stepNumber < currentStep
                ? "complete"
                : stepNumber === currentStep
                  ? "current"
                  : "upcoming";
            return (
              <li className={`step-${state}`} key={step}>
                <span aria-hidden="true">
                  {state === "complete" ? <Check size={13} /> : stepNumber}
                </span>
                <strong>{step}</strong>
              </li>
            );
          })}
        </ol>
        <div className="procedure-status">
          <span className="utility-badge">Step {currentStep}/5</span>
          <span className="utility-badge utility-muted">下書き保存済</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function ContractStatus({
  contract,
  error,
  loading,
  onRetry,
}: {
  contract: ApiContract | null;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}) {
  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <section className="contract-strip contract-error" role="status">
        <CircleAlert size={17} aria-hidden="true" />
        <div>
          <strong>API contract unavailable</strong>
          <span>{error}</span>
        </div>
        <button type="button" onClick={onRetry}>
          Retry contract load
        </button>
      </section>
    );
  }

  return (
    <section className="contract-strip contract-ok" role="status">
      <CircleCheck size={17} aria-hidden="true" />
      <strong>API contract connected</strong>
      <span>
        {contract?.info.title ?? "HRCore API"} {contract?.info.version ?? ""}
      </span>
      <small>repository-owned OpenAPI</small>
    </section>
  );
}

function AppShell() {
  const [selectedPersonaId, setSelectedPersonaId] = useState<
    BoundedPersonaId | ""
  >("");
  const [activeRoute, setActiveRoute] = useState<RouteId>("queue");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [directLookup, setDirectLookup] = useState("");
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [contract, setContract] = useState<ApiContract | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const [contractLoading, setContractLoading] = useState(true);
  const [onboardingRequest, setOnboardingRequest] =
    useState<OnboardingRequest | null>(null);
  const [transferRequest, setTransferRequest] =
    useState<TransferRequest | null>(null);
  const [terminationRequest, setTerminationRequest] =
    useState<TerminationRequest | null>(null);
  const [opsDlqEvidence, setOpsDlqEvidence] = useState<OpsDlqEvidence>(
    initialOpsDlqEvidence,
  );

  const personaDecision = useMemo(
    () => resolveBoundedPersona(selectedPersonaId || null),
    [selectedPersonaId],
  );

  const loadContract = useCallback(() => {
    let cancelled = false;

    setContractLoading(true);
    setContractError(null);

    fetchOpenApiContract()
      .then((nextContract) => {
        if (!cancelled) {
          setContract(nextContract);
          setContractError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setContractError(
            error instanceof ApiClientError || error instanceof Error
              ? error.message
              : "The OpenAPI contract could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setContractLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!personaDecision.allowed) {
      return;
    }

    return loadContract();
  }, [loadContract, personaDecision.allowed]);

  const visibleAreas = personaDecision.persona
    ? plannedAreas.filter((area) =>
        personaDecision.persona?.allowedRoutes.includes(area.id),
      )
    : [];
  const activeArea =
    visibleAreas.find((area) => area.id === activeRoute) ?? visibleAreas[0];

  const decideOnboardingRequest = useCallback(
    (decision: OnboardingDecision) => {
      if (
        !onboardingRequest ||
        onboardingRequest.status !== "submitted" ||
        personaDecision.persona?.role !== "bounded_approver" ||
        !selectedPersonaId ||
        onboardingRequest.submittedByActorId === selectedPersonaId
      ) {
        return;
      }

      setOnboardingRequest({
        ...onboardingRequest,
        status: getNextStatus(decision),
        decidedByActorId: selectedPersonaId,
        auditActions: [
          ...onboardingRequest.auditActions,
          `mvp_a.onboarding.${decision} decidedBy=${selectedPersonaId}`,
        ],
      });
    },
    [onboardingRequest, personaDecision.persona?.role, selectedPersonaId],
  );

  const decideTransferRequest = useCallback(
    (decision: PracticalWorkflowDecision) => {
      if (
        !transferRequest ||
        transferRequest.status !== "submitted" ||
        personaDecision.persona?.role !== "bounded_approver" ||
        !selectedPersonaId ||
        transferRequest.submittedByActorId === selectedPersonaId
      ) {
        return;
      }

      setTransferRequest({
        ...transferRequest,
        status: getNextStatus(decision),
        decidedByActorId: selectedPersonaId,
        auditActions: [
          ...transferRequest.auditActions,
          `mvp_b.transfer.${decision} decidedBy=${selectedPersonaId}`,
        ],
      });
    },
    [personaDecision.persona?.role, selectedPersonaId, transferRequest],
  );

  const decideTerminationRequest = useCallback(
    (decision: PracticalWorkflowDecision) => {
      if (
        !terminationRequest ||
        terminationRequest.status !== "submitted" ||
        personaDecision.persona?.role !== "bounded_approver" ||
        !selectedPersonaId ||
        terminationRequest.submittedByActorId === selectedPersonaId
      ) {
        return;
      }

      setTerminationRequest({
        ...terminationRequest,
        status: getNextStatus(decision),
        decidedByActorId: selectedPersonaId,
        auditActions: [
          ...terminationRequest.auditActions,
          `mvp_c.termination.${decision} decidedBy=${selectedPersonaId}`,
        ],
      });
    },
    [personaDecision.persona?.role, selectedPersonaId, terminationRequest],
  );

  useEffect(() => {
    if (
      visibleAreas.length > 0 &&
      !visibleAreas.some((area) => area.id === activeRoute)
    ) {
      setActiveRoute(visibleAreas[0].id);
    }
  }, [activeRoute, visibleAreas]);

  const canNavigateTo = (route: RouteId) =>
    visibleAreas.some((area) => area.id === route);

  const navigateTo = (route: RouteId) => {
    if (canNavigateTo(route)) {
      setActiveRoute(route);
      setMobileNavOpen(false);
    }
  };

  const submitDirectLookup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = directLookup.trim().toUpperCase();

    if (
      normalized === "EMP-000128" &&
      visibleAreas.some((area) => area.id === "employee")
    ) {
      setActiveRoute("employee");
      setLookupMessage("EMP-000128 を bounded fixture から表示しました。");
      return;
    }

    setLookupMessage(
      "許可済みfixtureを特定できません。利用可能なID: EMP-000128",
    );
  };

  const displayArea = activeArea ?? plannedAreas[0];

  const renderActiveWorkspace = () => {
    if (activeArea?.id === "queue") {
      return (
        <DashboardView
          onboardingRequest={onboardingRequest}
          transferRequest={transferRequest}
          terminationRequest={terminationRequest}
          opsDlqEvidence={opsDlqEvidence}
          onNavigate={navigateTo}
          canNavigate={canNavigateTo}
        />
      );
    }

    if (activeArea?.id === "employee") {
      return (
        <EmployeeDetailView
          onOpenTransfer={
            canNavigateTo("transfer") ? () => navigateTo("transfer") : null
          }
        />
      );
    }

    if (activeArea?.id === "onboarding") {
      return (
        <ProcedureFrame procedure="onboarding">
          <OnboardingWorkflow
            personaId={selectedPersonaId}
            personaRole={personaDecision.persona?.role}
            request={onboardingRequest}
            setRequest={setOnboardingRequest}
          />
        </ProcedureFrame>
      );
    }

    if (activeArea?.id === "transfer") {
      return (
        <ProcedureFrame procedure="transfer">
          <TransferWorkflow
            personaId={selectedPersonaId}
            personaRole={personaDecision.persona?.role}
            request={transferRequest}
            setRequest={setTransferRequest}
          />
        </ProcedureFrame>
      );
    }

    if (activeArea?.id === "termination") {
      return (
        <ProcedureFrame procedure="termination">
          <TerminationWorkflow
            personaId={selectedPersonaId}
            personaRole={personaDecision.persona?.role}
            request={terminationRequest}
            setRequest={setTerminationRequest}
          />
        </ProcedureFrame>
      );
    }

    if (activeArea?.id === "csv" && personaDecision.persona) {
      return (
        <CsvWorkflow
          actorId={personaDecision.persona.id}
          evidence={csvWorkflowEvidence}
        />
      );
    }

    if (activeArea?.id === "ops" && personaDecision.persona) {
      return (
        <OpsDlqWorkflow
          evidence={opsDlqEvidence}
          operatorActorId={personaDecision.persona.id}
          setEvidence={setOpsDlqEvidence}
        />
      );
    }

    if (activeArea?.id === "approvals") {
      return (
        <ApprovalsWorkflow
          approverActorId={
            personaDecision.persona?.role === "bounded_approver"
              ? selectedPersonaId || null
              : null
          }
          request={onboardingRequest}
          transferRequest={transferRequest}
          terminationRequest={terminationRequest}
          onDecision={decideOnboardingRequest}
          onTransferDecision={decideTransferRequest}
          onTerminationDecision={decideTerminationRequest}
        />
      );
    }

    if (activeArea?.id === "audit") {
      return <AuditWorkflow />;
    }

    if (activeArea?.id === "support" || activeArea?.id === "admin") {
      return <SecondaryAreaView area={activeArea} />;
    }

    return <EmptyState />;
  };

  return (
    <div className="app-root">
      <div className="environment-banner" role="note">
        <LockKeyhole size={14} aria-hidden="true" />
        <span>非本番 / repository-owned synthetic evidence only</span>
        <strong>Production authorization blocked</strong>
      </div>

      <button
        className="mobile-nav-toggle icon-button"
        type="button"
        title={
          mobileNavOpen ? "ナビゲーションを閉じる" : "ナビゲーションを開く"
        }
        aria-label={
          mobileNavOpen ? "ナビゲーションを閉じる" : "ナビゲーションを開く"
        }
        aria-expanded={mobileNavOpen}
        onClick={() => setMobileNavOpen((open) => !open)}
      >
        {mobileNavOpen ? (
          <X size={20} aria-hidden="true" />
        ) : (
          <Menu size={20} aria-hidden="true" />
        )}
      </button>

      <div className="app-frame">
        <aside className={mobileNavOpen ? "sidebar sidebar-open" : "sidebar"}>
          <div className="brand-block">
            <span className="brand-mark" aria-hidden="true">
              H
            </span>
            <div>
              <p className="brand-name">HRCore</p>
              <p className="brand-context">Human Resource Platform</p>
            </div>
          </div>

          <nav role="navigation" aria-label="Planned practical-use areas">
            {visibleAreas.length === 0 ? (
              <p className="nav-empty">
                Routes stay blocked until persona passes.
              </p>
            ) : (
              visibleAreas.map((area) => {
                const Icon = area.icon;
                return (
                  <button
                    className={
                      area.id === activeArea?.id
                        ? "nav-item active"
                        : "nav-item"
                    }
                    key={area.id}
                    aria-pressed={area.id === activeArea?.id}
                    type="button"
                    onClick={() => navigateTo(area.id)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>
                      <strong>{area.title}</strong>
                      <small>{area.label}</small>
                    </span>
                  </button>
                );
              })
            )}
          </nav>

          <div className="sidebar-footer">
            <label className="field-label" htmlFor="persona-switcher">
              Persona
            </label>
            <select
              id="persona-switcher"
              value={selectedPersonaId}
              onChange={(event) => {
                setSelectedPersonaId(
                  event.target.value as BoundedPersonaId | "",
                );
                setLookupMessage(null);
              }}
            >
              <option value="">Select bounded persona</option>
              {boundedPersonas.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.label}
                </option>
              ))}
            </select>
            <div className="provider-chip">
              <span>主系 provider</span>
              <strong>Okta</strong>
            </div>
          </div>
        </aside>

        <main className="content">
          <header className="topbar">
            <div className="page-heading">
              <p className="context-label">{displayArea.eyebrow}</p>
              <h1 aria-label={displayArea.label}>{displayArea.title}</h1>
              <p>{displayArea.summary}</p>
            </div>
            <div className="topbar-tools">
              {personaDecision.allowed ? (
                <form className="direct-lookup" onSubmit={submitDirectLookup}>
                  <Search size={17} aria-hidden="true" />
                  <label className="sr-only" htmlFor="direct-record-lookup">
                    Bounded record ID
                  </label>
                  <input
                    id="direct-record-lookup"
                    value={directLookup}
                    placeholder="IDで直接参照"
                    onChange={(event) => setDirectLookup(event.target.value)}
                  />
                  <button type="submit">参照</button>
                </form>
              ) : null}
              <span className="utility-badge">Okta primary</span>
              <span className="utility-badge">Tokyo</span>
              <span className="utility-badge utility-muted">非本番</span>
            </div>
          </header>

          {lookupMessage ? (
            <p className="lookup-message" role="status">
              {lookupMessage}
            </p>
          ) : null}

          {!personaDecision.allowed ? (
            <section className="blocked-state" role="alert">
              <span className="blocked-icon" aria-hidden="true">
                <LockKeyhole size={24} />
              </span>
              <p className="context-label">Bounded access required</p>
              <h2>Fail-closed persona guard</h2>
              <p>{personaDecision.reason}</p>
              <p className="muted">
                左下の Persona から repository-owned non-production role
                を選択してください。
              </p>
            </section>
          ) : (
            <>
              <ContractStatus
                contract={contract}
                error={contractError}
                loading={contractLoading}
                onRetry={loadContract}
              />
              <section className="workspace" aria-label={displayArea.label}>
                {renderActiveWorkspace()}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
