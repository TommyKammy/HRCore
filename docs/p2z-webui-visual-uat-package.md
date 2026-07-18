# P2Z WebUI Visual UAT Package

Date: 2026-07-18  
UAT scope: bounded/non-production visual and workflow rehearsal  
Automated gate: Passed

## Entry Verdict

The P2Z visual re-entry gate is open for bounded/non-production UAT. The five
primary mockup screen families are implemented and connected to the existing
P2Y synthetic workflows.

This package is not HR practical-use readiness, production-like readiness, or
go-live approval.

## Preconditions

1. Use repository-owned synthetic/non-production fixtures only.
2. Do not configure live provider credentials.
3. Start the local API and WebUI:

   ```sh
   npm run dev
   npm run dev:web
   ```

4. Open `http://127.0.0.1:5173`.
5. Use the persona specified by each scenario.
6. Use `EMP-000128` for bounded direct employee lookup.

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
| P2Z-UAT-02 | HR operator               | Employee detail   | Open Employees or look up `EMP-000128`                  | masked profile, lifecycle timeline, and external IDs are visible                          |
| P2Z-UAT-03 | HR operator               | Transfer          | Open Transfer and inspect defaults                      | step 3/5, input, impact preview, validation, and request detail are visible               |
| P2Z-UAT-04 | HR operator then Approver | Approval inbox    | Create transfer request, switch persona, open Approvals | selected transfer evidence and separated reject/return/approve/cancel actions are visible |
| P2Z-UAT-05 | HR Ops/support            | Job monitor       | Open Ops/DLQ                                            | runtime KPI, recent runs, failed items, job detail, and DLQ decision are visible          |
| P2Z-UAT-06 | HR Ops/support            | Audit             | Open Audit                                              | one exact correlation lookup and evidence timeline are visible                            |
| P2Z-UAT-07 | Any bounded persona       | Mobile drawer     | Repeat at 390 x 844                                     | drawer opens explicitly, closes after route selection, and no primary action is lost      |
| P2Z-UAT-08 | No persona                | Fail-closed entry | Reload without persona                                  | workflows remain hidden and the bounded reason is visible                                 |

## Visual Review Checklist

For each primary screen, record `completed`, `blocked`, `workaround`, `defect`,
and `post-UAT backlog`.

- [ ] Navigation, page heading, and workspace use the same visual hierarchy.
- [ ] Japanese task labels are primary and technical identifiers remain
      readable.
- [ ] Status, priority, deadline, provider, and scope are distinguishable
      without relying on color alone.
- [ ] Forms and impact previews remain aligned at desktop width.
- [ ] Master/detail selection is visually clear.
- [ ] Destructive and primary actions are visually separated.
- [ ] Text does not clip or overlap.
- [ ] Loading, empty, error, blocked, success, and disabled states are
      understandable.
- [ ] Keyboard focus is visible.
- [ ] Mobile controls remain inside the viewport.

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
an owner and scope boundary.
