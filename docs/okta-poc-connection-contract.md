# Okta PoC Connection Contract

This document defines the Phase 1 Okta mastering PoC connection mode. It is a
documentation and configuration contract only.

The runnable PoC default is mock-first. codex-supervisor and local pre-PR
verification must run without a live Okta tenant, provider credentials,
protected personnel data, or an external service dependency.

Only synthetic or sanitized identity lifecycle data may be used in committed
fixtures, examples, tests, and documentation. Committed examples must stay
clearly artificial and must not be copied from a live personnel record, Okta
tenant export, HRIS export, production backup, or customer data source.

Real Okta verification tenant binding is operator-local only. When a repository
operator later binds a verification tenant, the values must be supplied through
local environment variables or local-only untracked configuration:

- `HRCORE_<provider>_BASE_URL`: base URL for the verification tenant, using a
  placeholder such as `<okta-verification-tenant-url>` in committed docs.
- `HRCORE_<provider>_CLIENT_ID`: client identifier for the local verification app,
  using `<okta-client-id>` in committed docs.
- `HRCORE_<provider>_CLIENT_SECRET`: client secret value for the local verification
  app, using `<okta-client-secret>` in committed docs.

Do not commit tenant URLs, credential values, bearer-token values, exported
tenant metadata, `.env` files, or live personnel records. Missing or placeholder
credentials are not valid credentials and must keep real-provider execution
blocked until a trusted local credential source is wired in.

## Minimum synthetic Okta user fixture shape

Later adapter and projection issues may use a synthetic fixture with these
minimum fields:

- `externalId`: stable synthetic Okta-side user identifier.
- `employeeNumber`: stable synthetic HR-side employee number.
- `email`: non-deliverable synthetic email address.
- `displayName`: artificial display name.
- `givenName`: artificial given name.
- `familyName`: artificial family name.
- `status`: one of `active`, `staged`, `suspended`, or `deprovisioned`.
- `departmentCode`: artificial department or organization code.
- `managerExternalId`: optional synthetic manager identifier.
- `effectiveAt`: ISO-8601 timestamp used to order create, update, and disable
  projection examples.

The shape is intentionally limited to identity lifecycle projection fields for
create, update, and disable behavior. It does not authorize storage of My
Number, Specific Personal Information, sensitive personal information, raw
provider payloads, customer exports, legal/labor leave details, retiree
retention details, emergency access credentials, or broad metadata escape
hatches.

## Minimum synthetic Okta group projection scope

The Phase 1 PoC may project synthetic user membership into a predeclared
synthetic group set only. The minimum group projection surface is:

- `groupKey`: stable synthetic HRCore-side group key.
- `externalId`: stable synthetic Okta-side group identifier.
- `displayName`: artificial group display name.
- `purpose`: fixed to `poc_identity_lifecycle_membership`.
- `effectiveAt`: ISO-8601 timestamp used to order membership projection
  examples.

The only in-scope group operation is `replace_user_groups` for a synthetic
employee identity already present in the mock adapter. It replaces that user's
synthetic membership set, is idempotent for an identical set, and fails closed
when a projection references a group key outside the predeclared synthetic
group set.

Group projection in this PoC is not authorization. It does not implement RBAC,
data-scope policy evaluation, approval routing, entitlements, group creation,
group deletion, group hierarchy, group rules, production Okta group management,
real tenant group sync, or database-backed tenant group state. ADR 0011 and ADR
0013 remain Proposed anchors for later authorization and approval boundaries
only.

This contract does not implement the Okta adapter, OpenAPI endpoints, database
migrations, production secret handling, protected-data handling paths, or
provider writeback runtime behavior.

ADR 0005 through ADR 0020 remain Proposed unless their own files contain
completed ADR 0000 two-key evidence.
