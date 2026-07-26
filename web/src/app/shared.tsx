import { type ReactNode } from "react";
import { Check, CircleAlert, CircleCheck, type LucideIcon } from "lucide-react";
import { type ApiContract } from "../api-client";
import {
  type PracticalWorkflowStatus,
  type ProcedureKind,
  getProcedureProgress,
} from "./model";

export function EmptyState() {
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

export function EvidenceItem({ title, body }: { title: string; body: string }) {
  return (
    <article className="evidence-item">
      <h4>{title}</h4>
      <p>{body}</p>
    </article>
  );
}

export function SummaryCard({
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

export function LoadingState() {
  return (
    <section className="skeleton-panel" aria-busy="true" aria-label="Loading">
      <span />
      <span />
      <span />
    </section>
  );
}

export function ProcedureFrame({
  procedure,
  requestStatus,
  children,
}: {
  procedure: ProcedureKind;
  requestStatus: PracticalWorkflowStatus | null;
  children: ReactNode;
}) {
  const { currentStep, statusLabel } = getProcedureProgress(
    procedure,
    requestStatus,
  );
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
          <span className="utility-badge utility-muted">{statusLabel}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

export function ContractStatus({
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
