export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readSingleHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function readCsvHeader(
  value: string | string[] | undefined,
): string[] | undefined {
  const rawValue = readSingleHeader(value);
  if (rawValue === undefined) return undefined;

  return rawValue
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function isSyntheticWritebackConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const sqliteCode =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const sqliteErrno =
    "sqliteCode" in error && typeof error.sqliteCode === "string"
      ? error.sqliteCode
      : "";
  const message = error.message.toLowerCase();

  return (
    sqliteCode.includes("SQLITE_CONSTRAINT") ||
    sqliteErrno.includes("SQLITE_CONSTRAINT") ||
    message.includes("constraint failed")
  );
}
