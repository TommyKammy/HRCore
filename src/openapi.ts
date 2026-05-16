import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OPENAPI_CONTRACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "openapi/hrcore.openapi.json",
);

export async function loadOpenApiContract(): Promise<unknown> {
  const rawContract = await readFile(OPENAPI_CONTRACT_PATH, "utf8");
  return JSON.parse(rawContract) as unknown;
}
