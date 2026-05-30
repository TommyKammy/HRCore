import { type FastifyInstance } from "fastify";

import {
  ingestSyntheticWorkEmailWriteback,
  parseSyntheticWorkEmailWritebackInput,
  SyntheticWorkEmailWritebackValidationError,
  type SyntheticWritebackDatabase,
} from "../writeback-ingest.js";
import { isSyntheticWritebackConstraintError } from "./http-helpers.js";

export function registerWritebackRoutes(
  app: FastifyInstance,
  options: { writebackDb?: SyntheticWritebackDatabase },
): void {
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

      if (isSyntheticWritebackConstraintError(error)) {
        return reply.code(400).send({
          error: "writeback event violates local synthetic constraints",
        });
      }

      throw error;
    }
  });
}
