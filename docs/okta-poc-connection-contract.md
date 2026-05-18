# Okta PoC Connection Contract

This document defines the Phase 1 Okta mastering PoC connection mode. It is a
documentation and configuration contract only.

The runnable PoC default is mock-first. codex-supervisor and local pre-PR
verification must run without a real Okta tenant, provider credentials,
protected real employee data, or an external service dependency.

Only synthetic or sanitized identity lifecycle data may be used in committed
fixtures, examples, tests, and documentation. Committed examples must stay
clearly artificial and must not be copied from a real employee record, Okta
tenant export, HRIS export, production backup, or customer data source.

Real Okta verification tenant binding is operator-local only. When a repository
operator later binds a verification tenant, the values must be supplied through
local environment variables or local-only untracked configuration:

- `HRCORE_OKTA_BASE_URL`: base URL for the verification tenant, using a
  placeholder such as `<okta-verification-tenant-url>` in committed docs.
- `HRCORE_OKTA_CLIENT_ID`: client identifier for the local verification app,
  using `<okta-client-id>` in committed docs.
- `HRCORE_OKTA_CLIENT_SECRET`: client secret value for the local verification
  app, using `<okta-client-secret>` in committed docs.

Do not commit tenant URLs, client secret values, API token values, exported
tenant metadata, `.env` files, or real employee records. Missing or placeholder
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

This contract does not implement the Okta adapter, OpenAPI endpoints, database
migrations, production secret handling, protected-data handling paths, or
provider writeback runtime behavior.

ADR 0005 through ADR 0020 remain Proposed unless their own files contain
completed ADR 0000 two-key evidence.
