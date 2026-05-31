import type { SyntheticWorkEmailConflictEvidence } from "./writeback-ingest-types.js";

export function createSyntheticWorkEmailConflictEvidence(
  eventId: string,
  eventCorrelationId: string,
  conflictType: SyntheticWorkEmailConflictEvidence["conflictType"],
  currentContactValue: string,
  attemptedProviderValue: string,
  attempt?: {
    attemptId: string;
    attemptCorrelationId: string;
  },
): SyntheticWorkEmailConflictEvidence {
  const conflictIdParts = ["synthetic-work-email-conflict", eventId];
  const correlationIdParts = [
    attempt ? attempt.attemptCorrelationId : eventCorrelationId,
  ];
  if (attempt) {
    conflictIdParts.push(attempt.attemptId);
  }
  conflictIdParts.push(conflictType);
  correlationIdParts.push("conflict", conflictType);

  return {
    conflictId: conflictIdParts.join(":"),
    conflictType,
    currentContactValue,
    attemptedProviderValue,
    correlationId: correlationIdParts.join(":"),
  };
}
