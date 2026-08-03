# P2Z WebUI Visual UAT Package

- Issue: #406
- Package date: 2026-07-18
- Boundary review date: 2026-08-01
- UAT scope: bounded/non-production visual and workflow rehearsal
- Automated gate: Passed

## Entry Verdict

The P2Z visual re-entry gate is open for bounded/non-production UAT. The five
primary mockup screen families are implemented and connected to the existing
P2Y synthetic workflows.

This package is not HR practical-use readiness, production-like readiness, or
go-live approval.

## Verdict Boundary

| Decision surface                | Current verdict                          |
| ------------------------------- | ---------------------------------------- |
| Automated visual UAT candidate  | Go                                       |
| Formal human visual UAT verdict | Pending human execution                  |
| Issue #406 close eligibility    | Blocked pending the formal human verdict |
| Production-like readiness       | Blocked                                  |
| Go-live approval                | Blocked                                  |

The automated checks and repository-owned screenshots prepare the package for
formal visual UAT, but they do not supply its verdict. Only the named human UAT
tester may record `Accepted`, `Conditional`, or `Blocked` for each scenario and
the overall verdict. Agent-prepared evidence must remain identified as
preflight evidence and cannot unlock Issue #406 closeout.

When the overall human verdict changes, update both human rows in this table in
the same commit. `Issue #406 close eligibility` must be `Eligible after evidence
linkage` for `Accepted`, `Blocked pending named conditions` for `Conditional`,
or `Blocked by the formal human verdict` for `Blocked`.

## Backend Integration Boundary

- The local test runner uses `GET /health` only to confirm that the API process
  is ready. The WebUI loads `GET /openapi.json` to render the API contract
  connection status.
- The later bounded P2LIST implementation connects the employee and lifecycle
  list/detail screens, plus their explicitly allowlisted export actions, to
  repository-owned synthetic/non-production APIs. Those routes retain their
  server-owned authorization, scope, masking, cursor, and audit boundaries.
- Onboarding, transfer, termination, approval, CSV dry-run, Ops/DLQ, Audit, and
  support-review workflow mutations remain repository-owned client-state
  synthetic simulations unless a scenario explicitly names a P2LIST API.
- Persona selection remains a client-side visual/navigation boundary. It is not
  production authentication or proof of server-side authorization.

Consequently, this visual UAT validates bounded UI comprehension and workflow
rehearsal. It must not be described as end-to-end workflow API integration,
production authorization, or production-like readiness.

## Preconditions

1. Use repository-owned synthetic/non-production fixtures only.
2. Do not configure live provider credentials.
3. Record the exact tested commit in the Human Execution Record before starting:

   ```sh
   git rev-parse HEAD
   ```

4. Generate the bounded P2LIST UAT dataset and environment files. This replaces
   only `.local/p2list-uat/`:

   ```sh
   npm run setup:p2list:uat
   ```

5. Start the local API and WebUI in separate shells with the generated
   server-owned actor registry and bounded browser tokens:

   ```sh
   source .local/p2list-uat/api-environment.sh
   npm run dev
   ```

   ```sh
   source .local/p2list-uat/web-environment.sh
   npm run dev:web
   ```

6. Open `http://127.0.0.1:5173`.
7. Use the persona specified by each scenario. Browser persona selection does
   not replace the generated API actor binding.
8. Use `EMP-000128` for bounded direct employee lookup.

## Automated Gate

Run:

```sh
npx playwright install chromium
npm run test:web:e2e
```

Expected result:

- Chromium at 1600 x 1000, 1440 x 900, 1280 x 800, 768 x 1024, and
  390 x 844 passes;
- no horizontal overflow is detected;
- the mobile drawer closes before each task surface is inspected;
- Dashboard, Employee detail, Transfer, Approval inbox, and Job monitor are
  reachable through the correct persona.

## UAT Scenarios

| ID         | Persona                   | Screen            | Procedure                                               | Expected result                                                                           |
| ---------- | ------------------------- | ----------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| P2Z-UAT-01 | HR operator               | Dashboard         | Select HR operator                                      | KPI, seven-day work queue, integration health, and recent drafts are visible              |
| P2Z-UAT-02 | HR operator               | Employee detail   | Look up `EMP-000128`                                    | masked profile, lifecycle timeline, and external IDs are visible                          |
| P2Z-UAT-03 | HR operator               | Transfer          | Open Transfer and inspect defaults                      | step 3/5, input, impact preview, validation, and request detail are visible               |
| P2Z-UAT-04 | HR operator then Approver | Approval inbox    | Create transfer request, switch persona, open Approvals | selected transfer evidence and separated reject/return/approve/cancel actions are visible |
| P2Z-UAT-05 | HR Ops/support            | Job monitor       | Open Ops/DLQ                                            | runtime KPI, recent runs, failed items, job detail, and DLQ decision are visible          |
| P2Z-UAT-06 | HR Ops/support            | Audit             | Open Audit                                              | one exact correlation lookup and evidence timeline are visible                            |
| P2Z-UAT-07 | Any bounded persona       | Mobile drawer     | Repeat at 390 x 844                                     | drawer opens explicitly, closes after route selection, and no primary action is lost      |
| P2Z-UAT-08 | No persona                | Fail-closed entry | Reload without persona                                  | workflows remain hidden and the bounded reason is visible                                 |

## Human Execution Record

Overall human verdict: **Pending human execution**
Tested commit: **Pending human execution**
Named human tester: **Pending assignment**
Overall verdict recorded by: **Pending assignment**

The named human tester must replace every pending field during one formal run
against a recorded commit. `Actual result` must describe what the tester
observed; `Evidence` must link the run-specific screenshot or trace rather than
relying only on the automated reference image. Use either a repository path
under `evidence/p2z-webui/runs/<tested-commit>/<scenario>.<artifact-extension>`
or a GitHub `user-attachments/assets` URL for each run artifact. A repository
path must exist under `docs/` and be Git-tracked before closeout. Record the
package-level tester before execution, use that exact identity in every
completed scenario row, and allow only that tester to fill `Overall verdict
recorded by`.

The overall verdict may be `Pending human execution`, `Accepted`, `Conditional`,
or `Blocked`. Each scenario verdict may be `Pending`, `Accepted`, `Conditional`,
or `Blocked`. `Accepted` and `Conditional` require a 40-character tested commit
and no `Pending` values in either record. `Blocked` requires the tested commit,
a completed `Blocked` scenario, and its `blocker` finding; later scenario and
finding rows may remain pending because the run stops at that blocker.
Before execution, `Pending human execution` may use either the initial pending
commit placeholder or the 40-character commit recorded in precondition 3. Its
scenario verdicts, finding rows, and checklist remain pending until the formal
verdict is recorded.

| ID         | Human tester       | Execution date | Viewport | Persona                   | Expected result                                                  | Actual result           | Evidence                                                                                  | Scenario verdict |
| ---------- | ------------------ | -------------- | -------- | ------------------------- | ---------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- | ---------------- |
| P2Z-UAT-01 | Pending assignment | Pending        | 1440x900 | HR operator               | Dashboard structure is understandable                            | Pending human execution | [reference](evidence/p2z-webui/desktop-chromium-dashboard.png); run capture pending       | Pending          |
| P2Z-UAT-02 | Pending assignment | Pending        | 1440x900 | HR operator               | Masked profile, lifecycle timeline, and external IDs are visible | Pending human execution | [reference](evidence/p2z-webui/desktop-chromium-employee-detail.png); run capture pending | Pending          |
| P2Z-UAT-03 | Pending assignment | Pending        | 1440x900 | HR operator               | Transfer steps and impact remain clear                           | Pending human execution | [reference](evidence/p2z-webui/desktop-chromium-transfer.png); run capture pending        | Pending          |
| P2Z-UAT-04 | Pending assignment | Pending        | 1440x900 | HR operator then Approver | Approval evidence and actions are clear                          | Pending human execution | [reference](evidence/p2z-webui/desktop-chromium-approval-inbox.png); run capture pending  | Pending          |
| P2Z-UAT-05 | Pending assignment | Pending        | 1440x900 | HR Ops/support            | Job and DLQ evidence is understandable                           | Pending human execution | [reference](evidence/p2z-webui/desktop-chromium-job-monitor.png); run capture pending     | Pending          |
| P2Z-UAT-06 | Pending assignment | Pending        | 1440x900 | HR Ops/support            | One exact correlation lookup and evidence timeline are visible   | Pending human execution | Run-specific Audit capture pending                                                        | Pending          |
| P2Z-UAT-07 | Pending assignment | Pending        | 390x844  | Pending actual persona    | Drawer and primary actions remain usable                         | Pending human execution | [mobile references](evidence/p2z-webui/README.md); run capture pending                    | Pending          |
| P2Z-UAT-08 | Pending assignment | Pending        | 1440x900 | No persona                | Workflow content remains fail-closed                             | Pending human execution | Run-specific fail-closed entry capture pending                                            | Pending          |

## Scenario Finding Record

| ID         | Finding status | Linked GitHub Issue | Owner   | Scope boundary | Actor   | Tenant/environment | Subject binding | Route and viewport | Correlation ID | Evidence version | Screenshot or trace | Cleanup status | Disposition |
| ---------- | -------------- | ------------------- | ------- | -------------- | ------- | ------------------ | --------------- | ------------------ | -------------- | ---------------- | ------------------- | -------------- | ----------- |
| P2Z-UAT-01 | Pending        | Pending             | Pending | Pending        | Pending | Pending            | Pending         | Pending            | Pending        | Pending          | Pending             | Pending        | Pending     |
| P2Z-UAT-02 | Pending        | Pending             | Pending | Pending        | Pending | Pending            | Pending         | Pending            | Pending        | Pending          | Pending             | Pending        | Pending     |
| P2Z-UAT-03 | Pending        | Pending             | Pending | Pending        | Pending | Pending            | Pending         | Pending            | Pending        | Pending          | Pending             | Pending        | Pending     |
| P2Z-UAT-04 | Pending        | Pending             | Pending | Pending        | Pending | Pending            | Pending         | Pending            | Pending        | Pending          | Pending             | Pending        | Pending     |
| P2Z-UAT-05 | Pending        | Pending             | Pending | Pending        | Pending | Pending            | Pending         | Pending            | Pending        | Pending          | Pending             | Pending        | Pending     |
| P2Z-UAT-06 | Pending        | Pending             | Pending | Pending        | Pending | Pending            | Pending         | Pending            | Pending        | Pending          | Pending             | Pending        | Pending     |
| P2Z-UAT-07 | Pending        | Pending             | Pending | Pending        | Pending | Pending            | Pending         | Pending            | Pending        | Pending          | Pending             | Pending        | Pending     |
| P2Z-UAT-08 | Pending        | Pending             | Pending | Pending        | Pending | Pending            | Pending         | Pending            | Pending        | Pending          | Pending             | Pending        | Pending     |

For each `blocker`, `must-fix`, or `post-UAT` result, add a row, create or link a
GitHub Issue, and complete every Evidence Record field in that same row before
assigning the overall verdict. Repeated scenario IDs are allowed when one
scenario has multiple findings, but each finding must retain its own evidence
link and every scenario must have at least one row. Repository-backed finding
evidence uses
`evidence/p2z-webui/runs/<tested-commit>/<scenario>-finding-<slug>.<artifact-extension>`;
GitHub `user-attachments/assets` links are also allowed. If no finding exists,
record `none observed` in `Finding status` and `not applicable` in every
remaining finding field; do not leave the finding status implicit.

## Visual Review Checklist

For each review item, set `Status` to `Completed` and record one explicit
`Disposition`: `completed`, `blocked`, `workaround`, `defect`, or
`post-UAT backlog`. Pending records keep both fields `Pending`.
`Conditional` requires at least one non-clean disposition, and `Blocked`
requires a `blocked` disposition.

| Review item                                                                                         | Status  | Disposition |
| --------------------------------------------------------------------------------------------------- | ------- | ----------- |
| Navigation, page heading, and workspace use the same visual hierarchy.                              | Pending | Pending     |
| Japanese task labels are primary and technical identifiers remain readable.                         | Pending | Pending     |
| Status, priority, deadline, provider, and scope are distinguishable without relying on color alone. | Pending | Pending     |
| Forms and impact previews remain aligned at desktop width.                                          | Pending | Pending     |
| Master/detail selection is visually clear.                                                          | Pending | Pending     |
| Destructive and primary actions are visually separated.                                             | Pending | Pending     |
| Text does not clip or overlap.                                                                      | Pending | Pending     |
| Loading, empty, error, blocked, success, and disabled states are understandable.                    | Pending | Pending     |
| Keyboard focus is visible.                                                                          | Pending | Pending     |
| Mobile controls remain inside the viewport.                                                         | Pending | Pending     |

## Evidence Matrix

| Screen          | Desktop                                                                                           | Tablet                                                                                          | Mobile                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Dashboard       | [`desktop-chromium-dashboard.png`](evidence/p2z-webui/desktop-chromium-dashboard.png)             | [`tablet-chromium-dashboard.png`](evidence/p2z-webui/tablet-chromium-dashboard.png)             | [`mobile-chromium-dashboard.png`](evidence/p2z-webui/mobile-chromium-dashboard.png)             |
| Employee detail | [`desktop-chromium-employee-detail.png`](evidence/p2z-webui/desktop-chromium-employee-detail.png) | [`tablet-chromium-employee-detail.png`](evidence/p2z-webui/tablet-chromium-employee-detail.png) | [`mobile-chromium-employee-detail.png`](evidence/p2z-webui/mobile-chromium-employee-detail.png) |
| Transfer        | [`desktop-chromium-transfer.png`](evidence/p2z-webui/desktop-chromium-transfer.png)               | [`tablet-chromium-transfer.png`](evidence/p2z-webui/tablet-chromium-transfer.png)               | [`mobile-chromium-transfer.png`](evidence/p2z-webui/mobile-chromium-transfer.png)               |
| Approval inbox  | [`desktop-chromium-approval-inbox.png`](evidence/p2z-webui/desktop-chromium-approval-inbox.png)   | [`tablet-chromium-approval-inbox.png`](evidence/p2z-webui/tablet-chromium-approval-inbox.png)   | [`mobile-chromium-approval-inbox.png`](evidence/p2z-webui/mobile-chromium-approval-inbox.png)   |
| Job monitor     | [`desktop-chromium-job-monitor.png`](evidence/p2z-webui/desktop-chromium-job-monitor.png)         | [`tablet-chromium-job-monitor.png`](evidence/p2z-webui/tablet-chromium-job-monitor.png)         | [`mobile-chromium-job-monitor.png`](evidence/p2z-webui/mobile-chromium-job-monitor.png)         |

## Defect Triage

| Class    | Meaning                                                                  | UAT decision             |
| -------- | ------------------------------------------------------------------------ | ------------------------ |
| blocker  | persona boundary bypass, inaccessible primary action, or unusable screen | stop UAT                 |
| must-fix | critical hierarchy mismatch, overlap, clipping, or workflow regression   | repair before acceptance |
| post-UAT | cosmetic difference that does not change task comprehension or action    | record in backlog        |

## Evidence Record

For every finding capture:

- actor;
- tenant/environment;
- subject binding;
- route and viewport;
- correlation ID when applicable;
- evidence version;
- screenshot or trace;
- cleanup status;
- completed / blocked / workaround / defect / post-UAT backlog.

## Known Limitations

- The UI uses repository-owned synthetic/non-production data.
- Persona selection is not production authentication.
- Direct lookup accepts one explicitly allowed fixture and is not broad employee
  search.
- No real employee data.
- No live IdP/Okta/provider mutation.
- No production authorization/RLS.
- No unrestricted raw payload.
- No broad CSV export.
- No production queue/DLQ custody.
- No production audit immutability.
- No retention/deletion runtime.
- No legal/privacy approval.
- No two-key approval.
- No go-live approval.
- No production-like readiness.
- Master update assist, assistant drawer, and workforce forecast remain
  deferred.

## Exit Rule

Bounded visual UAT is accepted only when blocker and must-fix counts are zero,
all primary scenarios are completed, and any post-UAT backlog is recorded with
an owner and scope boundary. The final human owner must then record the overall
`Accepted`, `Conditional`, or `Blocked` verdict in Issue #406 and link it from
the Obsidian P2Z plan. Automated or agent-prepared results cannot perform this
step.
