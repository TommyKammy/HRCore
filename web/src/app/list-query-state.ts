import type {
  EmployeeListQuery,
  LifecycleRequestListQuery,
} from "../api-client";
import {
  p2ListMaximumQueryLength,
  p2ListQueryPattern,
} from "../../../src/p2list-contract";

export type ListView = "employees" | "lifecycle";

export interface ParsedListQuery<Query> {
  query: Query;
  errors: string[];
}

export const defaultEmployeeListQuery: EmployeeListQuery = {
  sort: "displayName",
  direction: "asc",
  limit: 25,
};

export const defaultLifecycleListQuery: LifecycleRequestListQuery = {
  sort: "requestedAt",
  direction: "desc",
  limit: 25,
};

const employeeStatuses = ["active", "inactive", "terminated"] as const;
const employeeSorts = ["employeeId", "displayName", "hireDate"] as const;
const lifecycleRequestTypes = [
  "onboarding",
  "transfer",
  "termination",
] as const;
const lifecycleStatuses = [
  "draft",
  "submitted",
  "returned",
  "rejected",
  "cancelled",
  "approved",
  "completed",
] as const;
const lifecycleSorts = ["requestedAt", "effectiveDate"] as const;
const directions = ["asc", "desc"] as const;
const pageSizes = [25, 50, 100] as const;
const boundedQueryPattern = new RegExp(p2ListQueryPattern, "u");
const employeeUrlKeys = [
  "q",
  "employeeId",
  "employmentStatus",
  "organizationCode",
  "asOf",
  "sort",
  "direction",
  "limit",
  "cursor",
] as const;
const lifecycleUrlKeys = [
  "requestType",
  "status",
  "subjectEmployeeId",
  "q",
  "organizationCode",
  "decidedBy",
  "requestedFrom",
  "requestedTo",
  "effectiveFrom",
  "effectiveTo",
  "correlationId",
  "sort",
  "direction",
  "limit",
  "cursor",
] as const;

function validateParameterNames(
  parameters: URLSearchParams,
  allowedKeys: readonly string[],
  errors: string[],
): void {
  const allowed = new Set(["view", ...allowedKeys]);
  for (const key of new Set(parameters.keys())) {
    if (!allowed.has(key)) {
      errors.push(`${key} は対応していない検索条件です。`);
      continue;
    }
    if (parameters.getAll(key).length > 1) {
      errors.push(`${key} を複数回指定することはできません。`);
    }
  }
}

function readAllowedValue<const Value extends string>(
  parameters: URLSearchParams,
  key: string,
  allowed: readonly Value[],
  errors: string[],
): Value | undefined {
  const value = parameters.get(key);
  if (value === null) {
    return undefined;
  }
  if (value === "") {
    errors.push(`${key} が空です。`);
    return undefined;
  }
  if (!allowed.includes(value as Value)) {
    errors.push(`${key} に許可されていない値が指定されています。`);
    return undefined;
  }
  return value as Value;
}

function readAllowedValues<const Value extends string>(
  parameters: URLSearchParams,
  key: string,
  allowed: readonly Value[],
  errors: string[],
): Value[] | undefined {
  const value = parameters.get(key);
  if (value === null) {
    return undefined;
  }
  const values = value.split(",");
  if (
    values.some((candidate) => candidate === "") ||
    new Set(values).size !== values.length ||
    values.length === 0 ||
    values.some((candidate) => !allowed.includes(candidate as Value))
  ) {
    errors.push(
      `${key} に空、重複、または許可されていない値が指定されています。`,
    );
    return undefined;
  }
  return values as Value[];
}

function readPageSize(
  parameters: URLSearchParams,
  errors: string[],
): (typeof pageSizes)[number] {
  const value = parameters.get("limit");
  if (value === null) {
    return 25;
  }
  if (value === "") {
    errors.push("表示件数が空です。");
    return 25;
  }
  if (!/^[1-9]\d*$/u.test(value)) {
    errors.push("表示件数は 25、50、100 のいずれかを指定してください。");
    return 25;
  }
  const parsed = Number(value);
  if (!pageSizes.includes(parsed as (typeof pageSizes)[number])) {
    errors.push("表示件数は 25、50、100 のいずれかを指定してください。");
    return 25;
  }
  return parsed as (typeof pageSizes)[number];
}

function readCursor(
  parameters: URLSearchParams,
  errors: string[],
): string | undefined {
  if (!parameters.has("cursor")) {
    return undefined;
  }
  const cursor = parameters.get("cursor");
  if (!cursor) {
    errors.push("ページ情報が空です。フィルターをリセットしてください。");
    return undefined;
  }
  if (cursor.trim() !== cursor) {
    errors.push("ページ情報の前後に空白を含めないでください。");
    return undefined;
  }
  if (cursor.length > 2048) {
    errors.push("ページ情報が長すぎます。フィルターをリセットしてください。");
    return undefined;
  }
  return cursor;
}

function readText(
  parameters: URLSearchParams,
  key: string,
  maximumLength: number,
  errors: string[],
): string | undefined {
  const value = parameters.get(key);
  if (value === null) {
    return undefined;
  }
  if (value === "") {
    errors.push(`${key} が空です。`);
    return undefined;
  }
  if (value.trim() !== value) {
    errors.push(`${key} の前後に空白を含めないでください。`);
    return undefined;
  }
  if (value.length > maximumLength) {
    errors.push(`${key} は ${maximumLength} 文字以内で指定してください。`);
    return undefined;
  }
  return value;
}

export function validateBoundedQuery(value: string): string | null {
  if (value.length < 2) {
    return "q は 2 文字以上で指定してください。";
  }
  if (value.length > p2ListMaximumQueryLength) {
    return `q は ${p2ListMaximumQueryLength} 文字以内で指定してください。`;
  }
  if (!boundedQueryPattern.test(value)) {
    return "q に使用できない文字が含まれています。";
  }
  return null;
}

function readBoundedQuery(
  parameters: URLSearchParams,
  errors: string[],
): string | undefined {
  const value = parameters.get("q");
  if (value === null) {
    return undefined;
  }
  if (value === "") {
    errors.push("q が空です。");
    return undefined;
  }
  if (value.trim() !== value) {
    errors.push("q の前後に空白を含めないでください。");
    return undefined;
  }
  const error = validateBoundedQuery(value);
  if (error) {
    errors.push(error);
    return undefined;
  }
  return value;
}

function readDate(
  parameters: URLSearchParams,
  key: string,
  errors: string[],
): string | undefined {
  const value = parameters.get(key);
  if (value === null) {
    return undefined;
  }
  if (value === "") {
    errors.push(`${key} が空です。`);
    return undefined;
  }
  if (value.trim() !== value) {
    errors.push(`${key} の前後に空白を含めないでください。`);
    return undefined;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    errors.push(`${key} は YYYY-MM-DD 形式で指定してください。`);
    return undefined;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    errors.push(`${key} は実在する日付で指定してください。`);
    return undefined;
  }
  return value;
}

function readTimestamp(
  parameters: URLSearchParams,
  key: string,
  errors: string[],
): string | undefined {
  const value = parameters.get(key);
  if (value === null) {
    return undefined;
  }
  if (value === "") {
    errors.push(`${key} が空です。`);
    return undefined;
  }
  if (value.trim() !== value) {
    errors.push(`${key} の前後に空白を含めないでください。`);
    return undefined;
  }
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.(?<fraction>\d+))?(?<zone>Z|[+-](?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/u.exec(
      value,
    );
  const groups = match?.groups;
  if (!groups) {
    errors.push(`${key} は RFC3339 日時形式で指定してください。`);
    return undefined;
  }
  const calendarProbe = new Date(
    Date.UTC(Number(groups.year), Number(groups.month) - 1, Number(groups.day)),
  );
  if (
    calendarProbe.getUTCFullYear() !== Number(groups.year) ||
    calendarProbe.getUTCMonth() !== Number(groups.month) - 1 ||
    calendarProbe.getUTCDate() !== Number(groups.day) ||
    Number(groups.hour) > 23 ||
    Number(groups.minute) > 59 ||
    Number(groups.second) > 59 ||
    Number(groups.offsetHour ?? 0) > 23 ||
    Number(groups.offsetMinute ?? 0) > 59 ||
    Number.isNaN(Date.parse(value))
  ) {
    errors.push(`${key} は RFC3339 日時形式で指定してください。`);
    return undefined;
  }
  return value;
}

export function parseEmployeeListQuery(
  search = window.location.search,
): ParsedListQuery<EmployeeListQuery> {
  const parameters = new URLSearchParams(search);
  const errors: string[] = [];
  validateParameterNames(parameters, employeeUrlKeys, errors);
  const query: EmployeeListQuery = {
    q: readBoundedQuery(parameters, errors),
    employeeId: readText(parameters, "employeeId", 128, errors),
    employmentStatus: readAllowedValue(
      parameters,
      "employmentStatus",
      employeeStatuses,
      errors,
    ),
    organizationCode: readText(parameters, "organizationCode", 128, errors),
    asOf: readDate(parameters, "asOf", errors),
    sort:
      readAllowedValue(parameters, "sort", employeeSorts, errors) ??
      defaultEmployeeListQuery.sort,
    direction:
      readAllowedValue(parameters, "direction", directions, errors) ??
      defaultEmployeeListQuery.direction,
    limit: readPageSize(parameters, errors),
    cursor: readCursor(parameters, errors),
  };
  return { query: compactQuery(query), errors };
}

export function parseLifecycleListQuery(
  search = window.location.search,
): ParsedListQuery<LifecycleRequestListQuery> {
  const parameters = new URLSearchParams(search);
  const errors: string[] = [];
  validateParameterNames(parameters, lifecycleUrlKeys, errors);
  const query: LifecycleRequestListQuery = {
    requestType: readAllowedValues(
      parameters,
      "requestType",
      lifecycleRequestTypes,
      errors,
    ),
    status: readAllowedValues(parameters, "status", lifecycleStatuses, errors),
    subjectEmployeeId: readText(parameters, "subjectEmployeeId", 128, errors),
    q: readBoundedQuery(parameters, errors),
    organizationCode: readText(parameters, "organizationCode", 128, errors),
    decidedBy: readText(parameters, "decidedBy", 128, errors),
    requestedFrom: readTimestamp(parameters, "requestedFrom", errors),
    requestedTo: readTimestamp(parameters, "requestedTo", errors),
    effectiveFrom: readDate(parameters, "effectiveFrom", errors),
    effectiveTo: readDate(parameters, "effectiveTo", errors),
    correlationId: readText(parameters, "correlationId", 256, errors),
    sort:
      readAllowedValue(parameters, "sort", lifecycleSorts, errors) ??
      defaultLifecycleListQuery.sort,
    direction:
      readAllowedValue(parameters, "direction", directions, errors) ??
      defaultLifecycleListQuery.direction,
    limit: readPageSize(parameters, errors),
    cursor: readCursor(parameters, errors),
  };
  if (
    (query.requestedFrom === undefined) !==
    (query.requestedTo === undefined)
  ) {
    errors.push("申請日時の開始日時と終了日時を両方指定してください。");
  }
  if (
    query.requestedFrom &&
    query.requestedTo &&
    Date.parse(query.requestedFrom) > Date.parse(query.requestedTo)
  ) {
    errors.push("申請日時の開始日時は終了日時以前にしてください。");
  }
  if (
    (query.effectiveFrom === undefined) !==
    (query.effectiveTo === undefined)
  ) {
    errors.push("適用日の開始日と終了日を両方指定してください。");
  }
  if (
    query.effectiveFrom &&
    query.effectiveTo &&
    query.effectiveFrom > query.effectiveTo
  ) {
    errors.push("適用日の開始日は終了日以前にしてください。");
  }
  return { query: compactQuery(query), errors };
}

export function writeListQuery(
  view: ListView,
  query: EmployeeListQuery | LifecycleRequestListQuery,
  mode: "push" | "replace" = "push",
  state: unknown = null,
): void {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("view", view);
  const queryRecord = query as Record<string, unknown>;
  const allowedKeys = view === "employees" ? employeeUrlKeys : lifecycleUrlKeys;
  for (const key of allowedKeys) {
    const value = queryRecord[key];
    if (value === undefined || value === "" || value === null) {
      continue;
    }
    url.searchParams.set(
      key,
      Array.isArray(value) ? value.join(",") : String(value),
    );
  }
  window.history[mode === "push" ? "pushState" : "replaceState"](
    state,
    "",
    url,
  );
}

function compactQuery<Query extends object>(query: Query): Query {
  return Object.fromEntries(
    Object.entries(query as Record<string, unknown>).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Query;
}
