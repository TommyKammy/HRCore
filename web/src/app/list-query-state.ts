import type {
  EmployeeListQuery,
  LifecycleRequestListQuery,
} from "../api-client";

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

function readAllowedValue<const Value extends string>(
  parameters: URLSearchParams,
  key: string,
  allowed: readonly Value[],
  errors: string[],
): Value | undefined {
  const value = parameters.get(key);
  if (value === null || value === "") {
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
  if (value === null || value === "") {
    return undefined;
  }
  const values = [...new Set(value.split(",").filter(Boolean))];
  if (
    values.length === 0 ||
    values.some((candidate) => !allowed.includes(candidate as Value))
  ) {
    errors.push(`${key} に許可されていない値が指定されています。`);
    return undefined;
  }
  return values as Value[];
}

function readPageSize(
  parameters: URLSearchParams,
  errors: string[],
): (typeof pageSizes)[number] {
  const value = parameters.get("limit");
  if (value === null || value === "") {
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
  const cursor = parameters.get("cursor")?.trim();
  if (!cursor) {
    errors.push("ページ情報が空です。フィルターをリセットしてください。");
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
  const value = parameters.get(key)?.trim();
  if (!value) {
    return undefined;
  }
  if (value.length > maximumLength) {
    errors.push(`${key} は ${maximumLength} 文字以内で指定してください。`);
    return undefined;
  }
  return value;
}

function readDate(
  parameters: URLSearchParams,
  key: string,
  errors: string[],
): string | undefined {
  const value = parameters.get(key)?.trim();
  if (!value) {
    return undefined;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    errors.push(`${key} は YYYY-MM-DD 形式で指定してください。`);
    return undefined;
  }
  return value;
}

export function parseEmployeeListQuery(
  search = window.location.search,
): ParsedListQuery<EmployeeListQuery> {
  const parameters = new URLSearchParams(search);
  const errors: string[] = [];
  const query: EmployeeListQuery = {
    q: readText(parameters, "q", 80, errors),
    employeeId: readText(parameters, "employeeId", 64, errors),
    employmentStatus: readAllowedValue(
      parameters,
      "employmentStatus",
      employeeStatuses,
      errors,
    ),
    organizationCode: readText(parameters, "organizationCode", 64, errors),
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
  const query: LifecycleRequestListQuery = {
    requestType: readAllowedValues(
      parameters,
      "requestType",
      lifecycleRequestTypes,
      errors,
    ),
    status: readAllowedValues(parameters, "status", lifecycleStatuses, errors),
    subjectEmployeeId: readText(parameters, "subjectEmployeeId", 64, errors),
    q: readText(parameters, "q", 80, errors),
    organizationCode: readText(parameters, "organizationCode", 64, errors),
    effectiveFrom: readDate(parameters, "effectiveFrom", errors),
    effectiveTo: readDate(parameters, "effectiveTo", errors),
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
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
}

function compactQuery<Query extends object>(query: Query): Query {
  return Object.fromEntries(
    Object.entries(query as Record<string, unknown>).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Query;
}
