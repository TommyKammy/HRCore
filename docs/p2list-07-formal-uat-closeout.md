# P2LIST-07 Formal List UAT and Bounded Closeout

Issue: #418  
Part of: #410  
Depends on: #415, #416, #417  
Related evidence-hardening lanes: #408, #409

## Verdict Boundary

| Decision surface                 | Current verdict                          |
| -------------------------------- | ---------------------------------------- |
| Automated bounded UAT candidate  | Go                                       |
| Current-head list evidence       | Regenerated and visually inspected       |
| Formal human HR workflow verdict | Pending human execution                  |
| Issue #418 close eligibility     | Blocked pending the formal human verdict |
| Epic #410 bounded closeout       | Blocked pending #418                     |
| Production-like readiness        | Blocked                                  |
| Go-live approval                 | Blocked                                  |

The focused verifier and inspected list screenshots show that the
repository-owned synthetic/non-production package is ready for formal human
UAT. They do not replace the HR workflow verdict required by #418. Only the
named human UAT operator may record `Accepted`, `Conditional`, or `Blocked` for
the formal verdict and unlock the Issue/Epic closeout.

This package does not approve real employee data, live provider operation,
production credentials, production authorization/RLS, unrestricted search, raw
payload access, broad export, production audit immutability, production
retention/deletion, legal/privacy approval, two-key approval, production-like
readiness, or go-live.

## Package Boundary

The package covers list-origin workflows delivered by #411 through #417:

- employee discovery, allowlisted search/filter/sort, stable cursor traversal,
  and employee detail navigation;
- normalized hire, transfer, and termination discovery, allowlisted
  search/filter/sort, cursor traversal, and lifecycle detail navigation;
- server-authoritative permission, scope, masking, and denial behavior;
- filtered, reasoned, allowlisted CSV export with the hard 100-row cap;
- canonical correlation IDs, denial evidence, bounded support lookup, retry
  identity, and non-PII metrics;
- desktop, tablet, and mobile visual evidence for both list screens.

No runtime feature or authorization policy may be added while executing this
UAT. A missing behavior is a finding, not permission to expand scope inside the
closeout.

## Preconditions

1. Use one clean checkout of the PR current head.
2. Confirm `git status --short` contains no unexpected tracked changes.
3. Use only repository-owned synthetic/non-production data.
4. Do not configure live provider credentials or production tokens.
5. Generate the repository-owned synthetic database, signed manifest, and
   persona environments. This replaces only `.local/p2list-uat/`:

   ```sh
   npm run setup:p2list:uat
   ```

   The generated dataset contains 100 equal-display-name employees, including
   exact 25-row and 26-row organization scopes, plus one submitted onboarding,
   transfer, and termination request. It also contains one bounded support
   evidence record for correlation `p2list-uat-support-correlation`.

6. Start the API and WebUI in separate shells from the repository root:

   ```sh
   source .local/p2list-uat/api-environment.sh
   npm run dev
   ```

   ```sh
   source .local/p2list-uat/web-environment.sh
   npm run dev:web
   ```

   The generated actor registry gives the HR operator only the explicit list,
   detail, bounded export, and download permissions; gives the approver no list
   or detail permissions; and gives HR Ops/support only exact lookup of the
   named support correlation. Browser persona state is not authorization.

7. Do not edit or reuse generated tokens outside this repository-owned local
   synthetic run. Re-run `npm run setup:p2list:uat` to reset the dataset.
8. Record the tested commit with `git rev-parse HEAD`.
9. Run the focused verifier before manual execution:

   ```sh
   npm run verify:p2list:uat
   ```

## Current-Head Evidence Protocol

Evidence is current-head only when all of the following are true:

1. the commit recorded by the operator equals the PR head under review;
2. `npm run verify:p2list:uat` completes in that checkout;
3. screenshots are regenerated in that checkout with
   `npm run capture:web:evidence`;
4. the API, export, and audit evidence comes from the same verifier run;
5. findings record the actor, tenant/environment, route, viewport, correlation
   ID, evidence version, and cleanup status;
6. a later runtime, contract, fixture, or visual change invalidates the evidence
   until the package is rerun.

#408 remains the owner of a general digest-based visual freshness guard. This
closeout does not claim that file presence or green CI alone proves human UX
acceptance.

## Persona Matrix

| Persona        | Expected list behavior                                                                          | Expected detail behavior                                     | Expected export/support behavior                                         |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| HR operator    | Employee and lifecycle rows limited by server-owned scope                                       | Allowed only with the independent matching detail permission | Filtered bounded export only with export and download permissions        |
| Approver       | Denied unless the server actor registry explicitly grants the list permission and bounded scope | No authority inferred from the browser persona label         | Broad export and support lookup denied                                   |
| HR Ops/support | No general collection authority inferred from the role                                          | Lifecycle detail remains denied by the bounded role contract | Exact-correlation support lookup only with explicit permission and scope |
| Bounded admin  | No implicit bypass; behavior follows only explicit server-owned permissions and scope           | No implicit detail bypass                                    | No implicit row-cap, allowlist, or reason-code bypass                    |

## Formal Scenario Matrix

`Human result` must be filled by the named UAT operator with `Completed`,
`Blocked`, `Workaround`, `Defect`, or `Post-UAT backlog`.

| ID            | Persona        | Scenario                                                                                        | Expected result                                                                                | Automated evidence                           | Human result |
| ------------- | -------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------ |
| P2LIST-UAT-01 | HR operator    | Discover an employee, apply an allowlisted query/filter/sort, and open the selected detail      | Scoped list and matching detail open without raw query/cursor evidence                         | employee API, WebUI list, and audit suites   | Pending      |
| P2LIST-UAT-02 | HR operator    | Discover hire, transfer, and termination requests and open each existing detail                 | All three normalized types remain distinguishable and scoped                                   | lifecycle repository/API and WebUI suites    | Pending      |
| P2LIST-UAT-03 | HR operator    | Traverse equal-sort-value data across 25/26/100 rows                                            | Stable cursor traversal has no duplicate or omitted row                                        | read-model and API pagination suites         | Pending      |
| P2LIST-UAT-04 | HR operator    | Exercise empty, one-page, and multi-page collections                                            | Empty state, bounded page state, and next-page state remain usable                             | repository, API, and WebUI state suites      | Pending      |
| P2LIST-UAT-05 | HR operator    | Retry after a simulated network failure                                                         | Uncertain transport retry reuses request identity; completed denial/conflict rotates identity  | WebUI API-client and observability suites    | Pending      |
| P2LIST-UAT-06 | Approver       | Attempt employee/lifecycle list and detail access without explicit permission                   | Server returns bounded denial without row or subject leakage                                   | authorization matrix and denial-audit suites | Pending      |
| P2LIST-UAT-07 | HR operator    | Export a meaningfully filtered employee and lifecycle result with an allowed reason and columns | CSV schema matches the allowlist, formulas are neutralized, and rows stay at or below 100      | export helper/API suites                     | Pending      |
| P2LIST-UAT-08 | HR operator    | Attempt unfiltered, over-cap, unsupported-column, or missing-reason export                      | Request is denied with no CSV payload or raw-filter audit leakage                              | export negative and observability suites     | Pending      |
| P2LIST-UAT-09 | HR Ops/support | Look up one exact authorized correlation                                                        | Action, API decision, export outcome, and denial evidence are linked without broad search      | audit observability suite                    | Pending      |
| P2LIST-UAT-10 | HR operator    | Use expired, tampered, filter-mismatched, and concurrent-change cursors                         | Request fails closed or preserves accepted-at traversal without mixed snapshots                | cursor and request-identity suites           | Pending      |
| P2LIST-UAT-11 | HR operator    | Complete employee and lifecycle list operations on desktop and mobile                           | Controls remain labelled, keyboard reachable, non-overlapping, and free of horizontal overflow | WebUI unit and Playwright visual suites      | Pending      |

## Evidence Matrix

### Visual Evidence

| Screen         | Desktop                                                                                         | Tablet                                                                                        | Mobile                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Employee list  | [`desktop-chromium-employee-list.png`](evidence/p2z-webui/desktop-chromium-employee-list.png)   | [`tablet-chromium-employee-list.png`](evidence/p2z-webui/tablet-chromium-employee-list.png)   | [`mobile-chromium-employee-list.png`](evidence/p2z-webui/mobile-chromium-employee-list.png)   |
| Lifecycle list | [`desktop-chromium-lifecycle-list.png`](evidence/p2z-webui/desktop-chromium-lifecycle-list.png) | [`tablet-chromium-lifecycle-list.png`](evidence/p2z-webui/tablet-chromium-lifecycle-list.png) | [`mobile-chromium-lifecycle-list.png`](evidence/p2z-webui/mobile-chromium-lifecycle-list.png) |

### Functional Evidence

| Evidence area                                                            | Repository-owned source                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Contract/classification/authorization                                    | `src/p2list-contract.test.ts`                                |
| Empty/one/multi-page and stable traversal                                | `src/p2list-read-model-repository.test.ts`                   |
| Employee list/detail/denial behavior                                     | `src/p2list-employee-api.test.ts`                            |
| Lifecycle type/list/detail/denial behavior                               | `src/p2list-lifecycle-api.test.ts`                           |
| Export allowlist, row cap, reason, and formula safety                    | `src/p2list-export.test.ts`, `src/p2list-export-api.test.ts` |
| Correlation, retry, denial, exact support lookup, and redaction          | `src/p2list-audit-observability.test.ts`                     |
| Canonical request/result identity and accepted-at reuse                  | `src/p2list-request-identity.test.ts`                        |
| Reproducible 100-row, lifecycle, persona, manifest, and support fixture  | `src/p2list-uat-fixture-setup.test.ts`                       |
| Browser request identity and error states                                | `web/src/api-client.test.ts`                                 |
| Browser list, detail navigation, export, denied, empty, and retry states | `web/src/app/list-screens.test.tsx`                          |
| Desktop/tablet/mobile visual and overflow checks                         | `web/e2e/visual-alignment.spec.ts`                           |

## Operator Runbook

1. Record the current commit, operator, date, viewport, persona, and
   tenant/environment.
2. Run `npm run setup:p2list:uat`, then start the API and WebUI with their
   generated environment files exactly as described in Preconditions.
3. Run `npm run verify:p2list:uat`. Stop if any focused check fails.
4. Regenerate screenshots with `npm run capture:web:evidence`.
5. Execute P2LIST-UAT-01 through P2LIST-UAT-11 in order.
6. For every action, record the route and displayed/returned correlation ID.
7. For export scenarios, record the filter summary, reason code, selected
   schema, response row count, and denial code where applicable. Never attach
   raw CSV content containing non-synthetic data.
8. For support lookup, use only `p2list-uat-support-correlation`, the exact
   correlation authorized by the generated server-owned support actor scope.
9. Classify every deviation as `blocker`, `must-fix`, or `post-UAT`.
10. Record one formal verdict: `Accepted`, `Conditional`, or `Blocked`.
11. Update #418 and #410 only after the human verdict and all blocker/must-fix
    findings are linked.

## Finding Record

Each finding must include:

- scenario ID;
- tester and execution date;
- tested commit;
- actor and tenant/environment;
- route and viewport;
- expected and actual result;
- correlation ID and evidence version;
- screenshot, trace, API, audit, or export evidence reference;
- cleanup status;
- severity: `blocker`, `must-fix`, or `post-UAT`;
- outcome: `Completed`, `Blocked`, `Workaround`, `Defect`, or
  `Post-UAT backlog`;
- linked GitHub Issue when action remains.

## Exit Rule

The automated bounded UAT candidate is Go and the current-head list screenshots
have been regenerated and visually inspected. Formal closeout remains blocked
until a named human operator:

1. executes every scenario on the recorded current head;
2. records all required evidence fields;
3. links every blocker and must-fix finding;
4. records `Accepted`, `Conditional`, or `Blocked`;
5. confirms that the result is bounded/non-production acceptance only.

Even an `Accepted` human verdict does not approve production-like readiness or
go-live.
