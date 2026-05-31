import { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

export function assertSupportedFields(
  objectName: string,
  input: Record<string, unknown>,
  supportedFields: readonly string[],
): void {
  const unsupportedFields = Object.keys(input).filter(
    (field) => !supportedFields.includes(field),
  );
  if (unsupportedFields.length > 0) {
    throw new OnboardingTransactionRequestValidationError(
      `${objectName} contains unsupported fields: ${unsupportedFields.join(
        ", ",
      )}`,
    );
  }
}

export function requireRecord(
  fieldName: string,
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new OnboardingTransactionRequestValidationError(
      `${fieldName} must be an object`,
    );
  }

  return value;
}

export function requireNonEmpty(fieldName: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OnboardingTransactionRequestValidationError(
      `${fieldName} must be a non-empty string`,
    );
  }

  return value;
}

export function requireDate(fieldName: string, value: unknown): string {
  const text = requireNonEmpty(fieldName, value);
  if (!isValidIsoDate(text)) {
    throw new OnboardingTransactionRequestValidationError(
      `${fieldName} must be an ISO date`,
    );
  }

  return text;
}

export function requireTimestamp(fieldName: string, value: unknown): string {
  const text = requireNonEmpty(fieldName, value);
  const match = timestampPattern.exec(text);
  if (!match || !isValidIsoDateParts(match[1], match[2], match[3])) {
    throw new OnboardingTransactionRequestValidationError(
      `${fieldName} must be an ISO timestamp`,
    );
  }

  return text;
}

export function requirePositiveInteger(
  fieldName: string,
  value: unknown,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new OnboardingTransactionRequestValidationError(
      `${fieldName} must be a positive integer`,
    );
  }

  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidIsoDate(value: string): boolean {
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
