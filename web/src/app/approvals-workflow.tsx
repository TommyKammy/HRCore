import { useState } from "react";
import { Check } from "lucide-react";
import { boundedPersonas, type BoundedPersonaId } from "../persona";
import {
  type ApprovalKind,
  type OnboardingDecision,
  type OnboardingRequest,
  type PracticalWorkflowDecision,
  type PracticalWorkflowStatus,
  type TerminationRequest,
  type TransferRequest,
  formatRequestedAt,
  formatStatus,
  getApprovalStatusPresentation,
  getPreferredApprovalKind,
} from "./model";
import { EvidenceItem } from "./shared";

export function ApprovalsWorkflow({
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
  onDecision: (decision: OnboardingDecision, comment: string) => void;
  onTransferDecision: (
    decision: PracticalWorkflowDecision,
    comment: string,
  ) => void;
  onTerminationDecision: (
    decision: PracticalWorkflowDecision,
    comment: string,
  ) => void;
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
    request: OnboardingRequest | TransferRequest | TerminationRequest | null;
  }> = [
    {
      kind: "onboarding",
      title: "入社",
      subject: request?.form.displayName ?? "田中 美咲",
      effectiveDate: request?.form.startDate ?? "2026/05/01",
      priority: "低",
      status: request?.status ?? "empty",
      request,
    },
    {
      kind: "transfer",
      title: "異動",
      subject: transferRequest?.form.displayName ?? "山田 太郎",
      effectiveDate: transferRequest?.form.effectiveDate ?? "2026/05/01",
      priority: "高",
      status: transferRequest?.status ?? "empty",
      request: transferRequest,
    },
    {
      kind: "termination",
      title: "退職",
      subject: terminationRequest?.form.displayName ?? "鈴木 一郎",
      effectiveDate: terminationRequest?.form.effectiveDate ?? "2026/04/26",
      priority: "中",
      status: terminationRequest?.status ?? "empty",
      request: terminationRequest,
    },
  ];

  const selectedItem =
    approvalItems.find((item) => item.kind === selectedKind) ??
    approvalItems[0];
  const selectedStatus = getApprovalStatusPresentation(selectedItem.status);
  const pendingApprovalCount = approvalItems.filter(
    (item) => item.status === "submitted",
  ).length;
  const selectedSubmitter = selectedItem.request
    ? (boundedPersonas.find(
        (persona) => persona.id === selectedItem.request?.submittedByActorId,
      )?.label ?? selectedItem.request.submittedByActorId)
    : "-";
  const selectedSubmittedAt = selectedItem.request
    ? formatRequestedAt(selectedItem.request.requestedAt)
    : "-";
  const submitDecision = (
    handler: (decision: PracticalWorkflowDecision, comment: string) => void,
    decision: PracticalWorkflowDecision,
  ) => {
    handler(decision, comment);
    setComment("");
  };

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
          <span
            className="queue-count"
            aria-label={`${pendingApprovalCount}件の承認待ち`}
          >
            {pendingApprovalCount}
          </span>
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
              onClick={() => {
                setSelectedKind(item.kind);
                setComment("");
              }}
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
            <p>
              起票者: {selectedSubmitter} / 提出: {selectedSubmittedAt}
            </p>
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
            maxLength={500}
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
              onClick={() => submitDecision(onDecision, "reject")}
            >
              Reject request
            </button>
            <button
              className="button-secondary"
              type="button"
              disabled={decisionDisabled}
              onClick={() => submitDecision(onDecision, "return")}
            >
              Return request
            </button>
            <button
              type="button"
              disabled={decisionDisabled}
              onClick={() => submitDecision(onDecision, "approve")}
            >
              Approve request
            </button>
            <button
              className="button-quiet"
              type="button"
              disabled={decisionDisabled}
              onClick={() => submitDecision(onDecision, "cancel")}
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
              onClick={() => submitDecision(onTransferDecision, "reject")}
            >
              Reject transfer request
            </button>
            <button
              className="button-secondary"
              type="button"
              disabled={transferDecisionDisabled}
              onClick={() => submitDecision(onTransferDecision, "return")}
            >
              Return transfer request
            </button>
            <button
              type="button"
              disabled={transferDecisionDisabled}
              onClick={() => submitDecision(onTransferDecision, "approve")}
            >
              Approve transfer request
            </button>
            <button
              className="button-quiet"
              type="button"
              disabled={transferDecisionDisabled}
              onClick={() => submitDecision(onTransferDecision, "cancel")}
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
              onClick={() => submitDecision(onTerminationDecision, "reject")}
            >
              Reject termination request
            </button>
            <button
              className="button-secondary"
              type="button"
              disabled={terminationDecisionDisabled}
              onClick={() => submitDecision(onTerminationDecision, "return")}
            >
              Return termination request
            </button>
            <button
              type="button"
              disabled={terminationDecisionDisabled}
              onClick={() => submitDecision(onTerminationDecision, "approve")}
            >
              Approve termination request
            </button>
            <button
              className="button-quiet"
              type="button"
              disabled={terminationDecisionDisabled}
              onClick={() => submitDecision(onTerminationDecision, "cancel")}
            >
              Cancel termination request
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
