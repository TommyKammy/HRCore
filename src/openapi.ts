import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const OPENAPI_CONTRACT_PATH = fileURLToPath(
  new URL("../openapi/hrcore.openapi.json", import.meta.url),
);

export async function loadOpenApiContract(): Promise<unknown> {
  const rawContract = await readFile(OPENAPI_CONTRACT_PATH, "utf8");
  return JSON.parse(rawContract) as unknown;
}
