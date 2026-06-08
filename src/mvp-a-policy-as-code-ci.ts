import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";

import { mvpAOnboardingEvidenceAuthorizationGate } from "./mvp-a-onboarding-evidence-authorization.js";
import {
  assertMvpAOnboardingNonProductionApiResponseField,
  type MvpAOnboardingNonProductionDataGate,
  mvpAOnboardingNonProductionDataGate,
} from "./mvp-a-onboarding-non-production-data-gate.js";
import {
  assertMvpAOnboardingPiiExportGate,
  type MvpAOnboardingPiiExportGate,
  mvpAOnboardingPiiExportGate,
} from "./mvp-a-onboarding-pii-export-gate.js";
import { collectDocumentationFindings } from "./mvp-a-policy-as-code-documentation.js";
import { collectFixtureSeedFindings } from "./mvp-a-policy-as-code-fixture-seed.js";
import { collectGateFindings } from "./mvp-a-policy-as-code-gates.js";
import {
  collectOnboardingSchemaNames,
  collectOpenApiOperationSurfaces,
  collectOpenApiSchemaPropertyNames,
  collectOpenApiSchemaPropertyNamesFromValue,
  isMvpAOnboardingRoute,
} from "./mvp-a-policy-as-code-openapi.js";
import {
  readCommittedMigrationSqlByPath,
  readDiscoveredDocumentationTextByPath,
  readDiscoveredFixtureSeedTextByPath,
} from "./mvp-a-policy-as-code-repository.js";
import {
  collectMigrationFindings,
  collectSchemaFindings,
} from "./mvp-a-policy-as-code-repository-surfaces.js";
import type {
  MvpAPolicyAsCodeFinding,
  MvpAPolicyAsCodeInputs,
  OpenApiContract,
} from "./mvp-a-policy-as-code-types.js";
import * as schema from "./persistence/schema.js";

export type {
  MvpAPolicyAsCodeFinding,
  MvpAPolicyAsCodeInputs,
} from "./mvp-a-policy-as-code-types.js";

export const mvpAPolicyAsCodeDocumentationPaths = [
  "README.md",
  "docs/mvp-a-onboarding-non-production-data-gate.md",
  "docs/solo-maintainer-governance.md",
  "docs/p0-gov-01-solo-maintainer-governance-closeout.md",
  "docs/mvp-a-go-no-go.md",
  "docs/mvp-a-go-no-go-scope.md",
  "docs/mvp-a-go-no-go-future-wave-readiness.md",
  "docs/mvp-a-onboarding-go-no-go-checklist.md",
  "docs/mvp-a-onboarding-evidence-authorization-gate.md",
  "docs/mvp-a-onboarding-backup-restore-rehearsal-gate.md",
  "docs/mvp-a-onboarding-pii-export-gate.md",
  "docs/mvp-a-p2a-02-independent-review-closeout.md",
  "docs/mvp-a-p2a-03-practical-use-readiness-review-closeout.md",
  "docs/mvp-a-p2a-04-refactor-wave-closeout.md",
  "docs/mvp-a-p2a-05-refactor-wave-closeout.md",
  "docs/p2x-01-next-wave-recommendation-closeout.md",
  "docs/p2x-02-bounded-practical-use-follow-up-closeout.md",
  "docs/p2x-production-like-blocker-matrix.md",
  "docs/p2x-solo-maintainer-governance-boundary-review.md",
  "docs/p2x-hr-practical-use-gap-assessment.md",
  "docs/p2x-local-bounded-operator-runbook.md",
  "docs/p2x-synthetic-practical-use-rehearsal-checklist.md",
  "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
  "docs/p2x-synthetic-test-data-governance.md",
  "docs/p2x-closeout-reference-inventory.md",
  "docs/p2x-03-bounded-closeout-synchronization-closeout.md",
  "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md",
  "docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md",
  "docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md",
] as const;

export function checkMvpAPolicyAsCode(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  return [
    ...collectGateFindings(inputs),
    ...collectSchemaFindings(inputs),
    ...collectMigrationFindings(inputs),
    ...collectOpenApiFindings(inputs),
    ...collectFixtureSeedFindings(inputs),
    ...collectDocumentationFindings(inputs),
  ];
}

export function assertMvpAPolicyAsCode(inputs: MvpAPolicyAsCodeInputs): void {
  const findings = checkMvpAPolicyAsCode(inputs);
  if (findings.length === 0) {
    return;
  }

  const findingSummary = findings
    .map(
      (finding) =>
        `${finding.surface}:${finding.path}:${finding.subject}: ${finding.message}`,
    )
    .join("\n");
  throw new Error(`MVP-A policy-as-code gate failed:\n${findingSummary}`);
}

export async function loadCurrentMvpAPolicyAsCodeInputs(
  cwd = process.cwd(),
): Promise<MvpAPolicyAsCodeInputs> {
  return {
    piiExportGate: mvpAOnboardingPiiExportGate,
    evidenceAuthorizationGate: mvpAOnboardingEvidenceAuthorizationGate,
    nonProductionDataGate: mvpAOnboardingNonProductionDataGate,
    schemaTables: collectCurrentSchemaTables(),
    migrationSqlByPath: await readCommittedMigrationSqlByPath(cwd),
    openApiContract: JSON.parse(
      await readFile(join(cwd, "openapi/hrcore.openapi.json"), "utf8"),
    ) as OpenApiContract,
    fixtureSeedTextByPath: await readDiscoveredFixtureSeedTextByPath(cwd),
    documentationTextByPath: await readDiscoveredDocumentationTextByPath(
      cwd,
      mvpAPolicyAsCodeDocumentationPaths,
    ),
  };
}

function collectOpenApiFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const findings: MvpAPolicyAsCodeFinding[] = [];
  const components = inputs.openApiContract.components ?? {};
  const schemas = components.schemas ?? {};
  const onboardingPathEntries = Object.entries(
    inputs.openApiContract.paths ?? {},
  ).filter(([route]) => isMvpAOnboardingRoute(route));

  if (onboardingPathEntries.length === 0) {
    findings.push({
      surface: "openapi",
      path: "openapi/hrcore.openapi.json",
      subject: "paths",
      message: "expected MVP-A onboarding routes to be present",
    });
    return findings;
  }

  for (const [route, pathItem] of onboardingPathEntries) {
    const routeFinding = checkPiiExportSurface(
      inputs.piiExportGate,
      "openapi",
      "openapi/hrcore.openapi.json",
      route,
      route,
      "route",
    );
    if (routeFinding !== undefined) {
      findings.push(routeFinding);
    }

    for (const operationSurface of collectOpenApiOperationSurfaces(
      pathItem,
      components,
    )) {
      const finding = checkPiiExportSurface(
        inputs.piiExportGate,
        "openapi",
        "openapi/hrcore.openapi.json",
        operationSurface.kind === "parameter"
          ? `${route} parameter ${operationSurface.value}`
          : `${route} metadata`,
        operationSurface.value,
      );
      if (finding !== undefined) {
        findings.push(finding);
      }
    }

    for (const propertyName of collectOpenApiSchemaPropertyNamesFromValue(
      pathItem,
      components,
    )) {
      const finding = checkPiiExportSurface(
        inputs.piiExportGate,
        "openapi",
        "openapi/hrcore.openapi.json",
        `${route}.${propertyName}`,
        propertyName,
      );
      if (finding !== undefined) {
        findings.push(finding);
      }

      const nonProductionFinding = checkNonProductionApiResponseField(
        inputs.nonProductionDataGate,
        "openapi",
        "openapi/hrcore.openapi.json",
        `${route}.${propertyName}`,
        propertyName,
      );
      if (nonProductionFinding !== undefined) {
        findings.push(nonProductionFinding);
      }
    }
  }

  const onboardingSchemaNames = collectOnboardingSchemaNames(
    onboardingPathEntries.map(([, pathItem]) => pathItem),
    components,
  );
  for (const schemaName of onboardingSchemaNames) {
    const schemaNameFinding = checkPiiExportSurface(
      inputs.piiExportGate,
      "openapi",
      "openapi/hrcore.openapi.json",
      schemaName,
      schemaName,
    );
    if (schemaNameFinding !== undefined) {
      findings.push(schemaNameFinding);
    }

    for (const propertyName of collectOpenApiSchemaPropertyNames(
      schemas[schemaName],
      components,
    )) {
      const finding = checkPiiExportSurface(
        inputs.piiExportGate,
        "openapi",
        "openapi/hrcore.openapi.json",
        `${schemaName}.${propertyName}`,
        propertyName,
      );
      if (finding !== undefined) {
        findings.push(finding);
      }

      const nonProductionFinding = checkNonProductionApiResponseField(
        inputs.nonProductionDataGate,
        "openapi",
        "openapi/hrcore.openapi.json",
        `${schemaName}.${propertyName}`,
        propertyName,
      );
      if (nonProductionFinding !== undefined) {
        findings.push(nonProductionFinding);
      }
    }
  }

  return findings;
}

function checkPiiExportSurface(
  gate: MvpAOnboardingPiiExportGate,
  surface: MvpAPolicyAsCodeFinding["surface"],
  path: string,
  subject: string,
  value: string,
  checkKind: "field" | "route" = "field",
): MvpAPolicyAsCodeFinding | undefined {
  try {
    assertMvpAOnboardingPiiExportGate(gate, {
      ...(checkKind === "route" ? { route: value } : { fieldName: value }),
    });
  } catch (error) {
    return {
      surface,
      path,
      subject,
      message: getErrorMessage(error),
    };
  }

  return undefined;
}

function checkNonProductionApiResponseField(
  gate: MvpAOnboardingNonProductionDataGate,
  surface: MvpAPolicyAsCodeFinding["surface"],
  path: string,
  subject: string,
  value: string,
): MvpAPolicyAsCodeFinding | undefined {
  try {
    assertMvpAOnboardingNonProductionApiResponseField(gate, value);
  } catch (error) {
    return {
      surface,
      path,
      subject,
      message: getErrorMessage(error),
    };
  }

  return undefined;
}

function collectCurrentSchemaTables(): SQLiteTable[] {
  const schemaExports = schema as Record<string, unknown>;
  return Object.values(schemaExports).filter(isSQLiteTable);
}

function isSQLiteTable(value: unknown): value is SQLiteTable {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  try {
    getTableConfig(value as SQLiteTable);
    return true;
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    assertMvpAPolicyAsCode(await loadCurrentMvpAPolicyAsCodeInputs());
    console.log("MVP-A policy-as-code gate passed");
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  }
}
