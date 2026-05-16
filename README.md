# HRCore

Open-source HR core system for identity-driven employee lifecycle management, onboarding workflows, approvals, audit trails, and HR-to-IdP automation.

This repository is currently at the baseline seed stage. It provides the minimum Fastify, Drizzle, and OpenAPI-first structure needed for later phases without implementing Phase 1 HR business workflows.

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

Build the TypeScript project:

```sh
npm run build
```

Run the smoke tests:

```sh
npm test
```

Check formatting:

```sh
npm run format:check
```

Check the Drizzle migration configuration without requiring a production database:

```sh
npm run db:check
```

Start the local server:

```sh
npm run dev
```

The smoke baseline exposes `GET /health` and `GET /openapi.json`. It does not require provider credentials, a production database, or any external service.
