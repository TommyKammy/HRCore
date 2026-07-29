import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const evidenceDirectory = path.resolve(
  process.cwd(),
  "docs/evidence/p2z-webui",
);
const manifestPath = path.join(evidenceDirectory, "manifest.json");
const captureCommand = "npm run capture:web:evidence";
const contractVersion = "p2z-webui-visual-alignment-v1";
const projectViewports = {
  "desktop-chromium": { width: 1440, height: 900 },
  "tablet-chromium": { width: 768, height: 1024 },
  "mobile-chromium": { width: 390, height: 844 },
};

const pngFiles = (await readdir(evidenceDirectory))
  .filter((file) => file.endsWith(".png"))
  .sort();

if (pngFiles.length === 0) {
  throw new Error(`No PNG evidence found in ${evidenceDirectory}`);
}

const artifacts = await Promise.all(
  pngFiles.map(async (file) => {
    const project = Object.keys(projectViewports).find((candidate) =>
      file.startsWith(`${candidate}-`),
    );

    if (project === undefined) {
      throw new Error(`Cannot derive a Playwright project from ${file}`);
    }

    const contents = await readFile(path.join(evidenceDirectory, file));

    return {
      file,
      project,
      viewport: projectViewports[project],
      captureCommand,
      contractVersion,
      sha256: createHash("sha256").update(contents).digest("hex"),
    };
  }),
);

const manifest = {
  schemaVersion: 1,
  contract: {
    path: "docs/p2z-webui-visual-alignment-contract.md",
    version: contractVersion,
  },
  artifacts,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  `Updated ${path.relative(process.cwd(), manifestPath)} with ${artifacts.length} evidence digests.`,
);
