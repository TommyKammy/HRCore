import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  p2zExpectedVisualEvidenceFiles,
  p2zVisualEvidenceProjectNames,
} from "../src/p2z-webui-visual-evidence-contract.js";
import {
  areP2zVisualEvidenceSourceStatesEqual,
  invalidateP2zVisualEvidenceCaptureProvenance,
  p2zVisualEvidenceCaptureProvenanceFile,
  readP2zVisualEvidenceSourceState,
  type P2zVisualEvidenceCaptureProvenance,
  type P2zVisualEvidenceSourceState,
} from "../src/p2z-webui-visual-evidence-integrity.js";

const rootDirectory = process.cwd();
const repositoryEvidenceDirectory = path.resolve(
  rootDirectory,
  "docs/evidence/p2z-webui",
);
const stagingDirectory = await mkdtemp(
  path.join(tmpdir(), "hrcore-p2z-capture-"),
);
const provenanceFiles = p2zVisualEvidenceProjectNames.map(
  p2zVisualEvidenceCaptureProvenanceFile,
);
const expectedStagedFiles = [
  ...p2zExpectedVisualEvidenceFiles,
  ...provenanceFiles,
].sort();
const sourceBeforeCapture =
  await readP2zVisualEvidenceSourceState(rootDirectory);

function assertCaptureSourceUnchanged(
  stage: string,
  source: P2zVisualEvidenceSourceState,
): void {
  if (!areP2zVisualEvidenceSourceStatesEqual(sourceBeforeCapture, source)) {
    throw new Error(
      `P2Z source state changed ${stage}; discard the staged capture and retry`,
    );
  }
}

try {
  const playwrightCli = path.resolve(
    rootDirectory,
    "node_modules/@playwright/test/cli.js",
  );
  const capture = spawnSync(
    process.execPath,
    [
      playwrightCli,
      "test",
      ...p2zVisualEvidenceProjectNames.map((project) => `--project=${project}`),
    ],
    {
      env: {
        ...process.env,
        CAPTURE_WEB_EVIDENCE: "1",
        P2Z_EVIDENCE_OUTPUT_DIRECTORY: stagingDirectory,
      },
      stdio: "inherit",
    },
  );

  if (capture.error) {
    throw capture.error;
  }
  if (capture.status !== 0) {
    process.exitCode = capture.status ?? 1;
  } else {
    assertCaptureSourceUnchanged(
      "during capture",
      await readP2zVisualEvidenceSourceState(rootDirectory),
    );
    const actualStagedFiles = (await readdir(stagingDirectory)).sort();
    if (
      JSON.stringify(actualStagedFiles) !== JSON.stringify(expectedStagedFiles)
    ) {
      throw new Error(
        `P2Z staged capture inventory mismatch:\nexpected ${expectedStagedFiles.join(
          ", ",
        )}\nactual ${actualStagedFiles.join(", ")}`,
      );
    }

    for (const file of provenanceFiles) {
      const provenance = JSON.parse(
        await readFile(path.join(stagingDirectory, file), "utf8"),
      ) as P2zVisualEvidenceCaptureProvenance;
      assertCaptureSourceUnchanged(`while creating ${file}`, provenance.source);
    }
    assertCaptureSourceUnchanged(
      "before promotion",
      await readP2zVisualEvidenceSourceState(rootDirectory),
    );

    await mkdir(repositoryEvidenceDirectory, { recursive: true });
    await invalidateP2zVisualEvidenceCaptureProvenance(rootDirectory);
    for (const file of p2zExpectedVisualEvidenceFiles) {
      await copyFile(
        path.join(stagingDirectory, file),
        path.join(repositoryEvidenceDirectory, file),
      );
    }
    for (const file of provenanceFiles) {
      await copyFile(
        path.join(stagingDirectory, file),
        path.join(repositoryEvidenceDirectory, file),
      );
    }
  }
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
