export function renderOnboardingWizard(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>HRCore MVP-A New Hire</title>
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
      input {
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
      <h1>MVP-A New Hire Onboarding</h1>
      <form id="mvp-a-onboarding-wizard" action="/onboarding/new-hire/transaction-requests" method="post">
        <fieldset>
          <legend>Request</legend>
          <div class="grid">
            <label>Request ID<input name="id" value="transaction-request-onboarding-001" required></label>
            <label>Correlation ID<input name="correlationId" value="correlation-onboarding-001" required></label>
            <label>Requested At<input name="requestedAt" value="2026-05-21T00:00:00Z" required></label>
            <label>Status<input name="statusCode" value="draft" required></label>
            <label>Tenant Environment<input name="payload.tenantEnvironmentId" value="repo_owned_synthetic_mvp_a_onboarding" readonly required></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Person</legend>
          <div class="grid">
            <label>Person ID<input name="person.id" value="person-onboarding-001" required></label>
            <label>Display Name<input name="person.displayName" value="MVP-A Onboarding Hire One" required></label>
            <label>Created At<input name="person.createdAt" value="2026-05-21T00:00:00Z" required></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Employment</legend>
          <div class="grid">
            <label>Effective Date<input name="payload.effectiveDate" value="2026-06-01" required></label>
            <label>Employment ID<input name="payload.employment.id" value="employment-onboarding-001" required></label>
            <label>Employment Code<input name="payload.employment.employmentCode" value="EMP-ONBOARDING-001" required></label>
            <label>Start Date<input name="payload.employment.startDate" value="2026-06-01" required></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Assignment</legend>
          <div class="grid">
            <label>Assignment ID<input name="payload.assignment.id" value="assignment-onboarding-001" required></label>
            <label>Assignment Code<input name="payload.assignment.assignmentCode" value="ASN-ONBOARDING-001" required></label>
            <label>Department Reference<input name="payload.assignment.departmentReference" value="department-people-ops" required></label>
            <label>Legal Entity Reference<input name="payload.assignment.legalEntityReference" value="legal-entity-jp-001" required></label>
            <label>Manager Reference<input name="payload.assignment.managerReference" value="manager-001" required></label>
            <label>Position Code<input name="payload.assignment.positionCode" value="position-engineer-001"></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Okta Projection</legend>
          <div class="grid">
            <label>Contact Point ID<input name="payload.workEmailExpectation.contactPointId" value="contact-point-onboarding-001" required></label>
            <label>Work Email<input name="payload.workEmailExpectation.value" value="onboarding.hire.001@example.invalid" required></label>
          </div>
        </fieldset>
        <div class="actions">
          <button type="button" class="secondary" data-action="validate">Validate</button>
          <button type="button" class="secondary" data-action="draft">Save Draft</button>
          <button type="button" data-action="submitted">Submit</button>
        </div>
        <output id="mvp-a-onboarding-status" role="status"></output>
      </form>
      <script>
        const form = document.getElementById("mvp-a-onboarding-wizard");
        const statusOutput = document.getElementById("mvp-a-onboarding-status");
        const read = (name) => new FormData(form).get(name);
        const payload = (statusCode) => ({
          id: read("id"),
          requestType: "hire",
          statusCode,
          requestedAt: read("requestedAt"),
          correlationId: read("correlationId"),
          payloadVersion: "mvp_a_onboarding_v1",
          person: {
            id: read("person.id"),
            displayName: read("person.displayName"),
            createdAt: read("person.createdAt")
          },
          payload: {
            tenantEnvironmentId: read("payload.tenantEnvironmentId"),
            effectiveDate: read("payload.effectiveDate"),
            employment: {
              id: read("payload.employment.id"),
              employmentCode: read("payload.employment.employmentCode"),
              startDate: read("payload.employment.startDate")
            },
            assignment: {
              id: read("payload.assignment.id"),
              assignmentCode: read("payload.assignment.assignmentCode"),
              departmentReference: read("payload.assignment.departmentReference"),
              legalEntityReference: read("payload.assignment.legalEntityReference"),
              managerReference: read("payload.assignment.managerReference"),
              positionCode: read("payload.assignment.positionCode") || null
            },
            workEmailExpectation: {
              contactPointId: read("payload.workEmailExpectation.contactPointId"),
              value: read("payload.workEmailExpectation.value")
            }
          }
        });
        form.addEventListener("click", async (event) => {
          const action = event.target?.dataset?.action;
          if (!action) return;
          statusOutput.value = "Loading";
          const isValidation = action === "validate";
          const response = await fetch(isValidation ? "/onboarding/new-hire/transaction-requests/validate" : form.action, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload(isValidation ? read("statusCode") : action))
          });
          const body = await response.json();
          statusOutput.value = response.ok ? "Success" : body.error;
        });
      </script>
    </main>
  </body>
</html>`;
}
