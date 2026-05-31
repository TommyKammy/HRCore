import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type { MvpAOnboardingEvidenceAuthorizationGate } from "./mvp-a-onboarding-evidence-authorization.js";
import type { MvpAOnboardingNonProductionDataGate } from "./mvp-a-onboarding-non-production-data-gate.js";
import type { MvpAOnboardingPiiExportGate } from "./mvp-a-onboarding-pii-export-gate.js";

export interface MvpAPolicyAsCodeInputs {
  piiExportGate: MvpAOnboardingPiiExportGate;
  evidenceAuthorizationGate: MvpAOnboardingEvidenceAuthorizationGate;
  nonProductionDataGate: MvpAOnboardingNonProductionDataGate;
  schemaTables: readonly SQLiteTable[];
  migrationSqlByPath: ReadonlyMap<string, string>;
  openApiContract: OpenApiContract;
  fixtureSeedTextByPath: ReadonlyMap<string, string>;
  documentationTextByPath: ReadonlyMap<string, string>;
}

export interface MvpAPolicyAsCodeFinding {
  surface:
    | "gate"
    | "schema"
    | "migration"
    | "openapi"
    | "fixture-seed"
    | "documentation";
  path: string;
  subject: string;
  message: string;
}

export interface OpenApiSchema {
  $ref?: string;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
}

export interface OpenApiContract {
  paths?: Record<string, unknown>;
  components?: OpenApiComponents;
}

export interface OpenApiComponents {
  schemas?: Record<string, OpenApiSchema>;
  parameters?: Record<string, unknown>;
  requestBodies?: Record<string, unknown>;
}

export type OpenApiComponentSection = keyof OpenApiComponents;
