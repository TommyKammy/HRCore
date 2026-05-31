export function renderTransferWizard(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>HRCore MVP-B Transfer</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f7f9;
        color: #17202a;
      }
      body {
        margin: 0;
        min-height: 100vh;
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      h1 {
        margin: 0 0 24px;
        font-size: 28px;
        line-height: 1.2;
        letter-spacing: 0;
      }
      form {
        display: grid;
        gap: 18px;
      }
      fieldset {
        border: 1px solid #d9dee7;
        border-radius: 8px;
        padding: 18px;
        background: #ffffff;
      }
      legend {
        padding: 0 6px;
        font-weight: 700;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
      }
      label {
        display: grid;
        gap: 6px;
        font-size: 13px;
        font-weight: 650;
      }
      input, select {
        min-height: 38px;
        border: 1px solid #b8c1ce;
        border-radius: 6px;
        padding: 0 10px;
        font: inherit;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      button {
        min-height: 38px;
        border: 1px solid #1e5b8f;
        border-radius: 6px;
        padding: 0 14px;
        background: #1e5b8f;
        color: #ffffff;
        font: inherit;
        font-weight: 700;
      }
      button.secondary {
        background: #ffffff;
        color: #1e5b8f;
      }
      output {
        display: block;
        min-height: 24px;
        color: #6b2a1f;
        font-weight: 650;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>MVP-B Assignment Transfer</h1>
      <form id="mvp-b-transfer-wizard" action="/transfers/assignment-change/transaction-requests" method="post">
        <fieldset>
          <legend>Request</legend>
          <div class="grid">
            <label>Request ID<input name="id" value="transaction-request-transfer-001" required></label>
            <label>Correlation ID<input name="correlationId" value="correlation-transfer-001" required></label>
            <label>Requested At<input name="requestedAt" value="2026-06-15T00:00:00Z" required></label>
            <label>Status<input name="statusCode" value="draft" required></label>
            <label>Tenant Environment<input name="payload.tenantEnvironmentId" value="repo_owned_synthetic_mvp_b_transfer" readonly required></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Person</legend>
          <div class="grid">
            <label>Person ID<input name="person.id" value="person-transfer-001" required></label>
            <label>Display Name<input name="person.displayName" value="MVP-B Transfer One" required></label>
            <label>Created At<input name="person.createdAt" value="2026-06-15T00:00:00Z" required></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Current Assignment</legend>
          <div class="grid">
            <label>Effective Date<input name="payload.effectiveDate" value="2026-07-01" required></label>
            <label>Assignment ID<input name="payload.currentAssignment.assignmentId" value="assignment-current-transfer-001" required></label>
            <label>Assignment Code<input name="payload.currentAssignment.assignmentCode" value="ASN-CURRENT-TRANSFER-001" required></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Target Assignment</legend>
          <div class="grid">
            <label>Organization Reference<input name="payload.targetAssignment.organizationReference" value="organization-engineering" required></label>
            <label>Department Reference<input name="payload.targetAssignment.departmentReference" value="department-product" required></label>
            <label>Manager Reference<input name="payload.targetAssignment.managerReference" value="manager-product-001" required></label>
            <label>Position Code<input name="payload.targetAssignment.positionCode" value="position-staff-engineer-001"></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Reason</legend>
          <div class="grid">
            <label>Reason Code
              <select name="payload.transferReason.reasonCode" required>
                <option value="team_change">team_change</option>
                <option value="manager_change">manager_change</option>
                <option value="organization_change">organization_change</option>
              </select>
            </label>
            <label>Note<input name="payload.transferReason.note" value="Synthetic bounded MVP-B transfer request"></label>
          </div>
        </fieldset>
        <div class="actions">
          <button type="button" class="secondary" data-action="validate">Validate</button>
          <button type="button" class="secondary" data-action="draft">Save Draft</button>
          <button type="button" data-action="submitted">Submit</button>
        </div>
        <output id="mvp-b-transfer-status" role="status"></output>
      </form>
      <script>
        const form = document.getElementById("mvp-b-transfer-wizard");
        const statusOutput = document.getElementById("mvp-b-transfer-status");
        const read = (name) => new FormData(form).get(name);
        const payload = (statusCode) => ({
          id: read("id"),
          requestType: "transfer",
          statusCode,
          requestedAt: read("requestedAt"),
          correlationId: read("correlationId"),
          payloadVersion: "mvp_b_transfer_v1",
          person: {
            id: read("person.id"),
            displayName: read("person.displayName"),
            createdAt: read("person.createdAt")
          },
          payload: {
            tenantEnvironmentId: read("payload.tenantEnvironmentId"),
            effectiveDate: read("payload.effectiveDate"),
            currentAssignment: {
              assignmentId: read("payload.currentAssignment.assignmentId"),
              assignmentCode: read("payload.currentAssignment.assignmentCode")
            },
            targetAssignment: {
              organizationReference: read("payload.targetAssignment.organizationReference"),
              departmentReference: read("payload.targetAssignment.departmentReference"),
              managerReference: read("payload.targetAssignment.managerReference"),
              positionCode: read("payload.targetAssignment.positionCode") || null
            },
            transferReason: {
              reasonCode: read("payload.transferReason.reasonCode"),
              note: read("payload.transferReason.note") || null
            }
          }
        });
        const send = async (action) => {
          statusOutput.value = "Loading";
          const isValidation = action === "validate";
          const response = await fetch(isValidation ? "/transfers/assignment-change/transaction-requests/validate" : form.action, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload(isValidation ? read("statusCode") : action))
          });
          const body = await response.json();
          statusOutput.value = response.ok ? "Success" : body.error;
        };
        form.addEventListener("click", async (event) => {
          const action = event.target?.dataset?.action;
          if (!action) return;
          await send(action);
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          await send(read("statusCode") || "submitted");
        });
      </script>
    </main>
  </body>
</html>`;
}
