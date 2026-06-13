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

const defaultOnboardingForm: OnboardingFormState = {
  displayName: "Synthetic Onboarding Hire",
  employmentCode: "EMP-ONBOARDING-001",
  startDate: "2026-06-01",
  departmentReference: "department-people-ops",
  managerReference: "manager-001",
  workEmail: "onboarding.hire.001@example.invalid",
};

const onboardingRequestTemplate = {
  id: "transaction-request-onboarding-001",
  personId: "person-onboarding-001",
  correlationId: "correlation-onboarding-001",
  requestedAt: "2026-05-21T00:00:00Z",
} as const;

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
    summary: "Direct correlation lookup with no broad search.",
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

function formatStatus(status: OnboardingStatus): string {
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

function EvidenceItem({ title, body }: { title: string; body: string }) {
  return (
    <article className="evidence-item">
      <h4>{title}</h4>
      <p>{body}</p>
    </article>
  );
}

function ApprovalsWorkflow({
  approverActorId,
  request,
  onDecision,
}: {
  approverActorId: BoundedPersonaId | null;
  request: OnboardingRequest | null;
  onDecision: (decision: OnboardingDecision) => void;
}) {
  const decisionDisabled = !approverActorId || request?.status !== "submitted";

  return (
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

      const nextStatusByDecision: Record<OnboardingDecision, OnboardingStatus> =
        {
          approve: "approved",
          return: "returned",
          reject: "rejected",
          cancel: "cancelled",
        };

      setOnboardingRequest({
        ...onboardingRequest,
        status: nextStatusByDecision[decision],
        decidedByActorId: selectedPersonaId,
        auditActions: [
          ...onboardingRequest.auditActions,
          `mvp_a.onboarding.${decision} decidedBy=${selectedPersonaId}`,
        ],
      });
    },
    [onboardingRequest, personaDecision.persona?.role, selectedPersonaId],
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
              ) : activeArea?.id === "approvals" ? (
                <ApprovalsWorkflow
                  approverActorId={
                    personaDecision.persona?.role === "bounded_approver"
                      ? selectedPersonaId || null
                      : null
                  }
                  request={onboardingRequest}
                  onDecision={decideOnboardingRequest}
                />
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
