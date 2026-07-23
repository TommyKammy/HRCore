# P2LIST-00 List API Contract, Data Classification, and Authorization Gate

Issue: #411  
Part of: #410  
Depends on: #405  
Review scope: bounded employee and lifecycle collection contracts, field classification, authorization, export, cursor, and audit evidence only

## Scope Boundary

- OpenAPI-first collection and bounded export contract: Allowed.
- Shared TypeScript allowlists and policy constants: Allowed.
- Repository-owned synthetic/non-production data: Allowed.
- Runtime endpoint, query repository, WebUI, and export implementation: Deferred to #412 through #416.
- Production identity and actor-context authority: Blocked.
- Real employee data: Blocked.
- Production authorization/RLS: Blocked.
- Unrestricted search and arbitrary query expressions: Blocked.
- Raw payload, free-form note, attachment, and sensitive-field access: Blocked.
- Broad, scheduled, or long-lived export: Blocked.
- Production audit immutability and retention: Blocked.
- Legal/privacy, two-key, go-live, and production-like readiness approval: Blocked.

This gate freezes a bounded contract that later child issues can implement
without inventing authorization, field, pagination, export, or audit semantics.
It does not add runtime routes and does not authorize production operation.

## Authoritative Data Mapping

The v1 employee projection uses current repository-owned columns:

| API field          | Authoritative bounded source                   |
| ------------------ | ---------------------------------------------- |
| `personId`         | `person.id`                                    |
| `employeeId`       | `employment.employment_code`                   |
| `displayName`      | `person.display_name`                          |
| `employmentStatus` | `employment.status_code`                       |
| `organizationCode` | effective-dated `assignment.organization_code` |
| `positionCode`     | effective-dated `assignment.position_code`     |
| `hireDate`         | `employment.start_date`                        |
| `terminationDate`  | `employment.end_date`                          |

`employmentType`, department ID/name, job title, and generic `updatedAt` are
deferred because the current schema has no authoritative source for them.
Later implementations must not synthesize those values or infer them from
display text, notes, payload JSON, audit summaries, or frontend fixtures.
An employment row is eligible only when
`employment.start_date <= asOf AND (employment.end_date IS NULL OR
employment.end_date >= asOf)`. This predicate is applied before authorization
scope, sorting, and cursor generation; ineligible historical or future
employments are not projected.
`organizationCode` and `positionCode` are nullable when no assignment is
effective for the requested `asOf` date. An employment must have at most one
assignment whose start/end interval contains `asOf`. If more than one
assignment is effective, the query fails closed with `data_scope_denied`
before authorization scope evaluation or projection; it must not choose an
arbitrary assignment or emit duplicate employee rows.

The lifecycle projection normalizes persisted `hire` to `onboarding`, both
`change` and `transfer` to `transfer`, and `terminate` to `termination`. It may
join directly linked workflow evidence for decider, effective date, and allowed
actions, but it must not expose type-specific raw payloads in a collection
response. `requestedBy` is deferred because `transaction_request` has no
immutable requester actor column or request-creation audit relation;
implementations must not infer it from later audit events or payload content.
Because `transaction_request` currently links only to
`person_id`, `subjectEmployeeId` may be projected, filtered, scoped, or
exported only from an unambiguous employment resolution. Zero employments
project `subjectEmployeeId: null` and never match a `subjectEmployeeId` filter.
Exactly one employment projects its employment code. Multiple employments fail
closed with `data_scope_denied` before filter, scope, projection, or export;
implementations must not infer an employment from payload JSON, display text,
request type, or an arbitrary join order.

Lifecycle `organizationCode` has one authoritative request-time relation:

- onboarding: the validated `mvp_a_onboarding_v1` payload assignment
  `departmentReference`, which becomes the target assignment organization at
  `effectiveDate`;
- transfer: the validated `mvp_b_transfer_v1` payload
  `targetAssignment.organizationReference`, representing the target
  organization at `effectiveDate`;
- termination: the persisted `organization_code` of the exact assignment ID
  and code referenced by the validated termination payload, effective on the
  day immediately before `effectiveDate`.

The same resolved value is mandatory for projection, `organizationCode`
filtering, query-layer authorization scope, and export. Missing, malformed,
mismatched, or ambiguous organization evidence fails closed with
`data_scope_denied` before any row is returned. Payloads are parsed through
their versioned validators and raw payload content remains prohibited in list
or export output.

## Synthetic Provenance Gate

The readiness label is not provenance. Before any list query, projection, or
export, the server must load a trusted dataset manifest with evidence type
`repo_owned_synthetic_fixture`, a concrete `datasetReference`,
`tenantEnvironmentId` equal to `repo_owned_synthetic_p2list`, and source-row
primary-key bindings for `person`, `employment`, `assignment`, and
`transaction_request`. Every selected source primary key must belong to that
verified manifest dataset and tenant/environment.

Employee operations always require bound `person` and `employment` rows;
`assignment` evidence is required only when an effective assignment row is
selected. Lifecycle request operations always require bound
`transaction_request` and `person` rows. `employment` evidence is additionally
required only when an employment row is selected for subject resolution, and
`assignment` evidence only when an assignment row is selected for organization
resolution. Pending onboarding requests therefore do not require employment or
assignment rows that do not yet exist. A source not joined by a result is not
an artificial prerequisite, but every source row actually selected must pass
manifest membership verification.

The manifest binds `person.id`, `employment.id`, `assignment.id`, and
`transaction_request.id` sets explicitly. Its canonical JSON is authenticated
with HMAC-SHA-256 using a server-injected, non-default local/test secret before
row membership is evaluated. Missing fields, duplicate source keys, an invalid
MAC, or an unlisted selected row fail closed.
The manifest body, source-row primary-key sets, and integrity value must never
be written to application, audit, access, or support logs.

Client headers, request parameters, payload `tenantEnvironmentId` markers, and
the `bounded_synthetic_only_not_production_ready` label are not sufficient
provenance. Missing or mismatched manifest evidence fails closed with
`data_scope_denied` before query, projection, or export. Until a runtime child
implements this server-owned manifest and row-membership check, these
operations remain `contract_only`.

## Employee Collection Contract

Path: `GET /employees`

Allowed filters:

- `q`: employee ID or display-name prefix, trimmed length 2 through 100;
  leading/trailing whitespace, control whitespace, wildcard, and regex syntax
  fail closed.
- `employeeId`: exact employment code.
- `employmentStatus`: `active`, `inactive`, or `terminated`.
- `organizationCode`: exact code within the server-resolved actor scope.
- `asOf`: ISO date used for effective-dated employment and assignment joins.
  When omitted, the server resolves the initial request acceptance date as a
  UTC calendar date, returns it in `appliedFilters`, and includes it in the
  canonical cursor filter fingerprint and the non-PII `resolvedAsOf`
  server-side cursor state. Continuations reuse that cursor-bound value; a
  different explicit `asOf` fails with `cursor_filter_mismatch`.

Allowed sort fields are `employeeId`, `displayName`, and `hireDate`. The
default order is `employeeId ASC, employment.id ASC`; the non-projected
`employment.id` primary key is the stable unique tie-breaker for every employee
sort and is encoded only inside the opaque cursor.

Unsupported fields, SQL wildcard characters (`%` and `_`), regex
metacharacters, wildcard/regex operators, offset, arbitrary SQL/JSON
expressions, and unbounded total count fail closed.
The operation-level query schema rejects every parameter not present in the
allowlist; implementations must not silently ignore unknown query names.

## Lifecycle Collection Contract

Path: `GET /lifecycle/transaction-requests`

Allowed filters:

- `requestType`: onboarding, transfer, or termination.
- `status`: draft, submitted, returned, rejected, cancelled, approved, or completed.
- `subjectEmployeeId`: exact employment code.
- `q`: request ID, employee ID, or display-name prefix, trimmed length 2 through
  100; leading/trailing whitespace, control whitespace, wildcard, and regex
  syntax fail closed.
- `organizationCode`: exact code within the server-resolved actor scope.
- `decidedBy`: exact decision actor ID when the actor has the required scope.
- `requestedFrom` and `requestedTo`: requested-at range.
- `effectiveFrom` and `effectiveTo`: effective-date range.
- `correlationId`: exact lookup for support actors with `support:correlation:read`.

Requested and effective range endpoints must be supplied as complete pairs.
One-sided ranges fail closed. Endpoints are normalized before comparison:
requested-at values compare as UTC instants and effective dates compare as ISO
calendar dates. Each start must be less than or equal to its end; reversed
ranges fail with `invalid_filter` before repository access and cannot bypass
the inclusive 366-day maximum.

Allowed sort fields are `requestedAt` and `effectiveDate`. The default order is
`requestedAt DESC, transactionRequestId DESC`; `transactionRequestId` is the
stable unique tie-breaker. Every RFC 3339 `requestedAt`, `requestedFrom`, and
`requestedTo` value is converted to its UTC instant and canonical
`YYYY-MM-DDTHH:mm:ss.sssZ` representation before filtering or comparison.
`requestedAt` cursor sort values use the same representation; SQLite text
ordering of unnormalized offsets is prohibited.

Date ranges may span at most 366 days. Collection DTOs carry only list-safe
fields and detail route identifiers, not type-specific payloads.
The operation-level query schema rejects unknown parameters and enforces both
range pairs before repository access.

## Pagination and Cursor

- Default page size: 25.
- Maximum page size: 100.
- Offset pagination: prohibited.
- Wire format: opaque HMAC-authenticated CSPRNG handle with at least 128 bits of
  entropy. The wire token carries only version, random state ID, and expiry.
- Maximum wire length: 2048 characters.
- Version: `p2list_cursor_v1`.
- Integrity: HMAC-SHA-256.
- Server-side state TTL: 15 minutes; expired or missing state fails closed, and
  state is deleted after expiry.
- Filter fingerprint: SHA-256 over canonical allowlisted JSON, including
  server-resolved defaults such as employee `asOf`.
- Server-side state fields: resource, sort, direction, last sort value, explicit
  `lastSortValueIsNull`, last stable ID, canonical filter fingerprint, and
  authorization-context fingerprint; employee state additionally requires
  non-PII `resolvedAsOf`.
- Authorization-context fingerprint: SHA-256 over canonical server-resolved
  actor ID, tenant ID, permissions, and data scope. Any mismatch fails closed.
- Sensitive sort values such as `displayName` remain only in server-side state
  and must never be written to application, audit, access, or support logs.
- Nullable `effectiveDate` ordering: nulls are always last for both directions; non-null rows precede the null partition, whose rows continue by stable ID in the requested direction.
- Page metadata: `hasNextPage: true` requires an authenticated non-null `nextCursor`; `false` requires `nextCursor: null`.
- Rejected states: malformed, tampered, expired, missing server state,
  unsupported version, resource mismatch, filter mismatch, sort mismatch,
  direction mismatch, and authorization-context mismatch.
- Public error mapping: unsupported version uses
  `cursor_version_unsupported`; canonical filter mismatch, including explicit
  employee `asOf` drift, uses `cursor_filter_mismatch`; authorization-context
  mismatch uses `permission_denied`; every other cursor rejection above uses
  `cursor_invalid`.
- PII and raw search terms: prohibited in the wire token.
- Local/test key: injected, non-default, and fail-closed when absent.
- Production key custody and rotation: blocked pending owner-approved production prerequisites.

## Error Contract

Collection APIs use the versioned `P2ListErrorResponse` and the following
status families:

- `400`: invalid/unsupported filter or sort, limit overflow, over-wide range,
  malformed/tampered/expired cursor, missing cursor state, unsupported cursor
  version, or cursor/filter mismatch.
- `401`: server-side actor context is absent or invalid.
- `403`: permission, data-scope, or cursor authorization-context decision
  denies the operation without revealing whether a target record exists.
- `422`: bounded export policy rejects an empty filter, over-100-row result,
  missing/unsupported reason code, or prohibited export field.

Error messages are generic, at most 200 characters, and must not include target
IDs, display names, raw filters, raw cursors, scope internals, or record counts.

## Authorization Matrix

Frontend persona state controls presentation only. The server-resolved actor,
permissions, and data scope are authoritative.

| Persona        | Employee list          | Lifecycle list         | Employee export                    | Lifecycle export                   |
| -------------- | ---------------------- | ---------------------- | ---------------------------------- | ---------------------------------- |
| HR operator    | assigned organization  | assigned organization  | permission + assigned organization | permission + assigned organization |
| Approver       | hidden/denied          | hidden/denied          | denied                             | denied                             |
| HR Ops/support | assigned support scope | assigned support scope | permission + support scope         | permission + support scope         |
| Bounded admin  | hidden/denied          | hidden/denied          | denied                             | denied                             |

Approver lifecycle listing remains deferred and fail-closed because the current
schema has no authoritative current-approver assignment relation. It is hidden
and denied rather than scoped from later decision audit events.
HR operator and HR Ops/support receive only the list-safe fields defined below,
never raw/detail payload fields.

Permissions:

- `employee:list:read`
- `employee:list:export`
- `lifecycle-request:list:read`
- `lifecycle-request:list:export`
- `support:correlation:read`
- `mvp_d.synthetic_csv_download`

Every read and export requires both permission and a supported data scope.
Export additionally requires the corresponding list-read permission, the
resource-specific export permission, and `mvp_d.synthetic_csv_download`.
Filtering lifecycle data by `correlationId` additionally requires
`support:correlation:read`.
Missing actor context, unknown scope/operator, unsupported field, policy parse
failure, or missing effective-date context denies access. Query-layer scope
predicates are mandatory; post-fetch filtering is not sufficient. PostgreSQL
RLS is not the authorization source of truth.

## Field Classification

Employee list fields:

- `personId`, `employeeId`, `displayName`, `employmentStatus`
- `organizationCode`, `positionCode`, `hireDate`, `terminationDate`

Lifecycle list fields:

- `transactionRequestId`, `requestType`, `status`
- `subjectPersonId`, `subjectEmployeeId`, `subjectDisplayName`
- `organizationCode`, `decidedBy`
- `requestedAt`, `effectiveDate`, `allowedActions`

`requestedBy`, current approval step/assignee, and generic `updatedAt` remain
deferred until authoritative immutable sources are introduced.

Always denied from list/export/audit surfaces:

- raw/provider payloads
- notes, memos, attachments, and free-form text
- contact points, personal email, phone, and address
- bank, tax, My Number, health, disability, specific personal information,
  and sensitive personal information
- real-data markers, broad-search controls, and broad-export controls

## Bounded Export Contract

Paths:

- `POST /exports/employee-list`
- `POST /exports/lifecycle-request-list`

Rules:

- Schema version: `p2list_export_v1`.
- Delivery: synchronous `text/csv` for at most 100 bounded synthetic rows.
- A meaningful server-validated anchor filter is required. Employee export
  requires `employeeId` or `organizationCode`. Lifecycle export requires
  `subjectEmployeeId`, `organizationCode`, support-authorized `correlationId`,
  a complete requested-at range, or a complete effective-date range.
- `q`, status, request type, employment status, or `asOf` alone does not
  authorize export.
- A required allowlisted `reasonCode` is one of `uat_reconciliation`,
  `operational_reconciliation`, `authorized_case_support`, or
  `data_quality_investigation`.
- Free-form export reasons are prohibited and must not be persisted in audit
  events.
- The server re-evaluates the canonical filters and actor scope and never
  accepts client-provided rows or arbitrary columns.
- Results over 100 rows are rejected, never silently truncated.
- Employee and lifecycle export permissions are separate and both require the
  existing bounded CSV download permission.
- Server-owned versioned column allowlists and spreadsheet formula-injection
  protection are mandatory.
- Scheduled export, email delivery, production object storage, long-lived
  tokens/artifacts, and production custody remain blocked.

## Audit Contract

Version: `p2list_audit_v1`.

Required event families cover employee/lifecycle list view, search, page,
detail navigation, export requested/completed/denied, and authorization denied.
Detail-open evidence is emitted from a successful authorized detail API
response, not from unauthenticated or client-only telemetry.

Allowed audit fields are stable IDs, version, timestamp, actor ID/role,
evaluated permission, canonical data-scope ID, filter fingerprint, sort, page
size, row count, resource type, correlation ID, policy decision, reason code,
and export schema version.

Audit, logs, and metrics must not contain display names, raw search terms, raw
queries, raw cursors, CSV content, raw/provider payloads, or free-form reason
text.

## ADR and Owner-Decision Boundary

ADR 0011, ADR 0013, and ADR 0014 remain Proposed and do not provide production
approval. This bounded contract follows their fail-closed direction while
leaving the following decisions blocked:

- production identity and authoritative actor-context construction
- final production data-scope DSL, tenancy/session binding, and RLS defense-in-depth
- production cursor/export key custody and rotation
- exact production masking, watermark, retention, and download-log design
- audit immutability, WORM/Object Lock, compliance archive, and legal hold
- legal/privacy, data-owner, security, operations, architecture, and two-key approval

## Verification

Focused:

```sh
npm test -- --test-name-pattern "P2LIST-00"
```

Final:

```sh
npm run verify:pre-pr
```

The result is contract and policy evidence only. Runtime endpoints, read
repositories, WebUI lists, export execution, audit persistence, formal UAT,
production operation, and production-like readiness remain outside #411.
