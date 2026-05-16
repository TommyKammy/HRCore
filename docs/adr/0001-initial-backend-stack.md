# ADR 0001: Initial Backend Stack

## Status

Accepted

## Date

2026-05-16

## Decision owners

- Author: TommyKammy
- Approver: TommyKammy
- Two-key reviewer: Not required because this decision freezes the initial application framework and ORM/migration baseline without changing security, identity, authorization, tenant boundaries, production operations, compliance evidence, or irreversible data shape.

## Context

HRCore is at the baseline seed stage for PoC and MVP-A readiness. The repository already contains a small Fastify application, an OpenAPI contract endpoint, a Drizzle schema entry point, Drizzle Kit configuration, and committed local verification commands.

The initial stack decision needs to be explicit before later issues add HR workflow behavior, provider integrations, migrations, or deployment-facing operations. Leaving the choice implicit in `package.json` dependencies would make future changes harder to review and would let generated summaries, issue bodies, or local implementation details drift from the architecture policy.

NestJS and Prisma are credible options for later phases, but adopting them now would add framework conventions, module structure, generated clients, migration behavior, and dependency surface before HRCore has enough domain implementation to justify that cost. The initial baseline should stay small, easy to inspect, and aligned with the existing seed.

## Decision

HRCore selects Fastify as the initial backend framework for PoC and MVP-A readiness.

HRCore selects Drizzle as the initial ORM and migration baseline for PoC and MVP-A readiness.

Fastify and Drizzle are frozen as the active initial backend stack for this baseline. New backend code, local verification, and migration scaffolding must stay aligned with this selected stack unless a later Accepted ADR supersedes this decision.

NestJS is deferred for the initial baseline. It must not be introduced as the application framework, module system, request lifecycle owner, dependency injection baseline, or routing baseline during the initial PoC/MVP-A work.

Prisma is deferred for the initial baseline. It must not be introduced as the ORM, schema authority, generated database client, migration owner, or local persistence baseline during the initial PoC/MVP-A work.

NestJS or Prisma may replace the selected baseline only through a later Accepted ADR that explicitly supersedes this ADR. A superseding ADR must state the migration reason, affected verification contract, migration boundary, rollout plan, and consequences for existing Fastify or Drizzle code.

This ADR freezes the backend framework and ORM/migration baseline only. It does not decide provider mocks, LocalStack or development AWS usage, issue-lint tooling, agent cost controls, production secrets, external service dependencies, or Phase 1 HR business workflows.

## Consequences

- Future contributors can find the active backend stack decision without inferring it from dependencies.
- Initial service work can stay focused on Fastify handlers, OpenAPI contract serving, and Drizzle migration readiness.
- NestJS and Prisma remain available for future reconsideration, but only through a newer Accepted ADR.
- Pull requests that introduce NestJS or Prisma for the initial baseline should be treated as architecture drift unless they include and depend on a superseding Accepted ADR.
- Verification should keep a lightweight repository guard that checks this ADR and the repository documentation pointer remain present.

## Supersedes

None

## Superseded by

None
