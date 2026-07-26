import { type ChangeEvent, useEffect, useState } from "react";
import { type BoundedPersonaId } from "../persona";
import {
  type OnboardingFormState,
  type OnboardingRequest,
  type TerminationFormState,
  type TerminationRequest,
  type TransferFormState,
  type TransferRequest,
  blocksDuplicateOnboardingRequest,
  blocksDuplicateRequest,
  defaultOnboardingForm,
  defaultTerminationForm,
  defaultTransferForm,
  formatStatus,
  getApplyStatus,
  getMissingOnboardingFields,
  hasWritebackEvidence,
  isAllowedTerminationReasonCode,
  isAllowedTransferReasonCode,
  isBeforeRequestedDate,
  isStartBeforeRequestedDate,
  isValidWorkEmail,
  maskEmail,
  normalizeTerminationForm,
  normalizeTransferForm,
  onboardingRequestTemplate,
  terminationRequestTemplate,
  transferRequestTemplate,
} from "./model";
import { EvidenceItem } from "./shared";

export function OnboardingWorkflow({
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

export function TransferWorkflow({
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

export function TerminationWorkflow({
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
