# HRCore

Open-source HR core system for identity-driven employee lifecycle management, onboarding workflows, approvals, audit trails, and HR-to-IdP automation.

This repository is currently at the baseline seed stage. It provides the minimum Fastify, Drizzle, and OpenAPI-first structure needed for later phases without implementing Phase 1 HR business workflows.

The initial backend stack decision is recorded in [ADR 0001: Initial Backend Stack](docs/adr/0001-initial-backend-stack.md). Fastify and Drizzle are the frozen PoC/MVP-A baseline unless a later accepted ADR supersedes that decision. The initial policy-as-code CI strategy is recorded in [ADR 0002: Policy-as-Code CI Strategy](docs/adr/0002-policy-as-code-ci-strategy.md). The MVP-A core stability contract is recorded in [ADR 0003: MVP-A Core Stability Contract](docs/adr/0003-mvp-a-core-stability-contract.md).

## Baseline structure

- `src/app.ts` builds the Fastify application.
- `src/server.ts` starts the local HTTP server.
- `src/app.test.ts` contains the initial smoke tests.
- `openapi/hrcore.openapi.json` is the baseline OpenAPI contract source.
- `src/persistence/schema.ts` is the Drizzle schema entry point for later issues.
- `drizzle/` is the Drizzle migration output directory.
- `drizzle.config.ts` is a local Drizzle Kit configuration that defaults to a local SQLite file under `.local/`.
- `npm run db:check` runs the committed Drizzle Kit CLI against the local migration configuration.
- `docs/adr/0000-adr-process.md` defines ADR numbering, approver metadata, two-key handling, and precedence rules.
- `docs/adr/template.md` is the template for future ADRs.

## Local verification

Install dependencies from a clean checkout using the committed lockfile:

```sh
npm ci
```

Run the canonical local pre-PR verification command:

```sh
npm run verify:pre-pr
```

This is the repo-owned contract for supervised PR readiness before GitHub Actions
and branch protection are added in issue #64. It runs:

- TypeScript build: `npm run build`
- Smoke tests: `npm test`
- Formatting check: `npm run format:check`
- Dependency audit: `npm run audit`
- Drizzle migration/config check: `npm run db:check`

The command does not require provider credentials, a production database, cloud
accounts, HR provider services, or workstation-local paths. `npm run audit`
uses the configured npm registry for vulnerability data, so the canonical
command is not an offline-only check. The Drizzle check uses the local SQLite
default from `drizzle.config.ts` unless `DATABASE_URL` is set.

The individual checks remain available for focused local reproduction:

```sh
npm run build
npm test
npm run format:check
npm run audit
npm run db:check
```

Start the local server:

```sh
npm run dev
```

The smoke baseline exposes `GET /health` and `GET /openapi.json`. It does not require provider credentials, a production database, or any external service.
