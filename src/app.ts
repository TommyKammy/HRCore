import Fastify, { type FastifyInstance } from "fastify";

import { loadOpenApiContract } from "./openapi.js";
import { listSyntheticProvisioningRuns } from "./provisioning-runs.js";
import {
  ingestSyntheticWorkEmailWriteback,
  parseSyntheticWorkEmailWritebackInput,
  SyntheticWorkEmailWritebackValidationError,
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

    try {
      const input = parseSyntheticWorkEmailWritebackInput(request.body);
      const result = ingestSyntheticWorkEmailWriteback(
        options.writebackDb,
        input,
      );

      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof SyntheticWorkEmailWritebackValidationError) {
        return reply.code(400).send({ error: error.message });
      }

      throw error;
    }
  });

  return app;
}
