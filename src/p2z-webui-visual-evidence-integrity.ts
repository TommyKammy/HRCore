import { createHash } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { PNG } from "pngjs";

import {
  p2zExpectedVisualEvidenceFiles,
  p2zVisualEvidenceProjectNames,
  p2zVisualEvidenceProjects,
  type P2zVisualEvidenceProject,
} from "./p2z-webui-visual-evidence-contract.js";

export const p2zVisualEvidenceSourceAlgorithm = "sha256";
export const p2zVisualEvidenceCaptureProvenanceSchemaVersion = 2;

const p2zVisualEvidenceSourceFiles = [
  "docs/p2z-webui-visual-alignment-contract.md",
  "index.html",
  "openapi/hrcore.openapi.json",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "scripts/capture-p2z-web-evidence.ts",
  "scripts/update-p2z-evidence-manifest.ts",
  "vite.config.ts",
  "web/e2e/visual-alignment.spec.ts",
] as const;

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

type InflateInfoResult = {
  buffer: Buffer;
  engine: {
    bytesWritten: number;
  };
};

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

export type P2zPngDimensions = {
  width: number;
  height: number;
};

export type P2zVisualEvidenceSourceState = {
  algorithm: typeof p2zVisualEvidenceSourceAlgorithm;
  files: string[];
  sha256: string;
};

export type P2zVisualEvidenceCaptureProvenance = {
  schemaVersion: typeof p2zVisualEvidenceCaptureProvenanceSchemaVersion;
  project: P2zVisualEvidenceProject;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  source: P2zVisualEvidenceSourceState;
  artifacts: P2zVisualEvidenceCaptureArtifact[];
};

export type P2zVisualEvidenceCaptureArtifact = {
  file: string;
  sha256: string;
};

export function isP2zPngEvidenceFile(file: string): boolean {
  return /\.png$/iu.test(file);
}

export function normalizeP2zVisualEvidenceSourcePath(file: string): string {
  return file.replaceAll("\\", "/");
}

export async function listP2zPngEvidenceFiles(
  evidenceDirectory = path.resolve(process.cwd(), "docs/evidence/p2z-webui"),
): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      const relativePath = normalizeP2zVisualEvidenceSourcePath(
        path.relative(evidenceDirectory, entryPath),
      );
      if (entry.isSymbolicLink()) {
        throw new Error(
          `P2Z evidence directory contains a symbolic link: ${relativePath}`,
        );
      }
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && isP2zPngEvidenceFile(entry.name)) {
        files.push(relativePath);
      }
    }
  }

  await visit(evidenceDirectory);
  return files.sort();
}

export function canonicalizeP2zVisualEvidenceSourceContents(
  contents: Buffer,
): Buffer {
  return Buffer.from(contents.toString("utf8").replaceAll("\r\n", "\n"));
}

export function p2zVisualEvidenceCaptureProvenanceFile(
  project: P2zVisualEvidenceProject,
): string {
  return `${project}-capture-provenance.json`;
}

export async function invalidateP2zVisualEvidenceCaptureProvenance(
  rootDirectory = process.cwd(),
): Promise<void> {
  const evidenceDirectory = path.join(rootDirectory, "docs/evidence/p2z-webui");
  await Promise.all(
    p2zVisualEvidenceProjectNames.map((project) =>
      rm(
        path.join(
          evidenceDirectory,
          p2zVisualEvidenceCaptureProvenanceFile(project),
        ),
        { force: true },
      ),
    ),
  );
}

function crc32(contents: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of contents) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChannels(colorType: number): number | undefined {
  return new Map([
    [0, 1],
    [2, 3],
    [3, 1],
    [4, 2],
    [6, 4],
  ]).get(colorType);
}

function isValidPngBitDepth(colorType: number, bitDepth: number): boolean {
  const validDepths = new Map<number, readonly number[]>([
    [0, [1, 2, 4, 8, 16]],
    [2, [8, 16]],
    [3, [1, 2, 4, 8]],
    [4, [8, 16]],
    [6, [8, 16]],
  ]);
  return validDepths.get(colorType)?.includes(bitDepth) ?? false;
}

export function validateP2zPngScanlineFilters(
  inflated: Buffer,
  rowBytes: number,
  height: number,
  file: string,
): void {
  const stride = rowBytes + 1;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[row * stride];
    if (filter === undefined || filter > 4) {
      throw new Error(
        `${file} has invalid PNG scanline filter ${String(filter)} at row ${row}`,
      );
    }
  }
}

export function validateP2zPngPalette(
  colorType: number,
  bitDepth: number,
  length: number,
  sawPalette: boolean,
  sawImageData: boolean,
  file: string,
): void {
  const entries = length / 3;
  if (
    sawPalette ||
    sawImageData ||
    colorType === 0 ||
    colorType === 4 ||
    length === 0 ||
    length % 3 !== 0 ||
    length > 768 ||
    (colorType === 3 && entries > 2 ** bitDepth)
  ) {
    throw new Error(`${file} has an invalid PNG palette`);
  }
}

export function inspectP2zPng(
  contents: Buffer,
  file: string,
): P2zPngDimensions {
  if (!contents.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error(`${file} does not have a valid PNG signature`);
  }

  let offset = pngSignature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let sawHeader = false;
  let sawPalette = false;
  let sawImageData = false;
  let endedImageData = false;
  let sawEnd = false;
  const imageData: Buffer[] = [];

  while (offset < contents.length) {
    if (contents.length - offset < 12) {
      throw new Error(`${file} has a truncated PNG chunk header`);
    }

    const length = contents.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > contents.length) {
      throw new Error(`${file} has a truncated PNG chunk`);
    }

    const typeBytes = contents.subarray(typeStart, dataStart);
    const type = typeBytes.toString("ascii");
    if (!/^[A-Za-z]{4}$/u.test(type) || (typeBytes[2]! & 0x20) !== 0) {
      throw new Error(`${file} has an invalid PNG chunk type`);
    }

    const expectedCrc = contents.readUInt32BE(dataEnd);
    const actualCrc = crc32(contents.subarray(typeStart, dataEnd));
    if (actualCrc !== expectedCrc) {
      throw new Error(`${file} has a PNG CRC mismatch in ${type}`);
    }

    const data = contents.subarray(dataStart, dataEnd);
    if (!sawHeader && type !== "IHDR") {
      throw new Error(`${file} must begin with a PNG IHDR chunk`);
    }

    switch (type) {
      case "IHDR": {
        if (sawHeader || length !== 13) {
          throw new Error(`${file} has an invalid PNG IHDR chunk`);
        }
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8]!;
        colorType = data[9]!;
        if (
          width === 0 ||
          height === 0 ||
          !isValidPngBitDepth(colorType, bitDepth) ||
          data[10] !== 0 ||
          data[11] !== 0 ||
          data[12] !== 0
        ) {
          throw new Error(`${file} has unsupported PNG image metadata`);
        }
        sawHeader = true;
        break;
      }
      case "PLTE":
        validateP2zPngPalette(
          colorType,
          bitDepth,
          length,
          sawPalette,
          sawImageData,
          file,
        );
        sawPalette = true;
        break;
      case "IDAT":
        if (endedImageData) {
          throw new Error(`${file} has non-consecutive PNG IDAT chunks`);
        }
        if (colorType === 3 && !sawPalette) {
          throw new Error(`${file} is missing a PNG palette before IDAT`);
        }
        sawImageData = true;
        imageData.push(data);
        break;
      case "IEND":
        if (!sawImageData || length !== 0) {
          throw new Error(`${file} has an invalid PNG IEND chunk`);
        }
        sawEnd = true;
        break;
      default:
        if (sawImageData) {
          endedImageData = true;
        }
        if ((typeBytes[0]! & 0x20) === 0) {
          throw new Error(`${file} has an unknown critical PNG chunk ${type}`);
        }
    }

    offset = chunkEnd;
    if (sawEnd) {
      if (offset !== contents.length) {
        throw new Error(`${file} has data after the PNG IEND chunk`);
      }
      break;
    }
  }

  if (!sawHeader || !sawImageData || !sawEnd) {
    throw new Error(`${file} is missing required PNG chunks`);
  }

  const channels = pngChannels(colorType);
  if (channels === undefined) {
    throw new Error(`${file} has an unsupported PNG color type`);
  }
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const expectedInflatedLength = height * (rowBytes + 1);
  const compressedImageData = Buffer.concat(imageData);
  let inflated: Buffer;
  try {
    const result = inflateSync(compressedImageData, {
      info: true,
      maxOutputLength: expectedInflatedLength + 1,
    }) as unknown as InflateInfoResult;
    inflated = result.buffer;
    if (result.engine.bytesWritten !== compressedImageData.length) {
      throw new Error("trailing compressed bytes");
    }
  } catch {
    throw new Error(`${file} has invalid compressed PNG image data`);
  }
  if (inflated.length !== expectedInflatedLength) {
    throw new Error(
      `${file} decoded PNG data length ${inflated.length} does not match ${expectedInflatedLength}`,
    );
  }
  validateP2zPngScanlineFilters(inflated, rowBytes, height, file);

  try {
    const decoded = PNG.sync.read(contents, { checkCRC: true });
    if (decoded.width !== width || decoded.height !== height) {
      throw new Error("decoded dimensions do not match IHDR");
    }
  } catch (error) {
    const reason = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`${file} failed full PNG decode${reason}`);
  }

  return { width, height };
}

async function listRuntimeSourceFiles(
  rootDirectory: string,
): Promise<string[]> {
  const sourceDirectories = ["src", "web/src"].map((directory) =>
    path.join(rootDirectory, directory),
  );
  const files: string[] = [];
  const excludedDirectories = new Set(["__tests__", "test-helpers"]);

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) {
          await visit(entryPath);
        }
      } else if (
        entry.isFile() &&
        !entry.name.includes(".test.") &&
        !entry.name.includes(".spec.") &&
        !entry.name.startsWith("test-") &&
        !entry.name.endsWith(".d.ts")
      ) {
        files.push(
          normalizeP2zVisualEvidenceSourcePath(
            path.relative(rootDirectory, entryPath),
          ),
        );
      }
    }
  }

  for (const sourceDirectory of sourceDirectories) {
    await visit(sourceDirectory);
  }
  return files;
}

export async function readP2zVisualEvidenceSourceState(
  rootDirectory = process.cwd(),
): Promise<P2zVisualEvidenceSourceState> {
  const files = [
    ...new Set([
      ...p2zVisualEvidenceSourceFiles,
      ...(await listRuntimeSourceFiles(rootDirectory)),
    ]),
  ].sort();
  const hash = createHash(p2zVisualEvidenceSourceAlgorithm);

  for (const file of files) {
    const contents = canonicalizeP2zVisualEvidenceSourceContents(
      await readFile(path.join(rootDirectory, file)),
    );
    hash.update(file);
    hash.update("\0");
    hash.update(String(contents.length));
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }

  return {
    algorithm: p2zVisualEvidenceSourceAlgorithm,
    files,
    sha256: hash.digest("hex"),
  };
}

export function areP2zVisualEvidenceSourceStatesEqual(
  left: P2zVisualEvidenceSourceState,
  right: P2zVisualEvidenceSourceState,
): boolean {
  return (
    left.algorithm === right.algorithm &&
    JSON.stringify(left.files) === JSON.stringify(right.files) &&
    left.sha256 === right.sha256
  );
}

export async function createP2zVisualEvidenceCaptureProvenance(
  project: P2zVisualEvidenceProject,
  capture: {
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
  },
  rootDirectory = process.cwd(),
  evidenceDirectory = path.join(rootDirectory, "docs/evidence/p2z-webui"),
): Promise<P2zVisualEvidenceCaptureProvenance> {
  return {
    schemaVersion: p2zVisualEvidenceCaptureProvenanceSchemaVersion,
    project,
    viewport: { ...capture.viewport },
    deviceScaleFactor: capture.deviceScaleFactor,
    source: await readP2zVisualEvidenceSourceState(rootDirectory),
    artifacts: await readP2zVisualEvidenceCaptureArtifacts(
      project,
      rootDirectory,
      evidenceDirectory,
    ),
  };
}

export async function readP2zVisualEvidenceCaptureArtifacts(
  project: P2zVisualEvidenceProject,
  rootDirectory = process.cwd(),
  evidenceDirectory = path.join(rootDirectory, "docs/evidence/p2z-webui"),
): Promise<P2zVisualEvidenceCaptureArtifact[]> {
  const files = p2zExpectedVisualEvidenceFiles.filter((file) =>
    file.startsWith(`${project}-`),
  );
  return Promise.all(
    files.map(async (file) => {
      const contents = await readFile(path.join(evidenceDirectory, file));
      return {
        file,
        sha256: createHash("sha256").update(contents).digest("hex"),
      };
    }),
  );
}

export function validateP2zVisualEvidenceCaptureProvenance(
  provenance: P2zVisualEvidenceCaptureProvenance,
  project: P2zVisualEvidenceProject,
  currentSource: P2zVisualEvidenceSourceState,
  actualArtifacts: readonly P2zVisualEvidenceCaptureArtifact[],
): string[] {
  const errors: string[] = [];
  const projectContract = p2zVisualEvidenceProjects[project];
  const expectedFiles = p2zExpectedVisualEvidenceFiles.filter((file) =>
    file.startsWith(`${project}-`),
  );

  if (
    provenance.schemaVersion !== p2zVisualEvidenceCaptureProvenanceSchemaVersion
  ) {
    errors.push(`unsupported capture provenance schema for ${project}`);
  }
  if (provenance.project !== project) {
    errors.push(`capture provenance project mismatch for ${project}`);
  }
  if (
    provenance.viewport.width !== projectContract.viewport.width ||
    provenance.viewport.height !== projectContract.viewport.height
  ) {
    errors.push(`capture provenance viewport mismatch for ${project}`);
  }
  if (provenance.deviceScaleFactor !== projectContract.deviceScaleFactor) {
    errors.push(`capture provenance DPR mismatch for ${project}`);
  }
  if (
    JSON.stringify(provenance.artifacts.map(({ file }) => file)) !==
    JSON.stringify(expectedFiles)
  ) {
    errors.push(`capture provenance file inventory mismatch for ${project}`);
  }
  if (
    provenance.artifacts.some(({ sha256 }) => !/^[a-f0-9]{64}$/u.test(sha256))
  ) {
    errors.push(`capture provenance digest format mismatch for ${project}`);
  }
  if (
    JSON.stringify(provenance.artifacts) !== JSON.stringify(actualArtifacts)
  ) {
    errors.push(`capture provenance artifact digest mismatch for ${project}`);
  }
  if (
    !areP2zVisualEvidenceSourceStatesEqual(provenance.source, currentSource)
  ) {
    errors.push(`capture provenance source mismatch for ${project}`);
  }

  return errors;
}
