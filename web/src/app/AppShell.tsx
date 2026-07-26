import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { LockKeyhole, Menu, Search, X } from "lucide-react";
import {
  type ApiContract,
  ApiClientError,
  fetchOpenApiContract,
} from "../api-client";
import { ErrorBoundary } from "../ErrorBoundary";
import {
  boundedPersonas,
  resolveBoundedPersona,
  type BoundedPersonaId,
} from "../persona";
import { ApprovalsWorkflow } from "./approvals-workflow";
import {
  OnboardingWorkflow,
  TerminationWorkflow,
  TransferWorkflow,
} from "./lifecycle-workflows";
import {
  type OnboardingDecision,
  type OnboardingRequest,
  type OpsDlqEvidence,
  type PracticalWorkflowDecision,
  type RouteId,
  type TerminationRequest,
  type TransferRequest,
  csvWorkflowEvidence,
  formatDecisionAuditAction,
  getNextStatus,
  initialOpsDlqEvidence,
  plannedAreas,
} from "./model";
import { CsvWorkflow, OpsDlqWorkflow } from "./operations-workflows";
import {
  AuditWorkflow,
  DashboardView,
  EmployeeDetailView,
  SecondaryAreaView,
} from "./screens";
import { ContractStatus, EmptyState, ProcedureFrame } from "./shared";

export function AppShell() {
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
    (decision: OnboardingDecision, comment: string) => {
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
          formatDecisionAuditAction(
            "mvp_a.onboarding",
            decision,
            selectedPersonaId,
            comment,
          ),
        ],
      });
    },
    [onboardingRequest, personaDecision.persona?.role, selectedPersonaId],
  );

  const decideTransferRequest = useCallback(
    (decision: PracticalWorkflowDecision, comment: string) => {
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
          formatDecisionAuditAction(
            "mvp_b.transfer",
            decision,
            selectedPersonaId,
            comment,
          ),
        ],
      });
    },
    [personaDecision.persona?.role, selectedPersonaId, transferRequest],
  );

  const decideTerminationRequest = useCallback(
    (decision: PracticalWorkflowDecision, comment: string) => {
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
          formatDecisionAuditAction(
            "mvp_c.termination",
            decision,
            selectedPersonaId,
            comment,
          ),
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

    if (!canNavigateTo("employee")) {
      setLookupMessage("このpersonaでは従業員fixtureを参照できません。");
      return;
    }

    const normalized = directLookup.trim().toUpperCase();

    if (normalized === "EMP-000128") {
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
        <ProcedureFrame
          procedure="onboarding"
          requestStatus={onboardingRequest?.status ?? null}
        >
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
        <ProcedureFrame
          procedure="transfer"
          requestStatus={transferRequest?.status ?? null}
        >
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
        <ProcedureFrame
          procedure="termination"
          requestStatus={terminationRequest?.status ?? null}
        >
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
              {canNavigateTo("employee") ? (
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
