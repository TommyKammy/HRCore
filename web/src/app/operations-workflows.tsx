import { useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarClock,
  CircleAlert,
  ClipboardList,
} from "lucide-react";
import { type BoundedPersonaId } from "../persona";
import {
  type CsvWorkflowEvidence,
  type DlqDecision,
  type OpsDlqEvidence,
  dlqFailureDecisionActionPrefix,
  formatStatus,
  lifecycleSupportEvidenceVersion,
  maxOpsDlqRetries,
  terminalOpsDlqStatuses,
} from "./model";
import { EvidenceItem, SummaryCard } from "./shared";

export function CsvWorkflow({
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

export function OpsDlqWorkflow({
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
