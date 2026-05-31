import {
  type ApplySyntheticFutureDateHireJobInput,
  type ApplySyntheticHireRequestInput,
  type SyntheticHireAssignmentInput,
  type SyntheticHireAuditInput,
  type SyntheticHireContactPointInput,
  type SyntheticHireDatabase,
  type SyntheticHireEmploymentInput,
  type SyntheticHireInput,
  type SyntheticHireLifecycleEventInput,
  type SyntheticHirePersonInput,
  type SyntheticHireRequestInput,
  type SyntheticHireTransactionRequestInput,
} from "./synthetic-hire-types.js";
import {
  allowedEmploymentStatuses,
  datePattern,
  syntheticAuditPocMarker,
  timestampPattern,
} from "./synthetic-hire-constants.js";

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function rollbackSavepoint(db: SyntheticHireDatabase): void {
  rollbackNamedSavepoint(db, "synthetic_hire_persistence");
}

export function rollbackNamedSavepoint(
  db: SyntheticHireDatabase,
  savepointName: string,
): void {
  try {
    db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
  } catch {
    // Preserve the original write failure; rollback cleanup is best-effort.
  }

  try {
    db.exec(`RELEASE SAVEPOINT ${savepointName}`);
  } catch {
    // Preserve the original write failure; rollback cleanup is best-effort.
  }
}

export function validateSyntheticHireRequest(
  input: SyntheticHireRequestInput,
): void {
  validatePerson(input.person);
  validateTransactionRequest(input.transactionRequest);

  if (input.transactionRequest.personId !== input.person.id) {
    throw new Error("transactionRequest.personId must match person.id");
  }
}

export function validateSyntheticHire(input: SyntheticHireInput): void {
  validateSyntheticHireRecords(input);
  validateAudit(input.audit);
}

export function validateSyntheticHireRecords(input: SyntheticHireInput): void {
  validatePerson(input.person);
  validateEmployment(input.employment);
  validateAssignment(input.assignment);

  if (input.contactPoint) {
    validateContactPoint(input.contactPoint);
  }

  if (input.employment.personId !== input.person.id) {
    throw new Error("employment.personId must match person.id");
  }
  if (input.assignment.personId !== input.person.id) {
    throw new Error("assignment.personId must match person.id");
  }
  if (input.assignment.employmentId !== input.employment.id) {
    throw new Error("assignment.employmentId must match employment.id");
  }
  if (input.contactPoint && input.contactPoint.personId !== input.person.id) {
    throw new Error("contactPoint.personId must match person.id");
  }
}

export function validateApplySyntheticHireRequest(
  input: ApplySyntheticHireRequestInput,
): void {
  validateSyntheticHireRequest(input.request);
  validateSyntheticHireRecords(input.hire);
  validateLifecycleEvent(input.lifecycleEvent);

  if (input.hire.person.id !== input.request.person.id) {
    throw new Error("hire.person.id must match request.person.id");
  }
  if (input.lifecycleEvent.eventType !== "hire") {
    throw new Error("lifecycleEvent.eventType must be hire");
  }
}

export function validateSyntheticFutureDateApplyJob(
  input: ApplySyntheticFutureDateHireJobInput,
): void {
  requireNonEmpty("job.id", input.job.id);
  requireNonEmpty("job.correlationId", input.job.correlationId);
  requireTimestamp("job.observedAt", input.job.observedAt);
  validateApplySyntheticHireRequest(input.apply);

  if (
    input.job.failAfterPreconditionsReason !== undefined &&
    !isNonEmptyString(input.job.failAfterPreconditionsReason)
  ) {
    throw new Error(
      "job.failAfterPreconditionsReason must be a non-empty string when provided",
    );
  }
}

function validateTransactionRequest(
  transactionRequest: SyntheticHireTransactionRequestInput,
): void {
  requireNonEmpty("transactionRequest.id", transactionRequest.id);
  requireNonEmpty("transactionRequest.personId", transactionRequest.personId);
  if (transactionRequest.requestType !== "hire") {
    throw new Error("transactionRequest.requestType must be hire");
  }
  // This PoC only models the explicit submitted -> completed apply path.
  if (transactionRequest.statusCode !== "submitted") {
    throw new Error("transactionRequest.statusCode must be submitted");
  }
  requireTimestamp(
    "transactionRequest.requestedAt",
    transactionRequest.requestedAt,
  );
  requireNonEmpty(
    "transactionRequest.correlationId",
    transactionRequest.correlationId,
  );
}

function validateLifecycleEvent(
  lifecycleEvent: SyntheticHireLifecycleEventInput,
): void {
  requireNonEmpty("lifecycleEvent.id", lifecycleEvent.id);
  if (lifecycleEvent.eventType !== "hire") {
    throw new Error("lifecycleEvent.eventType must be hire");
  }
  requireDate("lifecycleEvent.effectiveDate", lifecycleEvent.effectiveDate);
  requireTimestamp("lifecycleEvent.occurredAt", lifecycleEvent.occurredAt);
}

function validateAudit(audit: SyntheticHireAuditInput): void {
  requireNonEmpty("audit.actorId", audit.actorId);
  requireNonEmpty("audit.correlationId", audit.correlationId);
  requireTimestamp("audit.occurredAt", audit.occurredAt);
  if (audit.pocMarker !== syntheticAuditPocMarker) {
    throw new Error("audit.pocMarker must mark synthetic PoC evidence");
  }
}

function validatePerson(person: SyntheticHirePersonInput): void {
  requireNonEmpty("person.id", person.id);
  requireNonEmpty("person.displayName", person.displayName);
  requireTimestamp("person.createdAt", person.createdAt);
}

function validateEmployment(employment: SyntheticHireEmploymentInput): void {
  requireNonEmpty("employment.id", employment.id);
  requireNonEmpty("employment.personId", employment.personId);
  requireNonEmpty("employment.employmentCode", employment.employmentCode);
  if (!allowedEmploymentStatuses.has(employment.statusCode)) {
    throw new Error("employment.statusCode must be an allowed status");
  }
  requireDate("employment.startDate", employment.startDate);
  requireOptionalDate("employment.endDate", employment.endDate);
}

function validateAssignment(assignment: SyntheticHireAssignmentInput): void {
  requireNonEmpty("assignment.id", assignment.id);
  requireNonEmpty("assignment.personId", assignment.personId);
  requireNonEmpty("assignment.employmentId", assignment.employmentId);
  requireNonEmpty("assignment.assignmentCode", assignment.assignmentCode);
  requireNonEmpty("assignment.organizationCode", assignment.organizationCode);
  requireDate("assignment.startDate", assignment.startDate);
  requireOptionalDate("assignment.endDate", assignment.endDate);
}

function validateContactPoint(
  contactPoint: SyntheticHireContactPointInput,
): void {
  requireNonEmpty("contactPoint.id", contactPoint.id);
  requireNonEmpty("contactPoint.personId", contactPoint.personId);
  if (contactPoint.contactType !== "work_email") {
    throw new Error("contactPoint.contactType must be work_email");
  }
  requireNonEmpty("contactPoint.value", contactPoint.value);
  if (contactPoint.value.indexOf("@") <= 0) {
    throw new Error("contactPoint.value must be a skeleton work email");
  }
  requireBoolean("contactPoint.isPrimary", contactPoint.isPrimary);
  requireTimestamp("contactPoint.createdAt", contactPoint.createdAt);
}

function requireNonEmpty(fieldName: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function requireBoolean(fieldName: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }

  return value;
}

export function toSqliteBoolean(fieldName: string, value: unknown): 0 | 1 {
  return requireBoolean(fieldName, value) ? 1 : 0;
}

function requireDate(fieldName: string, value: string): void {
  requireNonEmpty(fieldName, value);
  if (!isValidIsoDate(value)) {
    throw new Error(`${fieldName} must be an ISO date`);
  }
}

function requireOptionalDate(
  fieldName: string,
  value: string | null | undefined,
): void {
  if (value === undefined || value === null) {
    return;
  }

  requireDate(fieldName, value);
}

function requireTimestamp(fieldName: string, value: string): void {
  requireNonEmpty(fieldName, value);
  const match = timestampPattern.exec(value);
  if (!match || !isValidIsoDateParts(match[1], match[2], match[3])) {
    throw new Error(`${fieldName} must be an ISO timestamp`);
  }
}

function isValidIsoDate(value: string): boolean {
  const match = datePattern.exec(value);
  return Boolean(match && isValidIsoDateParts(match[1], match[2], match[3]));
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

export function isDateStrictlyAfterTimestampDate(
  dateValue: string,
  timestampValue: string,
): boolean {
  return dateValue > normalizeTimestampToUtcDate(timestampValue);
}

function normalizeTimestampToUtcDate(timestampValue: string): string {
  const match = timestampPattern.exec(timestampValue);
  if (!match || !isValidIsoDateParts(match[1], match[2], match[3])) {
    throw new Error("timestamp must be an ISO timestamp");
  }

  const parsed = new Date(timestampValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("timestamp must be an ISO timestamp");
  }

  return parsed.toISOString().slice(0, "YYYY-MM-DD".length);
}
