import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

export const p2zVisualEvidenceSourceAlgorithm = "sha256";

const p2zVisualEvidenceSourceFiles = [
  "index.html",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "src/p2z-webui-visual-evidence-contract.ts",
  "src/p2z-webui-visual-evidence-integrity.ts",
  "vite.config.ts",
  "web/e2e/visual-alignment.spec.ts",
] as const;

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

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

export function isP2zPngEvidenceFile(file: string): boolean {
  return /\.png$/iu.test(file);
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
    if (!/^[A-Za-z]{4}$/u.test(type)) {
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
        if (sawImageData || length === 0 || length % 3 !== 0 || length > 768) {
          throw new Error(`${file} has an invalid PNG palette`);
        }
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
  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(imageData));
  } catch {
    throw new Error(`${file} has invalid compressed PNG image data`);
  }
  if (inflated.length !== expectedInflatedLength) {
    throw new Error(
      `${file} decoded PNG data length ${inflated.length} does not match ${expectedInflatedLength}`,
    );
  }

  return { width, height };
}

async function listRuntimeWebSourceFiles(
  rootDirectory: string,
): Promise<string[]> {
  const sourceDirectory = path.join(rootDirectory, "web/src");
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (
        entry.isFile() &&
        !entry.name.includes(".test.") &&
        !entry.name.startsWith("test-") &&
        entry.name !== "vite-env.d.ts"
      ) {
        files.push(path.relative(rootDirectory, entryPath));
      }
    }
  }

  await visit(sourceDirectory);
  return files;
}

export async function readP2zVisualEvidenceSourceState(
  rootDirectory = process.cwd(),
): Promise<P2zVisualEvidenceSourceState> {
  const files = [
    ...p2zVisualEvidenceSourceFiles,
    ...(await listRuntimeWebSourceFiles(rootDirectory)),
  ].sort();
  const hash = createHash(p2zVisualEvidenceSourceAlgorithm);

  for (const file of files) {
    const contents = await readFile(path.join(rootDirectory, file));
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
