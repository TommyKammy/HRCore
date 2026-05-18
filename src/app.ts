import Fastify, { type FastifyInstance } from "fastify";

import { loadOpenApiContract } from "./openapi.js";
import { listSyntheticProvisioningRuns } from "./provisioning-runs.js";
import {
  ingestSyntheticWorkEmailWriteback,
  type SyntheticWorkEmailWritebackInput,
  type SyntheticWritebackDatabase,
} from "./writeback-ingest.js";

export interface BuildAppOptions {
  logger?: boolean;
  writebackDb?: SyntheticWritebackDatabase;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  app.get("/health", async () => {
    return { status: "ok" as const };
  });

  app.get("/openapi.json", async (_request, reply) => {
    const contract = await loadOpenApiContract();
    return reply.type("application/json").send(contract);
  });

  app.get("/provisioning-runs", async () => {
    return listSyntheticProvisioningRuns();
  });

  app.post("/writeback-events/work-email", async (request, reply) => {
    if (!options.writebackDb) {
      return reply.code(503).send({
        error: "writeback ingest database is not configured",
      });
    }

    const result = ingestSyntheticWorkEmailWriteback(
      options.writebackDb,
      request.body as SyntheticWorkEmailWritebackInput,
    );

    return reply.code(201).send(result);
  });

  return app;
}
