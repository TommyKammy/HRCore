# ADR 0002: Policy-as-Code CI Strategy

## Status

Accepted

## Date

2026-05-17

## Decision owners

- Author: TommyKammy
- Approver: TommyKammy
- Counter-approver: Not required because this baseline defines documented CI inspection strategy and repository guard discoverability without enabling, weakening, or bypassing runtime security, identity, authorization, tenant boundaries, auditability, data retention, production operations, external provider trust, irreversible migration shape, or compliance evidence.
- Time-locked review window: Not required because this decision does not require two-key handling.

## Depends on ADRs

- [ADR 0000: Architecture Decision Record Process](0000-adr-process.md)
- [ADR 0001: Initial Backend Stack](0001-initial-backend-stack.md)

## Context

HRCore is still at the baseline seed stage. Future Phase 0 work will add migrations, HR data contracts, authorization surfaces, and privacy-sensitive persistence paths. Before those surfaces expand, the repository needs a durable policy-as-code CI strategy for prohibited columns, PII raw payload persistence, and export permission checks.

The strategy must be narrow enough to review now and strong enough to prevent later work from treating issue bodies, comments, or ad hoc scripts as the policy authority. It also needs to avoid pulling in the #88 Future Extension prohibited payload rule set, cost controls, provider mocks, LocalStack or development AWS decisions, production secrets, external services, legal/privacy scope decisions, or Phase 1 HR workflows.

## Decision

HRCore will define policy-as-code CI as a repository-owned verification layer whose rule source is versioned in this repository and whose enforcement results are suitable for local `npm run verify:pre-pr` and later CI integration.

The initial inspection surfaces are:

- `*.sql` files anywhere in the repository.
- `migrations/*` entries and the Drizzle migration output directory.
- `src/**/*.ts` TypeScript source, including Drizzle schema metadata and application authorization code.
- OpenAPI schema files, currently represented by `openapi/**/*.json` and any later `openapi/**/*.yaml` or `openapi/**/*.yml` contract sources.
- PR diffs, limited to changed files and changed lines when diff-aware enforcement is introduced.

The initial policy rule families are:

- prohibited columns, such as columns that would persist sensitive cleartext, unscoped tenant identifiers, or future forbidden HR/person attributes outside an approved schema decision;
- PII raw payload persistence, meaning storage of unredacted provider request, response, webhook, import, export, or adapter payloads without an explicit accepted ADR and implementation boundary;
- export permission checks, meaning checks that export endpoints, export jobs, export schemas, and export-related code retain an explicit authorization boundary before producing employee, identity, audit, or HR workflow data.

The initial baseline is documentation plus repository guard tests. It must keep the ADR discoverable and verify that these inspection surfaces, rule families, and deferred-parser boundaries stay present. The baseline may use exact-text repository guards because this issue freezes the strategy rather than implementing the complete policy engine.

Regex checks are acceptable only for narrow lexical sentinels, such as banned column-name tokens, obvious raw-payload field names, or export-surface markers. Regex-only scanning must not be treated as sufficient for every future target surface.

SQL parsing is required before CI treats SQL or migration structure as authoritative. Future SQL and migration enforcement must parse statements or use a migration-aware structured representation before deciding whether a prohibited column exists, whether a column is renamed, or whether a table shape is compliant.

ORM metadata inspection is required before CI treats Drizzle schema shape as authoritative. Future TypeScript enforcement must inspect Drizzle table and column definitions through structured metadata or a TypeScript-aware analysis path before making schema decisions from `src/**/*.ts`.

OpenAPI schema inspection is required before CI treats request, response, or export contract shape as authoritative. Future API-contract enforcement must inspect schema objects, operation metadata, and export-related paths structurally instead of relying only on raw text search.

PR-diff-aware checks are required before CI limits findings to changed lines or new exposures. Until diff-aware checks exist, whole-repository guard checks remain the safer baseline for policy disappearances.

OPA/Rego is deferred until the first cross-surface policy needs shared rule evaluation. A later Accepted ADR or implementation issue may introduce OPA when a single policy must evaluate SQL or migration facts, ORM metadata facts, OpenAPI facts, and PR-diff facts together. This ADR does not require OPA for the initial documentation and guard-test baseline.

This ADR does not implement the #88 Future Extension prohibited payload rule set. Issue #88 remains responsible for deciding the concrete Future Extension payload rules, rule exceptions, and enforcement depth. This ADR only fixes the initial CI strategy, target surfaces, inspection approach, and rule-family boundaries.

## Consequences

- Future policy-as-code work has a stable strategy before implementation expands.
- Contributors can distinguish acceptable lexical sentinels from parser-backed enforcement requirements.
- The repository avoids treating regex-only checks as complete coverage for SQL, migrations, ORM metadata, OpenAPI contracts, or PR diffs.
- Guard tests provide a lightweight failure when the policy-as-code ADR or its core commitments disappear.
- The initial issue remains scoped to strategy and does not add production secrets, cloud dependencies, provider mocks, LocalStack decisions, cost-cap controls, external service dependencies, legal/privacy scope decisions, full OPA implementation, #88 Future Extension rules, or Phase 1 HR workflows.

## Supersedes

None

## Superseded by

None
