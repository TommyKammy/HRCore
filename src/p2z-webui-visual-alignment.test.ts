import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

import {
  p2zExpectedVisualEvidenceFiles,
  p2zVisualEvidenceCaptureCommand,
  p2zVisualEvidenceContractVersion,
  p2zVisualEvidenceProjects,
  type P2zVisualEvidenceProject,
  validateP2zVisualEvidenceInventory,
} from "./p2z-webui-visual-evidence-contract.js";
import { readRepoFile } from "./test-helpers/database.js";

const contractPath = "docs/p2z-webui-visual-alignment-contract.md";
const uatPath = "docs/p2z-webui-visual-uat-package.md";
const evidencePath = "docs/evidence/p2z-webui";
const evidenceManifestPath = `${evidencePath}/manifest.json`;

type EvidenceArtifact = {
  file: string;
  project: P2zVisualEvidenceProject;
  viewport: { width: number; height: number };
  captureCommand: string;
  contractVersion: string;
  sha256: string;
};

type EvidenceManifest = {
  schemaVersion: number;
  contract: { path: string; version: string };
  artifacts: EvidenceArtifact[];
};

type ActualEvidence = {
  sha256: string;
  pixelWidth: number;
};

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function readPngWidth(contents: Buffer, file: string): number {
  assert.ok(
    contents.length >= 24 && contents.subarray(0, 8).equals(pngSignature),
    `${file} must be a readable PNG`,
  );
  return contents.readUInt32BE(16);
}

async function readActualEvidence(): Promise<Map<string, ActualEvidence>> {
  const screenshots = (await readdir(path.resolve(process.cwd(), evidencePath)))
    .filter((file) => file.endsWith(".png"))
    .sort();

  return new Map(
    await Promise.all(
      screenshots.map(async (screenshot) => {
        const contents = await readFile(
          path.resolve(process.cwd(), evidencePath, screenshot),
        );
        return [
          screenshot,
          {
            sha256: createHash("sha256").update(contents).digest("hex"),
            pixelWidth: readPngWidth(contents, screenshot),
          },
        ] as const;
      }),
    ),
  );
}

function validateEvidenceManifest(
  manifest: EvidenceManifest,
  actualEvidence: ReadonlyMap<string, ActualEvidence>,
): string[] {
  const errors = validateP2zVisualEvidenceInventory([...actualEvidence.keys()]);
  const expectedFiles = new Set(p2zExpectedVisualEvidenceFiles);
  const seenFiles = new Set<string>();

  if (manifest.schemaVersion !== 1) {
    errors.push(`unsupported schema version: ${manifest.schemaVersion}`);
  }
  if (manifest.contract.path !== contractPath) {
    errors.push(`unexpected contract path: ${manifest.contract.path}`);
  }
  if (manifest.contract.version !== p2zVisualEvidenceContractVersion) {
    errors.push(`unexpected contract version: ${manifest.contract.version}`);
  }

  for (const artifact of manifest.artifacts) {
    if (seenFiles.has(artifact.file)) {
      errors.push(`duplicate manifest entry: ${artifact.file}`);
    }
    seenFiles.add(artifact.file);

    if (!expectedFiles.has(artifact.file)) {
      errors.push(`unexpected manifest entry: ${artifact.file}`);
    }

    const projectContract = p2zVisualEvidenceProjects[artifact.project];
    if (projectContract === undefined) {
      errors.push(`unknown Playwright project: ${String(artifact.project)}`);
    } else {
      if (!artifact.file.startsWith(`${artifact.project}-`)) {
        errors.push(
          `project/file mismatch: ${artifact.project} / ${artifact.file}`,
        );
      }
      if (
        artifact.viewport.width !== projectContract.viewport.width ||
        artifact.viewport.height !== projectContract.viewport.height
      ) {
        errors.push(`viewport mismatch: ${artifact.file}`);
      }
    }

    if (artifact.captureCommand !== p2zVisualEvidenceCaptureCommand) {
      errors.push(`capture command mismatch: ${artifact.file}`);
    }
    if (artifact.contractVersion !== manifest.contract.version) {
      errors.push(`artifact contract mismatch: ${artifact.file}`);
    }
    if (!/^[a-f0-9]{64}$/u.test(artifact.sha256)) {
      errors.push(`invalid SHA-256 digest: ${artifact.file}`);
    }

    const actual = actualEvidence.get(artifact.file);
    if (actual === undefined) {
      errors.push(`missing evidence file: ${artifact.file}`);
    } else {
      if (actual.sha256 !== artifact.sha256) {
        errors.push(`digest mismatch: ${artifact.file}`);
      }
      if (projectContract !== undefined) {
        const expectedPixelWidth =
          projectContract.viewport.width * projectContract.deviceScaleFactor;
        if (actual.pixelWidth !== expectedPixelWidth) {
          errors.push(`PNG width mismatch: ${artifact.file}`);
        }
      }
    }
  }

  for (const file of expectedFiles) {
    if (!seenFiles.has(file)) {
      errors.push(`missing manifest entry: ${file}`);
    }
  }
  for (const file of actualEvidence.keys()) {
    if (!seenFiles.has(file)) {
      errors.push(`unmanifested evidence file: ${file}`);
    }
  }

  return errors.sort();
}
const appModulePaths = [
  "web/src/App.tsx",
  "web/src/app/AppShell.tsx",
  "web/src/app/approvals-workflow.tsx",
  "web/src/app/lifecycle-workflows.tsx",
  "web/src/app/operations-workflows.tsx",
  "web/src/app/screens.tsx",
  "web/src/app/shared.tsx",
] as const;
const styleModulePaths = [
  "web/src/styles.css",
  "web/src/styles/foundations.css",
  "web/src/styles/shell.css",
  "web/src/styles/shared.css",
  "web/src/styles/screens.css",
  "web/src/styles/workflows.css",
  "web/src/styles/responsive.css",
] as const;

test("P2Z visual alignment contract is implemented and reproducible", async () => {
  const [
    contract,
    uat,
    evidenceReadme,
    evidenceManifestText,
    appModules,
    styleModules,
    persona,
    e2e,
    playwrightConfig,
    packageJson,
    ci,
    readme,
  ] = await Promise.all([
    readRepoFile(contractPath),
    readRepoFile(uatPath),
    readRepoFile(`${evidencePath}/README.md`),
    readRepoFile(evidenceManifestPath),
    Promise.all(appModulePaths.map(readRepoFile)),
    Promise.all(styleModulePaths.map(readRepoFile)),
    readRepoFile("web/src/persona.ts"),
    readRepoFile("web/e2e/visual-alignment.spec.ts"),
    readRepoFile("playwright.config.ts"),
    readRepoFile("package.json"),
    readRepoFile(".github/workflows/ci.yml"),
    readRepoFile("README.md"),
  ]);
  const app = appModules.join("\n");
  const styles = styleModules.join("\n");
  const evidenceManifest = JSON.parse(evidenceManifestText) as EvidenceManifest;

  assert.match(
    appModules[0],
    /export \{ App \} from "\.\/app\/AppShell"/u,
    "the stable App entrypoint must delegate to the bounded application shell",
  );

  for (const screen of [
    "Dashboard",
    "Employee detail",
    "Lifecycle procedure",
    "Approval inbox",
    "Job monitor",
  ] as const) {
    assert.match(
      contract,
      new RegExp(`\\|\\s*${screen}\\s*\\|`, "u"),
      `${contractPath} must define the ${screen} screen contract`,
    );
  }

  for (const boundary of [
    "repository-owned synthetic/non-production",
    "Production authorization/RLS remains blocked",
    "Live IdP/Okta/provider mutation remains blocked",
    "Broad employee search",
    "production-like readiness",
    "go-live approval",
  ] as const) {
    assert.ok(contract.includes(boundary), `missing P2Z boundary: ${boundary}`);
  }

  for (const scenario of [
    "P2Z-UAT-01",
    "P2Z-UAT-02",
    "P2Z-UAT-03",
    "P2Z-UAT-04",
    "P2Z-UAT-05",
    "P2Z-UAT-06",
    "P2Z-UAT-07",
    "P2Z-UAT-08",
  ] as const) {
    assert.ok(uat.includes(scenario), `${uatPath} must include ${scenario}`);
  }

  for (const sourceSignal of [
    "DashboardView",
    "EmployeeDetailView",
    "ProcedureFrame",
    "ApprovalsWorkflow",
    "OpsDlqWorkflow",
    "Direct correlation lookup",
  ] as const) {
    assert.ok(
      app.includes(sourceSignal),
      `missing P2Z UI signal: ${sourceSignal}`,
    );
  }

  for (const styleSignal of [
    ".environment-banner",
    ".summary-grid",
    ".approval-layout",
    ".job-monitor",
    ".procedure-toolbar",
    "@media (max-width: 768px)",
    "@media (max-width: 520px)",
    "@media (prefers-reduced-motion: reduce)",
  ] as const) {
    assert.ok(
      styles.includes(styleSignal),
      `missing P2Z responsive/style signal: ${styleSignal}`,
    );
  }

  assert.match(
    persona,
    /allowedRoutes:[\s\S]*"employee"[\s\S]*"onboarding"/u,
    "HR operator must have the bounded employee-detail route",
  );
  assert.ok(
    e2e.includes("assertNoHorizontalOverflow"),
    "P2Z E2E must guard horizontal overflow",
  );
  assert.ok(
    e2e.includes("ナビゲーションを開く"),
    "P2Z E2E must exercise the structural mobile drawer",
  );
  assert.ok(
    e2e.includes("p2zVisualEvidenceScreens") &&
      e2e.includes("observedCaptureScreens"),
    "P2Z E2E must execute the shared authoritative evidence screen set",
  );
  assert.ok(
    playwrightConfig.includes("p2zVisualEvidenceProjects"),
    "Playwright evidence projects must use the shared viewport contract",
  );
  assert.match(
    packageJson,
    /"test:web:e2e":\s*"playwright test"/u,
    "package scripts must expose the P2Z browser smoke",
  );
  assert.match(
    ci,
    /playwright install --with-deps chromium/u,
    "CI must install Chromium before canonical verification",
  );
  assert.match(
    readme,
    /P2Z WebUI Visual Alignment Contract/u,
    "README must link the P2Z visual contract",
  );
  assert.match(
    evidenceReadme,
    /npm run capture:web:evidence/u,
    "visual evidence README must document deterministic regeneration",
  );
  assert.match(
    evidenceReadme,
    /npm run update:p2z:evidence-manifest/u,
    "visual evidence README must document the manifest update workflow",
  );
  assert.match(
    packageJson,
    /"update:p2z:evidence-manifest":\s*"tsx scripts\/update-p2z-evidence-manifest\.ts"/u,
    "package scripts must expose deterministic manifest regeneration",
  );
  assert.ok(
    contract.includes(
      `Evidence contract version: \`${p2zVisualEvidenceContractVersion}\``,
    ),
    "the P2Z contract must publish the manifest contract version",
  );

  const actualEvidence = await readActualEvidence();
  const screenshots = [...actualEvidence.keys()];

  assert.deepEqual(
    validateEvidenceManifest(evidenceManifest, actualEvidence),
    [],
    `${evidenceManifestPath} must exactly cover the current PNG inventory`,
  );
  assert.equal(
    evidenceManifest.artifacts.length,
    screenshots.length,
    "every committed P2Z screenshot must have exactly one manifest entry",
  );

  for (const screenshot of screenshots) {
    const screenshotStat = await stat(
      path.resolve(process.cwd(), evidencePath, screenshot),
    );
    assert.ok(
      screenshotStat.size > 10_000,
      `${screenshot} must contain rendered visual evidence`,
    );
  }
});

test("P2Z evidence manifest rejects inventory, digest, and viewport drift", async () => {
  const manifest = JSON.parse(
    await readRepoFile(evidenceManifestPath),
  ) as EvidenceManifest;
  const artifact = manifest.artifacts[0];
  assert.ok(artifact, "the P2Z evidence manifest must not be empty");
  const matchingEvidence = await readActualEvidence();

  assert.deepEqual(validateEvidenceManifest(manifest, matchingEvidence), []);

  const missingEvidence = new Map(matchingEvidence);
  missingEvidence.delete(artifact.file);
  assert.ok(
    validateEvidenceManifest(manifest, missingEvidence).includes(
      `missing expected evidence file: ${artifact.file}`,
    ),
  );

  const extraEvidence = new Map(matchingEvidence);
  extraEvidence.set("extra-evidence.png", {
    sha256: "0".repeat(64),
    pixelWidth: 1,
  });
  assert.ok(
    validateEvidenceManifest(manifest, extraEvidence).includes(
      "unexpected evidence file: extra-evidence.png",
    ),
  );

  const renamedEvidence = new Map(matchingEvidence);
  const renamedContents = renamedEvidence.get(artifact.file);
  assert.ok(renamedContents);
  renamedEvidence.delete(artifact.file);
  renamedEvidence.set("renamed-evidence.png", renamedContents);
  const renameErrors = validateEvidenceManifest(manifest, renamedEvidence);
  assert.ok(
    renameErrors.includes(`missing expected evidence file: ${artifact.file}`),
  );
  assert.ok(
    renameErrors.includes("unexpected evidence file: renamed-evidence.png"),
  );

  const changedEvidence = new Map(matchingEvidence);
  changedEvidence.set(artifact.file, {
    ...renamedContents,
    sha256: "0".repeat(64),
  });
  assert.ok(
    validateEvidenceManifest(manifest, changedEvidence).includes(
      `digest mismatch: ${artifact.file}`,
    ),
  );

  const wrongWidthEvidence = new Map(matchingEvidence);
  wrongWidthEvidence.set(artifact.file, {
    ...renamedContents,
    pixelWidth: renamedContents.pixelWidth + 1,
  });
  assert.ok(
    validateEvidenceManifest(manifest, wrongWidthEvidence).includes(
      `PNG width mismatch: ${artifact.file}`,
    ),
  );
  assert.ok(
    validateEvidenceManifest(
      { ...manifest, artifacts: [...manifest.artifacts, artifact] },
      matchingEvidence,
    ).includes(`duplicate manifest entry: ${artifact.file}`),
  );
});

test("P2Z visual acceptance does not promote stronger readiness", async () => {
  const normalized = `${await readRepoFile(contractPath)}\n${await readRepoFile(
    uatPath,
  )}`.replace(/\s+/gu, " ");

  for (const forbidden of [
    /production-like readiness:\s*(?:Go|Ready|Accepted)/iu,
    /go-live approval:\s*(?:Go|Ready|Accepted)/iu,
    /real employee data(?:\s+is)?\s+(?:approved|enabled|ready)/iu,
    /live provider operation(?:\s+is)?\s+(?:approved|enabled|ready)/iu,
  ] as const) {
    assert.doesNotMatch(normalized, forbidden);
  }
});
