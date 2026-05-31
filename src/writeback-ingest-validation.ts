import type {
  SyntheticWorkEmailConflictResolutionInput,
  SyntheticWorkEmailProviderRefreshInput,
  SyntheticWorkEmailWritebackInput,
} from "./writeback-ingest-types.js";

export const syntheticPocMarker = "synthetic_poc";
export const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;
const syntheticWorkEmailWritebackFields = [
  "eventId",
  "personId",
  "contactPointId",
  "providerName",
  "providerSubjectId",
  "providerValue",
  "targetContactType",
  "correlationId",
  "receivedAt",
  "pocMarker",
];
const syntheticWorkEmailProviderRefreshFields = [
  "eventId",
  "providerName",
  "providerSubjectId",
  "providerValue",
  "refreshedAt",
];
const syntheticWorkEmailConflictResolutionFields = [
  "resolutionId",
  "conflictId",
  "writebackEventId",
  "providerName",
  "providerSubjectId",
  "decision",
  "currentContactValue",
  "resolvedProviderValue",
  "decidedAt",
  "decidedBy",
  "correlationId",
];

export class SyntheticWorkEmailWritebackValidationError extends Error {
  override name = "SyntheticWorkEmailWritebackValidationError";
}

export function parseSyntheticWorkEmailWritebackInput(
  input: unknown,
): SyntheticWorkEmailWritebackInput {
  if (!isRecord(input)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "request body must be an object",
    );
  }

  const unsupportedFields = Object.keys(input).filter(
    (field) => !syntheticWorkEmailWritebackFields.includes(field),
  );
  if (unsupportedFields.length > 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      `request body contains unsupported fields: ${unsupportedFields.join(
        ", ",
      )}`,
    );
  }

  const eventId = requireNonEmpty("eventId", input.eventId);
  const personId = requireNonEmpty("personId", input.personId);
  const contactPointId = requireNonEmpty(
    "contactPointId",
    input.contactPointId,
  );
  if (input.providerName !== "synthetic_okta") {
    throw new SyntheticWorkEmailWritebackValidationError(
      "providerName must be synthetic_okta",
    );
  }
  const providerSubjectId = requireNonEmpty(
    "providerSubjectId",
    input.providerSubjectId,
  );
  const providerValue = requireNonEmpty("providerValue", input.providerValue);
  if (providerValue.indexOf("@") <= 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "providerValue must be a skeleton work email",
    );
  }
  if (input.targetContactType !== "work_email") {
    throw new SyntheticWorkEmailWritebackValidationError(
      "targetContactType must be work_email",
    );
  }
  const correlationId = requireNonEmpty("correlationId", input.correlationId);
  const receivedAt = requireTimestamp("receivedAt", input.receivedAt);
  if (input.pocMarker !== syntheticPocMarker) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "pocMarker must mark synthetic PoC evidence",
    );
  }

  return {
    eventId,
    personId,
    contactPointId,
    providerName: input.providerName,
    providerSubjectId,
    providerValue,
    targetContactType: input.targetContactType,
    correlationId,
    receivedAt,
    pocMarker: input.pocMarker,
  };
}

export function parseSyntheticWorkEmailConflictResolutionInput(
  input: unknown,
): SyntheticWorkEmailConflictResolutionInput {
  if (!isRecord(input)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "conflict resolution input must be an object",
    );
  }

  const unsupportedFields = Object.keys(input).filter(
    (field) => !syntheticWorkEmailConflictResolutionFields.includes(field),
  );
  if (unsupportedFields.length > 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      `conflict resolution input contains unsupported fields: ${unsupportedFields.join(
        ", ",
      )}`,
    );
  }

  const resolutionId = requireNonEmpty("resolutionId", input.resolutionId);
  const conflictId = requireNonEmpty("conflictId", input.conflictId);
  const writebackEventId = requireNonEmpty(
    "writebackEventId",
    input.writebackEventId,
  );
  if (input.providerName !== "synthetic_okta") {
    throw new SyntheticWorkEmailWritebackValidationError(
      "providerName must be synthetic_okta",
    );
  }
  const providerSubjectId = requireNonEmpty(
    "providerSubjectId",
    input.providerSubjectId,
  );
  if (input.decision !== "accept_provider_value") {
    throw new SyntheticWorkEmailWritebackValidationError(
      "decision must be accept_provider_value",
    );
  }
  const currentContactValue = requireNonEmpty(
    "currentContactValue",
    input.currentContactValue,
  );
  if (currentContactValue.indexOf("@") <= 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "currentContactValue must be a skeleton work email",
    );
  }
  const resolvedProviderValue = requireNonEmpty(
    "resolvedProviderValue",
    input.resolvedProviderValue,
  );
  if (resolvedProviderValue.indexOf("@") <= 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "resolvedProviderValue must be a skeleton work email",
    );
  }
  const decidedAt = requireTimestamp("decidedAt", input.decidedAt);
  const decidedBy = requireNonEmpty("decidedBy", input.decidedBy);
  const correlationId = requireNonEmpty("correlationId", input.correlationId);

  return {
    resolutionId,
    conflictId,
    writebackEventId,
    providerName: input.providerName,
    providerSubjectId,
    decision: input.decision,
    currentContactValue,
    resolvedProviderValue,
    decidedAt,
    decidedBy,
    correlationId,
  };
}

export function parseSyntheticWorkEmailProviderRefreshInput(
  input: unknown,
): SyntheticWorkEmailProviderRefreshInput {
  if (!isRecord(input)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "provider refresh input must be an object",
    );
  }

  const unsupportedFields = Object.keys(input).filter(
    (field) => !syntheticWorkEmailProviderRefreshFields.includes(field),
  );
  if (unsupportedFields.length > 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      `provider refresh input contains unsupported fields: ${unsupportedFields.join(
        ", ",
      )}`,
    );
  }

  const eventId = requireNonEmpty("eventId", input.eventId);
  if (input.providerName !== "synthetic_okta") {
    throw new SyntheticWorkEmailWritebackValidationError(
      "providerName must be synthetic_okta",
    );
  }
  const providerSubjectId = requireNonEmpty(
    "providerSubjectId",
    input.providerSubjectId,
  );
  const providerValue = requireNonEmpty("providerValue", input.providerValue);
  if (providerValue.indexOf("@") <= 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "providerValue must be a skeleton work email",
    );
  }
  const refreshedAt = requireTimestamp("refreshedAt", input.refreshedAt);

  return {
    eventId,
    providerName: input.providerName,
    providerSubjectId,
    providerValue,
    refreshedAt,
  };
}

export function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function requireNonEmpty(fieldName: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SyntheticWorkEmailWritebackValidationError(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

function requireTimestamp(fieldName: string, value: unknown): string {
  const timestamp = requireNonEmpty(fieldName, value);
  const match = timestampPattern.exec(timestamp);
  if (!match || !isValidIsoDateParts(match[1], match[2], match[3])) {
    throw new SyntheticWorkEmailWritebackValidationError(
      `${fieldName} must be an ISO timestamp`,
    );
  }

  return timestamp;
}

export function toTimestampMillis(timestamp: string): number {
  const millis = Date.parse(timestamp);
  if (!Number.isFinite(millis)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "timestamp must be parseable before provider refresh",
    );
  }

  return millis;
}

function isValidIsoDateParts(
  yearText: string,
  monthText: string,
  dayText: string,
): boolean {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}
