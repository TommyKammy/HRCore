import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import path from "node:path";
import { deflateSync } from "node:zlib";

import {
  p2zExpectedVisualEvidenceFiles,
  p2zVisualEvidenceCaptureCommand,
  p2zVisualEvidenceContractVersion,
  p2zVisualEvidenceProjectNames,
  p2zVisualEvidenceProjects,
  type P2zVisualEvidenceProject,
  validateP2zVisualEvidenceInventory,
} from "./p2z-webui-visual-evidence-contract.js";
import {
  areP2zVisualEvidenceSourceStatesEqual,
  canonicalizeP2zVisualEvidenceSourceContents,
  inspectP2zPng,
  invalidateP2zVisualEvidenceCaptureProvenance,
  isP2zPngEvidenceFile,
  listP2zPngEvidenceFiles,
  normalizeP2zVisualEvidenceSourcePath,
  p2zVisualEvidenceCaptureProvenanceFile,
  readP2zVisualEvidenceSourceState,
  type P2zVisualEvidenceCaptureArtifact,
  type P2zVisualEvidenceCaptureProvenance,
  type P2zVisualEvidenceSourceState,
  validateP2zPngPalette,
  validateP2zPngScanlineFilters,
  validateP2zInstalledDependencyTree,
  validateP2zVisualEvidenceCaptureProvenance,
} from "./p2z-webui-visual-evidence-integrity.js";
import { validateP2zVisualUatRecord } from "./test-helpers/p2z-webui-visual-uat-record.js";
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
  source: P2zVisualEvidenceSourceState;
  captures: P2zVisualEvidenceCaptureProvenance[];
  artifacts: EvidenceArtifact[];
};

type ActualEvidence = {
  sha256: string;
  pixelWidth: number;
};

const testPngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function testPngCrc32(contents: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of contents) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createTestPngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(testPngCrc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function createIndexedTestPng(
  pixelIndex: number,
  trailingCompressedBytes = Buffer.alloc(0),
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 3;
  const imageData = Buffer.concat([
    deflateSync(Buffer.from([0, pixelIndex])),
    trailingCompressedBytes,
  ]);
  return Buffer.concat([
    testPngSignature,
    createTestPngChunk("IHDR", header),
    createTestPngChunk("PLTE", Buffer.from([0, 0, 0])),
    createTestPngChunk("IDAT", imageData),
    createTestPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function readActualEvidence(): Promise<Map<string, ActualEvidence>> {
  const screenshots = await listP2zPngEvidenceFiles();

  return new Map(
    await Promise.all(
      screenshots.map(async (screenshot) => {
        const contents = await readFile(
          path.resolve(process.cwd(), evidencePath, screenshot),
        );
        const dimensions = inspectP2zPng(contents, screenshot);
        return [
          screenshot,
          {
            sha256: createHash("sha256").update(contents).digest("hex"),
            pixelWidth: dimensions.width,
          },
        ] as const;
      }),
    ),
  );
}

async function readCaptureProvenance(): Promise<
  P2zVisualEvidenceCaptureProvenance[]
> {
  return Promise.all(
    p2zVisualEvidenceProjectNames.map(async (project) => {
      const contents = await readFile(
        path.resolve(
          process.cwd(),
          evidencePath,
          p2zVisualEvidenceCaptureProvenanceFile(project),
        ),
        "utf8",
      );
      return JSON.parse(contents) as P2zVisualEvidenceCaptureProvenance;
    }),
  );
}

function captureArtifactsFromActualEvidence(
  project: P2zVisualEvidenceProject,
  actualEvidence: ReadonlyMap<string, ActualEvidence>,
): P2zVisualEvidenceCaptureArtifact[] {
  return p2zExpectedVisualEvidenceFiles
    .filter((file) => file.startsWith(`${project}-`))
    .flatMap((file) => {
      const actual = actualEvidence.get(file);
      return actual === undefined ? [] : [{ file, sha256: actual.sha256 }];
    });
}

function validateEvidenceManifest(
  manifest: EvidenceManifest,
  actualEvidence: ReadonlyMap<string, ActualEvidence>,
  currentSource: P2zVisualEvidenceSourceState,
): string[] {
  const errors = validateP2zVisualEvidenceInventory([...actualEvidence.keys()]);
  const expectedFiles = new Set(p2zExpectedVisualEvidenceFiles);
  const seenFiles = new Set<string>();

  if (manifest.schemaVersion !== 3) {
    errors.push(`unsupported schema version: ${manifest.schemaVersion}`);
  }
  if (manifest.contract.path !== contractPath) {
    errors.push(`unexpected contract path: ${manifest.contract.path}`);
  }
  if (manifest.contract.version !== p2zVisualEvidenceContractVersion) {
    errors.push(`unexpected contract version: ${manifest.contract.version}`);
  }
  if (manifest.source.algorithm !== currentSource.algorithm) {
    errors.push(
      `unexpected source digest algorithm: ${manifest.source.algorithm}`,
    );
  }
  if (
    JSON.stringify(manifest.source.files) !==
    JSON.stringify(currentSource.files)
  ) {
    errors.push("visual evidence source file inventory mismatch");
  }
  if (manifest.source.sha256 !== currentSource.sha256) {
    errors.push("visual evidence source digest mismatch");
  }

  const seenCaptureProjects = new Set<P2zVisualEvidenceProject>();
  for (const capture of manifest.captures) {
    if (seenCaptureProjects.has(capture.project)) {
      errors.push(`duplicate capture provenance: ${capture.project}`);
    }
    seenCaptureProjects.add(capture.project);
    errors.push(
      ...validateP2zVisualEvidenceCaptureProvenance(
        capture,
        capture.project,
        currentSource,
        captureArtifactsFromActualEvidence(capture.project, actualEvidence),
      ),
    );
  }
  for (const project of p2zVisualEvidenceProjectNames) {
    if (!seenCaptureProjects.has(project)) {
      errors.push(`missing capture provenance: ${project}`);
    }
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
    captureScript,
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
    readRepoFile("scripts/capture-p2z-web-evidence.ts"),
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

  validateP2zVisualUatRecord(uat);

  for (const uatBoundary of [
    "Formal human visual UAT verdict",
    "Issue #406 close eligibility",
    "GET /openapi.json",
    "client-state",
    "synthetic simulations",
    "end-to-end workflow API integration",
    "git rev-parse HEAD",
    "npm run setup:p2list:uat",
    "source .local/p2list-uat/api-environment.sh",
    "source .local/p2list-uat/web-environment.sh",
  ] as const) {
    assert.ok(
      uat.includes(uatBoundary),
      `${uatPath} must preserve UAT boundary: ${uatBoundary}`,
    );
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
      e2e.includes("isolatedScenarioScreens"),
    "P2Z E2E must map isolated scenarios to the authoritative evidence screen set",
  );
  assert.doesNotMatch(
    e2e,
    /waitForTimeout/u,
    "P2Z E2E readiness must use observable application state instead of fixed sleeps",
  );
  for (const scenario of [
    "dashboard",
    "employee list",
    "employee detail",
    "lifecycle list",
    "transfer",
    "approval inbox",
    "job monitor",
  ] as const) {
    assert.ok(
      e2e.includes(`test(\"${scenario} scenario matches the visual contract\"`),
      `P2Z E2E must isolate the ${scenario} scenario`,
    );
  }
  assert.ok(
    e2e.includes("expectMobileNavigationState") &&
      e2e.includes('toHaveAttribute("aria-expanded"'),
    "P2Z mobile navigation must wait for explicit drawer state",
  );
  assert.ok(
    e2e.includes('page.getByText("API contract connected")') &&
      e2e.includes("measuredCaptureGeometry"),
    "P2Z isolated scenarios must wait for contract readiness and record measured capture geometry",
  );
  assert.ok(
    playwrightConfig.includes("p2zVisualEvidenceProjects"),
    "Playwright evidence projects must use the shared viewport contract",
  );
  assert.match(
    playwrightConfig,
    /CAPTURE_WEB_EVIDENCE !== "1"/u,
    "evidence capture must not reuse servers from another checkout",
  );
  assert.match(
    packageJson,
    /"test:web:e2e":\s*"playwright test"/u,
    "package scripts must expose the P2Z browser smoke",
  );
  assert.match(
    packageJson,
    /"capture:web:evidence":\s*"tsx scripts\/capture-p2z-web-evidence\.ts"/u,
    "evidence capture must use the all-project staging wrapper",
  );
  for (const captureAtomicitySignal of [
    "mkdtemp",
    "P2Z_EVIDENCE_OUTPUT_DIRECTORY",
    "expectedStagedFiles",
    "invalidateP2zVisualEvidenceCaptureProvenance",
    "sourceBeforeCapture",
    "assertCaptureSourceUnchanged",
    "validateP2zInstalledDependencyTree",
  ] as const) {
    assert.ok(
      captureScript.includes(captureAtomicitySignal),
      `capture wrapper must preserve atomicity signal: ${captureAtomicitySignal}`,
    );
  }
  assert.ok(
    captureScript.lastIndexOf(
      "for (const file of p2zExpectedVisualEvidenceFiles)",
    ) < captureScript.lastIndexOf("for (const file of provenanceFiles)"),
    "capture promotion must write PNGs before provenance sidecars",
  );
  assert.ok(
    captureScript.indexOf("sourceBeforeCapture") <
      captureScript.indexOf("spawnSync("),
    "capture must freeze the source state before Playwright starts",
  );
  assert.ok(
    captureScript.includes("...p2zVisualEvidenceProjectNames.map"),
    "capture must derive Playwright project arguments from the shared contract",
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
  const currentSource = await readP2zVisualEvidenceSourceState();
  const captureProvenance = await readCaptureProvenance();
  const screenshots = [...actualEvidence.keys()];

  assert.deepEqual(
    validateEvidenceManifest(evidenceManifest, actualEvidence, currentSource),
    [],
    `${evidenceManifestPath} must exactly cover the current PNG inventory`,
  );
  assert.equal(
    evidenceManifest.artifacts.length,
    screenshots.length,
    "every committed P2Z screenshot must have exactly one manifest entry",
  );
  assert.deepEqual(
    evidenceManifest.captures,
    captureProvenance,
    "manifest capture provenance must match the repository-owned sidecars",
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
  const currentSource = await readP2zVisualEvidenceSourceState();

  assert.equal(isP2zPngEvidenceFile("comparison.PNG"), true);
  assert.equal(
    normalizeP2zVisualEvidenceSourcePath("web\\src\\App.tsx"),
    "web/src/App.tsx",
  );
  assert.ok(currentSource.files.includes(contractPath));
  assert.ok(currentSource.files.includes("openapi/hrcore.openapi.json"));
  assert.ok(currentSource.files.includes("src/app.ts"));
  assert.ok(currentSource.files.includes("src/openapi.ts"));
  assert.ok(currentSource.files.includes("src/p2list-contract.ts"));
  assert.ok(currentSource.files.includes("src/server.ts"));
  assert.ok(
    currentSource.files.includes("scripts/capture-p2z-web-evidence.ts"),
  );
  assert.equal(
    new Set(currentSource.files).size,
    currentSource.files.length,
    "visual source inventory must not hash files more than once",
  );
  assert.equal(
    currentSource.files.some(
      (file) =>
        file.includes(".test.") ||
        (file.includes(".spec.") &&
          file !== "web/e2e/visual-alignment.spec.ts") ||
        file.includes("/test-helpers/"),
    ),
    false,
    "visual source inventory must stay bounded to runtime and capture files",
  );
  assert.deepEqual(
    canonicalizeP2zVisualEvidenceSourceContents(
      Buffer.from("first\r\nsecond\r\n"),
    ),
    Buffer.from("first\nsecond\n"),
  );
  assert.deepEqual(
    validateEvidenceManifest(manifest, matchingEvidence, currentSource),
    [],
  );

  const missingEvidence = new Map(matchingEvidence);
  missingEvidence.delete(artifact.file);
  assert.ok(
    validateEvidenceManifest(manifest, missingEvidence, currentSource).includes(
      `missing expected evidence file: ${artifact.file}`,
    ),
  );

  const extraEvidence = new Map(matchingEvidence);
  extraEvidence.set("extra-evidence.png", {
    sha256: "0".repeat(64),
    pixelWidth: 1,
  });
  assert.ok(
    validateEvidenceManifest(manifest, extraEvidence, currentSource).includes(
      "unexpected evidence file: extra-evidence.png",
    ),
  );

  const uppercaseEvidence = new Map(matchingEvidence);
  uppercaseEvidence.set("comparison.PNG", {
    sha256: "0".repeat(64),
    pixelWidth: 1,
  });
  assert.ok(
    validateEvidenceManifest(
      manifest,
      uppercaseEvidence,
      currentSource,
    ).includes("unexpected evidence file: comparison.PNG"),
  );

  const renamedEvidence = new Map(matchingEvidence);
  const renamedContents = renamedEvidence.get(artifact.file);
  assert.ok(renamedContents);
  renamedEvidence.delete(artifact.file);
  renamedEvidence.set("renamed-evidence.png", renamedContents);
  const renameErrors = validateEvidenceManifest(
    manifest,
    renamedEvidence,
    currentSource,
  );
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
    validateEvidenceManifest(manifest, changedEvidence, currentSource).includes(
      `digest mismatch: ${artifact.file}`,
    ),
  );

  const wrongWidthEvidence = new Map(matchingEvidence);
  wrongWidthEvidence.set(artifact.file, {
    ...renamedContents,
    pixelWidth: renamedContents.pixelWidth + 1,
  });
  assert.ok(
    validateEvidenceManifest(
      manifest,
      wrongWidthEvidence,
      currentSource,
    ).includes(`PNG width mismatch: ${artifact.file}`),
  );
  assert.ok(
    validateEvidenceManifest(
      { ...manifest, artifacts: [...manifest.artifacts, artifact] },
      matchingEvidence,
      currentSource,
    ).includes(`duplicate manifest entry: ${artifact.file}`),
  );

  assert.ok(
    validateEvidenceManifest(manifest, matchingEvidence, {
      ...currentSource,
      sha256: "0".repeat(64),
    }).includes("visual evidence source digest mismatch"),
  );

  const capture = manifest.captures[0];
  assert.ok(capture);
  assert.ok(
    validateP2zVisualEvidenceCaptureProvenance(
      {
        ...capture,
        viewport: {
          ...capture.viewport,
          height: capture.viewport.height + 1,
        },
      },
      capture.project,
      currentSource,
      captureArtifactsFromActualEvidence(capture.project, matchingEvidence),
    ).includes(`capture provenance viewport mismatch for ${capture.project}`),
  );

  const captureArtifact = capture.artifacts[0];
  assert.ok(captureArtifact);
  assert.ok(
    validateP2zVisualEvidenceCaptureProvenance(
      {
        ...capture,
        artifacts: [
          { ...captureArtifact, sha256: "0".repeat(64) },
          ...capture.artifacts.slice(1),
        ],
      },
      capture.project,
      currentSource,
      captureArtifactsFromActualEvidence(capture.project, matchingEvidence),
    ).includes(
      `capture provenance artifact digest mismatch for ${capture.project}`,
    ),
  );
});

test("P2Z capture setup invalidates all projects and finds nested PNG evidence", async (t) => {
  const rootDirectory = await mkdtemp(
    path.join(tmpdir(), "hrcore-p2z-evidence-"),
  );
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));
  const evidenceDirectory = path.join(rootDirectory, evidencePath);
  await mkdir(path.join(evidenceDirectory, "archive"), { recursive: true });
  await Promise.all(
    p2zVisualEvidenceProjectNames.map((project) =>
      writeFile(
        path.join(
          evidenceDirectory,
          p2zVisualEvidenceCaptureProvenanceFile(project),
        ),
        "{}",
      ),
    ),
  );
  await writeFile(path.join(evidenceDirectory, "root.png"), "");
  await writeFile(
    path.join(evidenceDirectory, "archive", "comparison.PNG"),
    "",
  );

  assert.deepEqual(await listP2zPngEvidenceFiles(evidenceDirectory), [
    "archive/comparison.PNG",
    "root.png",
  ]);

  await symlink(
    "root.png",
    path.join(evidenceDirectory, "linked-evidence.png"),
  );
  await assert.rejects(
    listP2zPngEvidenceFiles(evidenceDirectory),
    /P2Z evidence directory contains a symbolic link: linked-evidence\.png/u,
  );
  await rm(path.join(evidenceDirectory, "linked-evidence.png"));

  await invalidateP2zVisualEvidenceCaptureProvenance(rootDirectory);
  for (const project of p2zVisualEvidenceProjectNames) {
    await assert.rejects(
      access(
        path.join(
          evidenceDirectory,
          p2zVisualEvidenceCaptureProvenanceFile(project),
        ),
      ),
    );
  }
});

test("P2Z source state excludes untracked files and compares tracked state", async (t) => {
  const scratchDirectory = await mkdtemp(
    path.join(process.cwd(), "src/.p2z-untracked-"),
  );
  t.after(() => rm(scratchDirectory, { recursive: true, force: true }));
  const scratchFile = normalizeP2zVisualEvidenceSourcePath(
    path.relative(
      process.cwd(),
      path.join(scratchDirectory, "scratch-module.ts"),
    ),
  );
  await writeFile(path.join(process.cwd(), scratchFile), "export {};\n");

  assert.equal(
    (await readP2zVisualEvidenceSourceState()).files.includes(scratchFile),
    false,
  );

  const source: P2zVisualEvidenceSourceState = {
    algorithm: "sha256",
    files: ["src/app.ts"],
    sha256: "1".repeat(64),
  };

  assert.equal(
    areP2zVisualEvidenceSourceStatesEqual(source, {
      ...source,
      files: [...source.files],
    }),
    true,
  );
  assert.equal(
    areP2zVisualEvidenceSourceStatesEqual(source, {
      ...source,
      files: ["src/openapi.ts"],
    }),
    false,
  );
  assert.equal(
    areP2zVisualEvidenceSourceStatesEqual(source, {
      ...source,
      sha256: "2".repeat(64),
    }),
    false,
  );
});

test("P2Z capture dependency guard rejects stale installed trees", () => {
  const expected = {
    packages: {
      "": { version: "0.0.0" },
      "node_modules/required": {
        version: "2.0.0",
        integrity: "sha512-current",
      },
      "node_modules/missing": { version: "1.0.0" },
      "node_modules/platform-optional": {
        version: "1.0.0",
        optional: true,
      },
    },
  };

  assert.deepEqual(
    validateP2zInstalledDependencyTree(expected, {
      packages: {
        "node_modules/required": {
          version: "2.0.0",
          integrity: "sha512-current",
        },
        "node_modules/missing": { version: "1.0.0" },
      },
    }),
    [],
  );
  assert.deepEqual(
    validateP2zInstalledDependencyTree(expected, {
      packages: {
        "node_modules/required": {
          version: "1.0.0",
          integrity: "sha512-stale",
        },
        "node_modules/unexpected": { version: "1.0.0" },
      },
    }),
    [
      "installed dependency does not match lockfile: node_modules/required",
      "missing installed dependency: node_modules/missing",
      "unexpected installed dependency: node_modules/unexpected",
    ],
  );
});

test("P2Z evidence PNG validation rejects truncated rendered data", async () => {
  const file = p2zExpectedVisualEvidenceFiles[0];
  assert.ok(file);
  const contents = await readFile(
    path.resolve(process.cwd(), evidencePath, file),
  );
  const truncated = contents.subarray(0, contents.length - 12);

  assert.ok(truncated.length > 10_000);
  assert.throws(
    () => inspectP2zPng(truncated, file),
    /truncated PNG chunk|missing required PNG chunks/u,
  );
  assert.throws(
    () =>
      validateP2zPngScanlineFilters(
        Buffer.from([5, 0]),
        1,
        1,
        "invalid-filter.png",
      ),
    /invalid PNG scanline filter 5/u,
  );
  assert.throws(
    () => validateP2zPngPalette(0, 8, 3, false, false, "grayscale.png"),
    /invalid PNG palette/u,
  );
  assert.throws(
    () => validateP2zPngPalette(4, 8, 3, false, false, "grayscale-alpha.png"),
    /invalid PNG palette/u,
  );
  assert.throws(
    () => validateP2zPngPalette(2, 8, 3, true, false, "duplicate-palette.png"),
    /invalid PNG palette/u,
  );
  assert.throws(
    () => validateP2zPngPalette(3, 1, 9, false, false, "indexed-palette.png"),
    /invalid PNG palette/u,
  );
  assert.deepEqual(
    inspectP2zPng(createIndexedTestPng(0), "indexed-valid.png"),
    {
      width: 1,
      height: 1,
    },
  );
  assert.throws(
    () => inspectP2zPng(createIndexedTestPng(255), "indexed-missing.png"),
    /failed full PNG decode: index 255 not in palette/u,
  );
  assert.throws(
    () =>
      inspectP2zPng(
        createIndexedTestPng(0, Buffer.from([0xde, 0xad])),
        "trailing-zlib.png",
      ),
    /invalid compressed PNG image data/u,
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
