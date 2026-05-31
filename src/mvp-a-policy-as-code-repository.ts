import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const fixtureSeedFileNamePattern =
  /(?:^|[-_.])(fixture|fixtures|seed|seeds)(?:[-_.]|$)/iu;
const fixtureSeedTextExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const fixtureSeedIgnoredNamePattern =
  /(?:^|[-_.])(test|spec|snap)(?:[-_.]|$)/iu;

export async function readCommittedMigrationSqlByPath(
  cwd: string,
): Promise<Map<string, string>> {
  const migrationDirectory = join(cwd, "drizzle");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const migrationSqlByPath = new Map<string, string>();
  for (const migrationFile of migrationFiles) {
    const path = join("drizzle", migrationFile);
    migrationSqlByPath.set(path, await readFile(join(cwd, path), "utf8"));
  }

  return migrationSqlByPath;
}

export async function readRepoTextFilesByPath(
  cwd: string,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const textByPath = new Map<string, string>();
  for (const path of paths) {
    try {
      textByPath.set(path, await readFile(join(cwd, path), "utf8"));
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  return textByPath;
}

export async function readDiscoveredFixtureSeedTextByPath(
  cwd: string,
): Promise<Map<string, string>> {
  const discoveredPaths = [
    ...(await discoverFixtureSeedRootFiles(cwd)),
    ...(await discoverFixtureSeedFilesUnder(cwd, "src")),
    ...(await discoverFixtureSeedFilesUnder(cwd, "docs")),
  ].sort();
  return readRepoTextFilesByPath(cwd, discoveredPaths);
}

async function discoverFixtureSeedRootFiles(cwd: string): Promise<string[]> {
  const rootEntries = await readdir(cwd, { withFileTypes: true });
  return rootEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isFixtureSeedTextPath);
}

async function discoverFixtureSeedFilesUnder(
  cwd: string,
  rootPath: string,
): Promise<string[]> {
  const discoveredPaths: string[] = [];
  const walk = async (relativeDirectory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(join(cwd, relativeDirectory), {
        withFileTypes: true,
      });
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const relativePath = join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(relativePath);
        continue;
      }

      if (entry.isFile() && isFixtureSeedTextPath(relativePath)) {
        discoveredPaths.push(relativePath);
      }
    }
  };

  await walk(rootPath);
  return discoveredPaths;
}

function isFixtureSeedTextPath(path: string): boolean {
  const fileName = basename(path);
  const directorySegments = path.split(/[\\/]+/u).slice(0, -1);
  return (
    fixtureSeedTextExtensions.has(extname(fileName).toLowerCase()) &&
    (fixtureSeedFileNamePattern.test(fileName) ||
      directorySegments.some((segment) =>
        fixtureSeedFileNamePattern.test(segment),
      )) &&
    !fixtureSeedIgnoredNamePattern.test(fileName)
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
