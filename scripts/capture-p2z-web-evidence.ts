import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  p2zExpectedVisualEvidenceFiles,
  p2zVisualEvidenceProjectNames,
} from "../src/p2z-webui-visual-evidence-contract.js";
import {
  invalidateP2zVisualEvidenceCaptureProvenance,
  p2zVisualEvidenceCaptureProvenanceFile,
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
      "--project=desktop-chromium",
      "--project=tablet-chromium",
      "--project=mobile-chromium",
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
