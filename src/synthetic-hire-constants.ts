import { type SyntheticEmploymentStatus } from "./synthetic-hire-types.js";

export const allowedEmploymentStatuses = new Set<SyntheticEmploymentStatus>([
  "active",
  "inactive",
  "terminated",
]);

export const syntheticAuditActorId = "synthetic-poc-actor";
export const syntheticAuditPocMarker = "synthetic_poc";

export const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
export const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;
