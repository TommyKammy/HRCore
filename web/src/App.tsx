import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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
  status: "available" | "planned";
  summary: string;
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
const dlqFailureDecisionActionPrefix =
  "mvp_d.ops_job.failure_decision.csv_import";

const initialOpsDlqEvidence: OpsDlqEvidence = {
  jobId: "local-ops-job-csv-import-001",
  failedRowId: "csv-row-trace-rejected-001",
  correlationId: "csv-correlation-synthetic-001",
  status: "open",
  retryCount: 1,
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
    status: "available",
    summary:
      "Synthetic drafts, submitted requests, and review tasks start here.",
  },
  {
    id: "onboarding",
    label: "Onboarding",
    status: "available",
    summary: "Bounded MVP-A new-hire request preparation and validation.",
  },
  {
    id: "transfer",
    label: "Transfer",
    status: "available",
    summary: "Bounded MVP-B assignment-change request preparation.",
  },
  {
    id: "termination",
    label: "Termination",
    status: "available",
    summary: "Bounded MVP-C termination request preparation.",
  },
  {
    id: "csv",
    label: "CSV dry-run",
    status: "planned",
    summary: "Dry-run row diffs and denied export evidence remain synthetic.",
  },
  {
    id: "approvals",
    label: "Approvals",
    status: "planned",
    summary: "Decision inbox for approved bounded personas only.",
  },
  {
    id: "ops",
    label: "Ops/DLQ",
    status: "planned",
    summary: "Local job status and reasoned failed-row decisions.",
  },
  {
    id: "audit",
    label: "Audit",
    status: "planned",
    summary: "Single-correlation evidence review with no broad search.",
  },
  {
    id: "support",
    label: "Support review",
    status: "planned",
    summary: "Reasoned support notes anchored to one bounded subject.",
  },
  {
    id: "admin",
    label: "Admin",
    status: "planned",
    summary: "Non-production UI labels and route visibility only.",
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
            <dd>mvp_d_lifecycle_support_v1</dd>
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

  const submitDecision = (selectedDecision: DlqDecision) => {
    const submittedReason = reason.trim();

    if (terminalOpsDlqStatuses.includes(evidence.status)) {
      setMessageKind("error");
      setMessage(
        `DLQ decision rejected because ${evidence.failedRowId} is ${formatStatus(
          evidence.status,
        )}; terminal decisions cannot be overwritten.`,
      );
      return;
    }

    if (
      selectedDecision === "retry" &&
      evidence.retryCount >= maxOpsDlqRetries
    ) {
      setMessageKind("error");
      setMessage(
        `DLQ decision rejected because ${evidence.failedRowId} already reached ${maxOpsDlqRetries}/${maxOpsDlqRetries} retries.`,
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

    setEvidence({
      ...evidence,
      status: nextStatusByDecision[selectedDecision],
      retryCount:
        selectedDecision === "retry"
          ? Math.min(evidence.retryCount + 1, 3)
          : evidence.retryCount,
      lastDecision: selectedDecision,
      decisionReason: submittedReason,
      auditActions: [
        ...evidence.auditActions,
        `${dlqFailureDecisionActionPrefix}.${selectedDecision} reason=${submittedReason} decidedBy=${operatorActorId}`,
      ],
    });
    setMessageKind("ok");
    setMessage("DLQ decision recorded with bounded audit evidence.");
  };

  return (
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
            <dd>{evidence.retryCount}/3</dd>
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
  );
}

function AuditWorkflow() {
  return (
    <section className="workflow-panel" aria-labelledby="audit-lookup">
      <div>
        <p className="context-label">Single correlation boundary</p>
        <h3 id="audit-lookup">Direct correlation lookup</h3>
      </div>
      <EvidenceItem
        title="Lookup boundary"
        body="Operators can inspect one explicit synthetic correlation at a time. Broad search, raw payload export, production authorization, and immutable production audit claims remain blocked."
      />
    </section>
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
  const decisionDisabled = !approverActorId || request?.status !== "submitted";
  const transferDecisionDisabled =
    !approverActorId || transferRequest?.status !== "submitted";
  const terminationDecisionDisabled =
    !approverActorId || terminationRequest?.status !== "submitted";

  return (
    <div className="workflow-grid stacked">
      <section className="workflow-panel" aria-labelledby="approval-workflow">
        <div>
          <p className="context-label">Bounded approver actions</p>
          <h3 id="approval-workflow">
            {request?.id ?? "No submitted onboarding request"}
          </h3>
        </div>
        {request ? (
          <>
            <p>
              {request.form.displayName} is {formatStatus(request.status)} for{" "}
              {request.correlationId}.
            </p>
            <div className="decision-bar">
              <button
                type="button"
                disabled={decisionDisabled}
                onClick={() => onDecision("approve")}
              >
                Approve request
              </button>
              <button
                type="button"
                disabled={decisionDisabled}
                onClick={() => onDecision("return")}
              >
                Return request
              </button>
              <button
                type="button"
                disabled={decisionDisabled}
                onClick={() => onDecision("reject")}
              >
                Reject request
              </button>
              <button
                type="button"
                disabled={decisionDisabled}
                onClick={() => onDecision("cancel")}
              >
                Cancel request
              </button>
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
      </section>

      <section className="workflow-panel" aria-labelledby="transfer-approval">
        <div>
          <p className="context-label">Bounded approver actions</p>
          <h3 id="transfer-approval">Transfer approvals</h3>
        </div>
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
            <div className="decision-bar">
              <button
                type="button"
                disabled={transferDecisionDisabled}
                onClick={() => onTransferDecision("approve")}
              >
                Approve transfer request
              </button>
              <button
                type="button"
                disabled={transferDecisionDisabled}
                onClick={() => onTransferDecision("return")}
              >
                Return transfer request
              </button>
              <button
                type="button"
                disabled={transferDecisionDisabled}
                onClick={() => onTransferDecision("reject")}
              >
                Reject transfer request
              </button>
              <button
                type="button"
                disabled={transferDecisionDisabled}
                onClick={() => onTransferDecision("cancel")}
              >
                Cancel transfer request
              </button>
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
      </section>

      <section
        className="workflow-panel"
        aria-labelledby="termination-approval"
      >
        <div>
          <p className="context-label">Bounded approver actions</p>
          <h3 id="termination-approval">Termination approvals</h3>
        </div>
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
            <div className="decision-bar">
              <button
                type="button"
                disabled={terminationDecisionDisabled}
                onClick={() => onTerminationDecision("approve")}
              >
                Approve termination request
              </button>
              <button
                type="button"
                disabled={terminationDecisionDisabled}
                onClick={() => onTerminationDecision("return")}
              >
                Return termination request
              </button>
              <button
                type="button"
                disabled={terminationDecisionDisabled}
                onClick={() => onTerminationDecision("reject")}
              >
                Reject termination request
              </button>
              <button
                type="button"
                disabled={terminationDecisionDisabled}
                onClick={() => onTerminationDecision("cancel")}
              >
                Cancel termination request
              </button>
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
      <section className="notice notice-error" role="status">
        <h2>API contract unavailable</h2>
        <p>{error}</p>
        <button type="button" onClick={onRetry}>
          Retry contract load
        </button>
      </section>
    );
  }

  return (
    <section className="notice notice-ok" role="status">
      <h2>API contract connected</h2>
      <p>
        {contract?.info.title ?? "HRCore API"} {contract?.info.version ?? ""}
        is loaded from the repository-owned OpenAPI endpoint.
      </p>
    </section>
  );
}

function AppShell() {
  const [selectedPersonaId, setSelectedPersonaId] = useState<
    BoundedPersonaId | ""
  >("");
  const [activeRoute, setActiveRoute] = useState<RouteId>("queue");
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

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <div>
            <p className="brand-name">HRCore</p>
            <p className="brand-context">Bounded WebUI shell</p>
          </div>
        </div>

        <label className="field-label" htmlFor="persona-switcher">
          Persona
        </label>
        <select
          id="persona-switcher"
          value={selectedPersonaId}
          onChange={(event) =>
            setSelectedPersonaId(event.target.value as BoundedPersonaId | "")
          }
        >
          <option value="">Select bounded persona</option>
          {boundedPersonas.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.label}
            </option>
          ))}
        </select>

        <nav role="navigation" aria-label="Planned practical-use areas">
          {visibleAreas.length === 0 ? (
            <p className="nav-empty">
              Routes stay blocked until persona passes.
            </p>
          ) : (
            visibleAreas.map((area) => (
              <button
                className={
                  area.id === activeArea?.id ? "nav-item active" : "nav-item"
                }
                key={area.id}
                aria-pressed={area.id === activeArea?.id}
                type="button"
                onClick={() => setActiveRoute(area.id)}
              >
                <span>{area.label}</span>
                <small>{area.status}</small>
              </button>
            ))
          )}
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="context-label">Non-production evidence only</p>
            <h1>Practical-use foundation</h1>
          </div>
          <span className="status-pill">Production auth blocked</span>
        </header>

        {!personaDecision.allowed ? (
          <section className="notice notice-blocked" role="alert">
            <h2>Fail-closed persona guard</h2>
            <p>{personaDecision.reason}</p>
          </section>
        ) : (
          <>
            <ContractStatus
              contract={contract}
              error={contractError}
              loading={contractLoading}
              onRetry={loadContract}
            />
            <section className="workspace" aria-labelledby="workspace-title">
              <div>
                <p className="context-label">
                  {personaDecision.persona?.label}
                </p>
                <h2 id="workspace-title">
                  {activeArea?.label ?? "Bounded workspace"}
                </h2>
                <p>{activeArea?.summary}</p>
              </div>
              {activeArea?.id === "onboarding" ? (
                <OnboardingWorkflow
                  personaId={selectedPersonaId}
                  personaRole={personaDecision.persona?.role}
                  request={onboardingRequest}
                  setRequest={setOnboardingRequest}
                />
              ) : activeArea?.id === "transfer" ? (
                <TransferWorkflow
                  personaId={selectedPersonaId}
                  personaRole={personaDecision.persona?.role}
                  request={transferRequest}
                  setRequest={setTransferRequest}
                />
              ) : activeArea?.id === "termination" ? (
                <TerminationWorkflow
                  personaId={selectedPersonaId}
                  personaRole={personaDecision.persona?.role}
                  request={terminationRequest}
                  setRequest={setTerminationRequest}
                />
              ) : activeArea?.id === "csv" ? (
                personaDecision.persona ? (
                  <CsvWorkflow
                    actorId={personaDecision.persona.id}
                    evidence={csvWorkflowEvidence}
                  />
                ) : (
                  <EmptyState />
                )
              ) : activeArea?.id === "ops" ? (
                personaDecision.persona ? (
                  <OpsDlqWorkflow
                    evidence={opsDlqEvidence}
                    operatorActorId={personaDecision.persona.id}
                    setEvidence={setOpsDlqEvidence}
                  />
                ) : (
                  <EmptyState />
                )
              ) : activeArea?.id === "approvals" ? (
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
              ) : activeArea?.id === "audit" ? (
                <AuditWorkflow />
              ) : (
                <EmptyState />
              )}
            </section>
          </>
        )}
      </main>
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
