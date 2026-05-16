import { pathToFileURL } from "node:url";

import { buildApp } from "./app.js";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "127.0.0.1";

export async function startServer(): Promise<void> {
  const app = await buildApp({ logger: true });
  const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  const host = process.env.HOST ?? DEFAULT_HOST;

  await app.listen({ port, host });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  startServer().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
