# P2Y-00 WebUI Practical-Use Scope and Authorization Gate

Issue: #389
Part of: #388
Depends on: #360, #371
Review scope: WebUI practical-use personas, workflows, information architecture, UX surfaces, and authorization mapping only.
Review mode: repository-owned planning and guard evidence. This document is
not project-owner, HR operator, legal, privacy, security, data-owner,
operational, architecture, production authorization, or two-key approval.

## Scope Boundary

- WebUI scope planning: Allowed.
- bounded/non-production UI implementation planning: Allowed.
- WebUI runtime implementation beyond later bounded child issues: Blocked.
- production-like readiness: Blocked.
- real employee data: Blocked.
- live IdP/Okta/provider operation: Blocked.
- production credentials: Blocked.
- production authorization/RLS: Blocked.
- production audit immutability: Blocked.
- unrestricted raw payload access: Blocked.
- broad CSV export: Blocked.
- production queue/DLQ operation: Blocked.
- retention/deletion runtime: Blocked.
- legal/privacy approval: Blocked.
- two-key approval: Blocked.

This record defines the smallest practical WebUI map that later child issues
can implement in bounded/non-production slices. It does not authorize product
runtime, real personnel records, live provider traffic, production credentials,
production RBAC, PostgreSQL RLS authority, production audit archive behavior,
retention/deletion jobs, legal/privacy sign-off, or go-live approval.

When provenance, actor, role, tenant, subject, field, action, environment, or
evidence-version signals are missing, malformed, stale, placeholder-shaped, or
client-supplied without a trusted boundary, later implementation must fail
closed instead of inferring success from issue text, path shape, forwarded
headers, role names, comments, nearby metadata, or operator-facing summaries.

## Minimum Personas

| Persona        | Practical need                                                                                        | Bounded/non-production permission shape                                                                                                            | Must stay blocked                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| HR operator    | Prepare and review onboarding, transfer, termination, and CSV import work before approval.            | May use bounded create, edit, validate, submit, list, and detail surfaces for repo-owned synthetic or explicitly approved non-production examples. | Real employee mutation custody, unrestricted search, raw payload viewing, broad export, live-provider execution, and production authorization claims. |
| approver       | Review submitted lifecycle requests and record approve, return, reject, or cancel decisions.          | May use approval inbox and detail views that show only fields allowed by role, tenant, subject, action, and evidence scope.                        | Self-approval bypass, missing actor approval, placeholder approval, two-key approval, break-glass, and production delegation.                         |
| HR Ops/support | Inspect bounded evidence, failed paths, local Ops status, DLQ decisions, and support-review context.  | May use trace, audit, Ops, DLQ, and support-review surfaces anchored to direct correlation or workflow evidence.                                   | Production support-console authority, broad audit search, live provider audit lookup, queue/DLQ runtime custody, and incident workflow authority.     |
| admin          | Configure bounded UI labels, route visibility, and local reviewer setup for non-production rehearsal. | May manage non-production UI affordances and review-only configuration that does not grant production authority.                                   | Production credentials, production RBAC/RLS, tenant provisioning, legal/privacy approval, retention/deletion runtime, and go-live settings.           |

## Practical-Use Workflow Map

| Workflow          | Practical WebUI flow                                                                                                                                                    | Authoritative evidence boundary                                                                                                                                 | Fail-closed requirement                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| onboarding        | HR operator starts a bounded new-hire request, validates required fields, submits for approval, approver decides, and reviewer inspects apply/writeback evidence.       | Direct MVP-A onboarding request, approval, apply, mock-provider projection, writeback/conflict, tenant/environment, actor, and correlation evidence.            | Missing request, approval, apply, job, tenant, actor, field-scope, or direct correlation evidence blocks the surface.                             |
| transfer          | HR operator drafts and submits an assignment-change request; approver reviews assignment, effective date, and mock projection impact; reviewer inspects trace evidence. | Direct MVP-B transfer request, approval audit, assignment-change lifecycle, worker attempt, assignment history, and deterministic mock provider projection.     | Sibling transfer, inferred assignment, unsupported effective date, or missing subject binding blocks the view or action.                          |
| termination       | HR operator drafts and submits termination; approver reviews end-date and assignment effects; reviewer inspects bounded termination trace evidence.                     | Direct MVP-C termination request, approval audit, ended employment, ended assignment, worker attempt, and deterministic mock disable or group-removal evidence. | Retention/deletion, anonymization, legal hold, live-provider disable, or real employee termination custody remains blocked.                       |
| CSV import/export | HR operator runs bounded CSV dry-run, reviews row diffs, applies accepted synthetic rows, and sees denied export evidence.                                              | MVP-D bounded CSV job, row outcome, row correlation, denied raw or broad export, and audit evidence.                                                            | Unsupported columns, regulated identifiers, unrestricted raw payload aliases, broad export, or real-data CSV rows fail before durable success.    |
| Ops/DLQ           | HR Ops/support reviews local job status and records reasoned retry, replay, ignore, or close decisions against failed synthetic row evidence.                           | Explicit workflow plus job correlation, row id, failure evidence, current evidence version, decision audit, and clean failed-path state.                        | Production queue actions, stale evidence versions, duplicate replay, orphan audit, partial durable writes, and incident authority remain blocked. |
| audit             | Reviewer starts from a direct flow correlation id or explicit workflow/correlation pair and inspects only directly linked bounded evidence.                             | Direct audit/correlation records for the anchored request, job, row, decision, provider mock, and writeback where applicable.                                   | Broad audit search, sibling lineage, mixed-snapshot stitching, support-console custody, and production audit immutability claims remain blocked.  |
| support review    | HR Ops/support records reasoned review against one explicit bounded subject and allowed evidence scope.                                                                 | Direct support-review reason, actor, tenant/environment, field scope, subject binding, and evidence version.                                                    | Placeholder reasons, fake approvals, forwarded identity, inferred subject, raw payload disclosure, and live provider audit lookup remain blocked. |

## Information Architecture

The WebUI starts from work queues and direct subject records rather than global
search. Navigation should be explicit about bounded/non-production context and
must not present production-like readiness or go-live status.

| Area           | Required surfaces                                                                                                                                     | Notes for later bounded implementation                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| navigation     | Work queue, onboarding, transfer, termination, CSV, Ops/DLQ, audit, support review, admin.                                                            | Route visibility is role and tenant scoped; hidden navigation is convenience only and must not replace server-side authorization.                            |
| lists          | Drafts, submitted requests, approvals due, CSV jobs, failed rows, support reviews, and audit lookups.                                                 | Lists must use explicit tenant/environment and role bindings; no broad employee directory or real-data search is allowed.                                    |
| detail views   | Request detail, approval detail, apply trace, provider mock projection, writeback/conflict, CSV row outcome, Ops decision, and support review detail. | Details assemble from the anchored authoritative record only; sibling or same-parent context is not included unless explicitly linked.                       |
| create flows   | Onboarding, transfer, termination, and CSV import setup.                                                                                              | Create flows are bounded to synthetic or approved non-production examples and must validate unsupported fields before durable writes.                        |
| approval views | Approval inbox and decision detail for approve, return, reject, or cancel.                                                                            | Approval actions require actor, role, tenant, subject, action, state, and field gates; placeholder or self-approval evidence stays blocked.                  |
| audit surfaces | Correlation lookup, trace timeline, field-scope evidence, and failed-path evidence.                                                                   | Audit views are bounded local evidence surfaces, not WORM/Object Lock, compliance archive, broad audit search, or live provider audit.                       |
| Ops surfaces   | Local job status, failed-row detail, DLQ decision panel, retry/replay/ignore/close history, and cleanup evidence.                                     | Ops surfaces remain local and synthetic; production queue/DLQ operation, incident workflow, SLO/SLA, and support-console custody are separate prerequisites. |

## Authorization Map

| Gate              | Required input                                                                                                                   | Allowed planning rule                                                                                                                                        | Blocked or fail-closed condition                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| route gate        | authenticated bounded actor, role, tenant/environment, and route id.                                                             | Show only routes allowed for HR operator, approver, HR Ops/support, or admin within the bounded environment.                                                 | Missing auth, placeholder credentials, client-supplied role, forwarded identity without trusted proxy normalization, or wrong tenant blocks the route.                            |
| action gate       | actor, role, action, current authoritative state, reason where required, and operation correlation.                              | Allow create, edit, submit, approve, return, reject, cancel, dry-run, apply, retry, replay, ignore, close, and review only where the anchored state permits. | Illegal state transition, stale evidence version, self-approval bypass, unsupported action, missing reason, or placeholder approval blocks the action.                            |
| field gate        | role, workflow, field classification, field purpose, and evidence scope.                                                         | Display or edit only fields explicitly allowed for the persona and workflow. Use masking for fields that are reviewable but not fully visible.               | Regulated identifiers, raw payload aliases, unsupported later-wave fields, sensitive personal information, broad export fields, or unclassified fields remain hidden or rejected. |
| tenant gate       | authoritative tenant/environment binding from the persisted bounded record.                                                      | Resolve tenant/environment from the direct record under review, not from request headers, host names, route names, or branch/worktree names.                 | Missing, mismatched, production, live-provider, client-supplied, or inferred tenant/environment blocks read and write operations.                                                 |
| subject gate      | direct person, transaction request, assignment, employment, CSV job, row, failure, decision, support review, or audit subject.   | Bind each view and action to one anchored subject or directly linked subject set.                                                                            | Subject inferred from names, comments, sibling rows, same-parent lineage, issue text, nearby metadata, or display summaries blocks the surface.                                   |
| audit requirement | actor, action, subject, tenant/environment, correlation id, evidence version, outcome, and failure cleanliness where applicable. | Later actions must record bounded local audit/correlation evidence and failed-path cleanup evidence where a partial write could survive.                     | Missing audit evidence, mixed-snapshot read sets, orphan records, half-restored state, duplicate replay, or projection drift blocks completion.                                   |

## Allowed Bounded Surfaces

- Planning artifacts, wireframe-level UX decomposition, route/action/field
  authorization maps, and implementation tickets for bounded/non-production
  child issues.
- Bounded UI slices for synthetic or explicitly approved non-production
  onboarding, transfer, termination, CSV dry-run/apply, denied export, local
  Ops/DLQ, audit/correlation, and support-review evidence when later child
  issues add focused tests and server-side guards.
- Role-specific masking and field visibility rules that remain subordinate to
  server-side authorization and existing bounded evidence gates.
- Repo-relative verification commands and documented placeholders such as
  `CODEX_SUPERVISOR_CONFIG`, `<supervisor-config-path>`, and
  `<codex-supervisor-root>` when supervisor context is needed.

## Blocked Surfaces

- Production-like readiness, go-live readiness, production operating model, and
  production support-console authority.
- Real employee data, production employee datasets, live tenant data, payroll or
  benefit data, regulated identifiers, sensitive personal information, and raw
  provider payload viewing.
- Live IdP/Okta/provider operation, live provider traffic, webhook custody,
  provider audit lookup, provider credential use, and production secrets.
- Production authorization/RLS, production RBAC authority, PostgreSQL RLS source
  of truth, trusted proxy identity runtime, and production data-scope policy.
- Production audit immutability, WORM/Object Lock, compliance archive, broad
  audit search, retention/deletion runtime, anonymization, legal hold, and
  deletion jobs.
- Broad CSV export, unrestricted raw payload access, production queue/DLQ
  operation, production scheduler, monitoring/alerting, SLO/SLA, incident
  workflow, legal/privacy approval, two-key approval, and go-live approval.

## Phase 11 Wording Guard

Phase 11 wording must not claim production-like readiness. Any Phase 11,
WebUI, UX, or practical-use planning text may say that bounded/non-production
planning is allowed only when it also keeps production-like readiness, real
employee data, live provider operation, production credentials, production
authorization/RLS, production audit immutability, broad export, production
queue/DLQ, retention/deletion runtime, legal/privacy approval, two-key
approval, and go-live approval blocked.

Later records must not treat this document as approval for production UI
runtime, production authorization, production data access, support-console
authority, or go-live. If later wording conflicts with this boundary, the
blocked boundary wins until a directly linked owner-approved record changes it.

## Verification Commands

Focused reproduction before this artifact:

```sh
npm test -- --test-name-pattern "P2Y-00 WebUI practical-use scope"
```

The focused guard failed because
`docs/p2y-00-webui-practical-use-scope-authorization-gate.md` was missing.

Focused verification after this artifact:

```sh
npm test -- --test-name-pattern "P2Y-00 WebUI practical-use scope"
```

Final verification:

```sh
npm run verify:pre-pr
```

The final command covers TypeScript build, policy-as-code scanning, tests,
formatting, dependency audit, and Drizzle migration/config checks.

## No Surface Expansion Confirmation

No product behavior, migration, API surface, WebUI runtime implementation,
provider integration, production operation, support-console authority, export
expansion, raw-payload viewer, production queue, DLQ runtime,
retention/deletion job, real employee data flow, live IdP/Okta path,
production credential use, legal/privacy approval, two-key acceptance, go-live
approval, HR practical-use readiness, or production-like readiness surface is
introduced by this planning artifact.

- No product behavior.
- No real employee data.
- No live IdP/Okta.
- No unrestricted raw payload.
- No broad CSV export.
- No production queue/DLQ.
- No retention/deletion runtime.
- No legal/privacy approval.
- No two-key approval claim.
- No production-like readiness surface.

## Closeout Boundary

Issue #389 can close when this WebUI practical-use scope, its focused guard,
and `npm run verify:pre-pr` pass. The result is planning and authorization-map
evidence only, not WebUI runtime implementation, not HR practical-use readiness,
and not production-like readiness.
