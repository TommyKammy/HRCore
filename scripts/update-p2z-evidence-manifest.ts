import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  p2zExpectedVisualEvidenceFiles,
  p2zVisualEvidenceCaptureCommand,
  p2zVisualEvidenceContractVersion,
  p2zVisualEvidenceProjectNames,
  p2zVisualEvidenceProjects,
  validateP2zVisualEvidenceInventory,
} from "../src/p2z-webui-visual-evidence-contract.js";
import {
  inspectP2zPng,
  isP2zPngEvidenceFile,
  readP2zVisualEvidenceSourceState,
} from "../src/p2z-webui-visual-evidence-integrity.js";

const evidenceDirectory = path.resolve(
  process.cwd(),
  "docs/evidence/p2z-webui",
);
const manifestPath = path.join(evidenceDirectory, "manifest.json");
const pngFiles = (await readdir(evidenceDirectory))
  .filter(isP2zPngEvidenceFile)
  .sort();
const inventoryErrors = validateP2zVisualEvidenceInventory(pngFiles);

if (inventoryErrors.length > 0) {
  throw new Error(
    `P2Z evidence inventory does not match the capture contract:\n${inventoryErrors.join(
      "\n",
    )}`,
  );
}

const artifacts = await Promise.all(
  p2zExpectedVisualEvidenceFiles.map(async (file) => {
    const project = p2zVisualEvidenceProjectNames.find((candidate) =>
      file.startsWith(`${candidate}-`),
    );

    if (project === undefined) {
      throw new Error(`Cannot derive a Playwright project from ${file}`);
    }

    const contents = await readFile(path.join(evidenceDirectory, file));
    const projectContract = p2zVisualEvidenceProjects[project];
    const expectedPixelWidth =
      projectContract.viewport.width * projectContract.deviceScaleFactor;
    const dimensions = inspectP2zPng(contents, file);

    if (dimensions.width !== expectedPixelWidth) {
      throw new Error(
        `${file} width ${dimensions.width}px does not match ${project} capture width ${expectedPixelWidth}px`,
      );
    }

    return {
      file,
      project,
      viewport: projectContract.viewport,
      captureCommand: p2zVisualEvidenceCaptureCommand,
      contractVersion: p2zVisualEvidenceContractVersion,
      sha256: createHash("sha256").update(contents).digest("hex"),
    };
  }),
);

const manifest = {
  schemaVersion: 2,
  contract: {
    path: "docs/p2z-webui-visual-alignment-contract.md",
    version: p2zVisualEvidenceContractVersion,
  },
  source: await readP2zVisualEvidenceSourceState(),
  artifacts,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  `Updated ${path.relative(process.cwd(), manifestPath)} with ${artifacts.length} evidence digests.`,
);
