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

   The generated dataset contains 101 employees in one meaningfully filterable
   organization scope, nested search-prefix groups of 25, 26, and 100 rows,
   plus one submitted onboarding, transfer, and termination request. It also
   contains four bounded audit events across three exact support correlation
   handles.

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
   named support and UAT export-denial correlations. Browser persona state is
   not authorization.

7. Do not edit or reuse generated tokens outside this repository-owned local
   synthetic run. Re-run `npm run setup:p2list:uat` to reset the dataset.
8. Record the tested commit with `git rev-parse HEAD`.
9. Run the focused verifier before manual execution:

   ```sh
   npm run verify:p2list:uat
   ```

## Executable Dataset Handles

Use these exact repository-owned synthetic handles during formal UAT:

| Purpose                         | Input                                            | Expected rows/result                         |
| ------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| Equal-sort 25-row traversal     | `q=UAT-G100-G26-G25`, sort by `hireDate`         | 25 employees                                 |
| Equal-sort 26-row traversal     | `q=UAT-G100-G26`, sort by `hireDate`             | 26 employees                                 |
| Equal-sort 100-row traversal    | `q=UAT-G100`, sort by `hireDate`                 | 100 employees                                |
| Over-cap bounded export         | `organizationCode=ORG-UAT-OVER-CAP`              | 101 rows; export denied over cap             |
| Formula-safe one-row export     | `employeeId=EMP-001`                             | `position_code` source value starts with `=` |
| Empty collection                | `employeeId=EMP-NOT-PRESENT`                     | 0 employees                                  |
| One-row collection/detail       | `employeeId=EMP-001`                             | 1 employee                                   |
| Three normalized lifecycle rows | unfiltered lifecycle list                        | onboarding, transfer, termination            |
| Exact list-action evidence      | `p2list-ui-00000000-0000-4000-8000-000000000701` | 1 bounded list event                         |
| Exact completed-export evidence | `p2list-ui-00000000-0000-4000-8000-000000000702` | requested and completed events               |
| Exact denied-export evidence    | `p2list-ui-00000000-0000-4000-8000-000000000703` | 1 bounded denial event                       |

The 25/26/100 groups share the same hire date, so sorting by `hireDate`
exercises deterministic tie-breaking. For P2LIST-UAT-08, apply the organization
filter before requesting CSV output with reason `uat_reconciliation`; the
collection is meaningfully filtered but exceeds the hard 100-row cap. The
synthetic `EMP-001` position code is `=1+1`, specifically so its successful
one-row CSV export can prove formula neutralization.

## Executable Authorization Checks

The WebUI intentionally hides employee and lifecycle routes from the approver
persona before an API request is made. In a third shell, source the generated
API environment and execute the server-authoritative denial checks directly:

```sh
source .local/p2list-uat/api-environment.sh
curl --silent --show-error --include \
  --header "Authorization: Bearer ${P2LIST_UAT_APPROVER_TOKEN}" \
  "http://127.0.0.1:3000/employees?limit=25"
curl --silent --show-error --include \
  --header "Authorization: Bearer ${P2LIST_UAT_APPROVER_TOKEN}" \
  "http://127.0.0.1:3000/employees/EMP-001?asOf=2026-07-01"
curl --silent --show-error --include \
  --header "Authorization: Bearer ${P2LIST_UAT_APPROVER_TOKEN}" \
  "http://127.0.0.1:3000/lifecycle/transaction-requests?limit=25"
curl --silent --show-error --include \
  --header "Authorization: Bearer ${P2LIST_UAT_APPROVER_TOKEN}" \
  "http://127.0.0.1:3000/lifecycle/transaction-requests/p2list-transaction-001"
```

Each response must be `403 permission_denied` and must not contain `items`,
`item`, employee identifiers, or lifecycle identifiers.

## Executable Request-Identity Retry Check

The generated WebUI environment enables a one-shot, repository-owned UAT
harness. It is inert unless explicitly armed in browser session storage and is
absent from ordinary WebUI startup environments. The generated environment sets
`VITE_P2LIST_UAT_RESPONSE_DROP_MODE=response_drop_once`; do not set that value
outside this bounded local UAT run.

1. Open browser developer tools, select Network, enable Preserve log, and filter
   requests to `exports/employee-list`.
2. As HR operator, filter Employees by `EMP-001`, open CSV output, and select
   reason `uat_reconciliation`.
3. In the Console, arm exactly one accepted-response drop:

   ```js
   sessionStorage.setItem(
     "hrcore.p2list.uat.drop-next-export-response",
     "armed",
   );
   ```

4. Submit the export. The API must receive and complete the request; the
   one-shot client boundary then consumes and discards that response before
   returning it to the workflow. Record the first request's
   `x-hrcore-correlation-id` as `A` and confirm the WebUI reports a network
   failure.
5. Without changing the filter or reason, submit again. The second outgoing
   correlation must equal `A`, and the CSV must download. The session-storage
   arm must already be absent.
6. Filter by `ORG-UAT-OVER-CAP` and submit the same reason twice. The first
   completed `422 export_row_limit_exceeded` response has correlation `B`; the
   next attempt must use a different correlation `C`.

This distinguishes an uncertain caller result after server acceptance from a
completed server denial. Do not use browser offline mode as a substitute,
because it does not prove that the server accepted the request.

## Executable Export Checks

For P2LIST-UAT-07, export `EMP-001` with reason `uat_reconciliation`. The
download must use schema `p2list_export_v1`, contain one row, and serialize the
`position_code` cell as `'=1+1`. Also export lifecycle requests filtered by
`ORG-LIFECYCLE-SYNTHETIC`; its schema and row count must remain bounded.

The WebUI intentionally blocks malformed export input before transport. To test
the server-owned P2LIST-UAT-08 denial paths, source the API environment and run:

```sh
source .local/p2list-uat/api-environment.sh
export P2LIST_UAT_API_BASE=http://127.0.0.1:3000

p2list_uat_export() {
  correlation_id=$1
  payload=$2
  curl --silent --show-error --include \
    --header "Authorization: Bearer ${P2LIST_UAT_HR_OPERATOR_TOKEN}" \
    --header "Content-Type: application/json" \
    --header "Accept: text/csv" \
    --header "x-hrcore-correlation-id: ${correlation_id}" \
    --data "${payload}" \
    "${P2LIST_UAT_API_BASE}/exports/employee-list"
}

p2list_uat_export p2list-ui-00000000-0000-4000-8000-000000000801 \
  '{"filters":{},"reasonCode":"uat_reconciliation"}'
p2list_uat_export p2list-ui-00000000-0000-4000-8000-000000000802 \
  '{"filters":{"organizationCode":"ORG-UAT-OVER-CAP"},"reasonCode":"uat_reconciliation"}'
p2list_uat_export p2list-ui-00000000-0000-4000-8000-000000000803 \
  '{"filters":{"employeeId":"EMP-001"},"reasonCode":"uat_reconciliation","columns":["employeeId","rawPayload"]}'
p2list_uat_export p2list-ui-00000000-0000-4000-8000-000000000804 \
  '{"filters":{"employeeId":"EMP-001"}}'
```

The four responses must respectively be:

| Correlation                                      | HTTP | Code                          |
| ------------------------------------------------ | ---- | ----------------------------- |
| `p2list-ui-00000000-0000-4000-8000-000000000801` | 422  | `export_filter_required`      |
| `p2list-ui-00000000-0000-4000-8000-000000000802` | 422  | `export_row_limit_exceeded`   |
| `p2list-ui-00000000-0000-4000-8000-000000000803` | 422  | `export_field_denied`         |
| `p2list-ui-00000000-0000-4000-8000-000000000804` | 400  | `export_reason_code_required` |

Every response must be JSON with no CSV payload or raw filter value.
Its `x-hrcore-correlation-id` response header must exactly echo the supplied
UUID-form UAT correlation.

## Executable Support Evidence Checks

The current WebUI audit workflow is static and does not call the bounded support
endpoint. After the export-denial commands above, execute P2LIST-UAT-09 against
the same API:

```sh
for correlation_id in \
  p2list-ui-00000000-0000-4000-8000-000000000701 \
  p2list-ui-00000000-0000-4000-8000-000000000702 \
  p2list-ui-00000000-0000-4000-8000-000000000703 \
  p2list-ui-00000000-0000-4000-8000-000000000801 \
  p2list-ui-00000000-0000-4000-8000-000000000802 \
  p2list-ui-00000000-0000-4000-8000-000000000803 \
  p2list-ui-00000000-0000-4000-8000-000000000804
do
  curl --silent --show-error --include \
    --header "Authorization: Bearer ${P2LIST_UAT_SUPPORT_TOKEN}" \
    "${P2LIST_UAT_API_BASE}/support/p2list/audit-evidence/${correlation_id}"
done
```

Each response must be `200`, contain exactly the requested correlation, and
contain no broad-search result or raw employee row. The three seeded handles
prove one list action, a requested/completed export pair, and one denied export.
Each runtime denial handle proves one `bounded_export.denied` event with the
expected denial code. Every returned `dataScopeId` and non-null
`filterFingerprint` must match `^[A-Za-z0-9_-]{43}$`; no raw organization code,
query, or filter value may appear.

## Executable Cursor Failure And Concurrent-Change Checks

Stop any API process using the generated fixture, then run P2LIST-UAT-10 from
the tested checkout:

```sh
npm --silent run verify:p2list:uat:cursor \
  | tee .local/p2list-uat/cursor-evidence.json
```

The command creates an isolated copy of the repository-owned fixture and calls
the real `GET /employees` route with the generated HR operator. It executes
these bounded API steps:

1. obtain a page-1 cursor for `q=UAT`, `sort=employeeId`, `direction=asc`, and
   `limit=25`;
2. append a byte to that opaque cursor and require `400 cursor_invalid`;
3. reuse the original cursor with `q=UAT-G100-G26` and require
   `400 cursor_filter_mismatch`;
4. after page 1 has returned `EMP-001` through `EMP-025`, change only that
   already-returned synthetic `EMP-025` source row to `EMP-000`, then traverse
   every remaining cursor and require the accepted `EMP-001` through `EMP-101`
   snapshot to contain exactly 101 unique rows with no omission or duplicate;
5. obtain a fresh cursor, advance the verifier-owned clock by the contract TTL
   of 900 seconds plus one millisecond, and require `400 cursor_invalid`.

The clock is passed directly to the in-process UAT runtime; no production
environment variable, HTTP clock-control endpoint, or authorization bypass is
created. The command removes its isolated database after completion. Preserve
the JSON output as the operator evidence and require exactly:

```json
{
  "cursorTtlSeconds": 900,
  "tampered": { "statusCode": 400, "code": "cursor_invalid" },
  "filterMismatch": {
    "statusCode": 400,
    "code": "cursor_filter_mismatch"
  },
  "concurrentChange": {
    "firstPageLastEmployeeId": "EMP-025",
    "pageCount": 5,
    "traversedRowCount": 101,
    "uniqueRowCount": 101,
    "omittedEmployeeIds": [],
    "duplicateEmployeeIds": [],
    "acceptedSnapshotPreserved": true
  },
  "expired": { "statusCode": 400, "code": "cursor_invalid" }
}
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
| P2LIST-UAT-09 | HR Ops/support | Look up each named exact authorized correlation                                                 | Action, API decision, export outcome, and denial evidence are linked without broad search      | audit observability suite                    | Pending      |
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
| Reproducible 101-row, lifecycle, persona, manifest, and support fixture  | `src/p2list-uat-fixture-setup.test.ts`                       |
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
8. For support lookup, use only the exact seeded and export-denial correlation
   handles listed in Executable Support Evidence Checks. The generated
   server-owned support scope authorizes those handles individually, not a
   prefix or broad search.
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
