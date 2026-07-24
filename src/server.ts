import { pathToFileURL } from "node:url";

import { buildApp } from "./app.js";
import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";
import { createServerP2ListEmployeeRuntime } from "./p2list-employee-runtime.js";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "127.0.0.1";

export function resolvePort(portValue = process.env.PORT): number {
  if (portValue === undefined) {
    return DEFAULT_PORT;
  }

  const normalizedPort = portValue.trim();
  if (!/^\d+$/.test(normalizedPort)) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }

  const port = Number(normalizedPort);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }

  return port;
}

export async function buildServerApp() {
  const writebackDb = await openLocalSyntheticWritebackDatabase();

  try {
    const p2ListEmployeeApi =
      await createServerP2ListEmployeeRuntime(writebackDb);
    const app = await buildApp({
      logger: true,
      onboardingDb: writebackDb,
      writebackDb,
      p2ListEmployeeApi,
    });
    app.addHook("onClose", async () => {
      writebackDb.close();
    });

    return app;
  } catch (error) {
    writebackDb.close();
    throw error;
  }
}

export async function startServer(): Promise<void> {
  const port = resolvePort();
  const host = process.env.HOST ?? DEFAULT_HOST;
  const app = await buildServerApp();

  await app.listen({ port, host });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startServer().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
