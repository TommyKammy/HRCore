import { useCallback, useEffect, useMemo, useState } from "react";

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
              <EmptyState />
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
