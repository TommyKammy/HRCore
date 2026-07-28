import { fingerprintP2ListValue } from "./p2list-read-model-types.js";

type MaybePromise<T> = T | Promise<T>;

export type P2ListRequestOperation =
  | "employee.list"
  | "employee.detail"
  | "employee.export"
  | "lifecycleRequest.list"
  | "lifecycleRequest.detail"
  | "lifecycleRequest.export";

export interface P2ListCorrelationClock {
  resolveCorrelationAcceptedAt?(
    correlationId: string,
    observedAt: string,
  ): MaybePromise<string>;
}

export function fingerprintP2ListRequestInput(
  operation: P2ListRequestOperation,
  input: unknown,
): string {
  return fingerprintP2ListValue({
    operation,
    inputPresent: input !== undefined,
    input: input ?? null,
  });
}

export function fingerprintP2ListCollectionRequest(
  operation: "employee.list" | "lifecycleRequest.list",
  filters: unknown,
  cursor?: string,
): string {
  return fingerprintP2ListRequestInput(operation, {
    filters,
    ...(cursor ? { cursorFingerprint: fingerprintP2ListValue(cursor) } : {}),
  });
}

export function fingerprintP2ListRequestResult(
  operation: P2ListRequestOperation,
  requestFingerprint: string,
  result: unknown,
): string {
  return fingerprintP2ListRequestInput(operation, {
    requestFingerprint,
    resultFingerprint: fingerprintP2ListValue(result),
  });
}

export function fingerprintP2ListCollectionResult(
  operation: "employee.list" | "lifecycleRequest.list",
  requestFingerprint: string,
  result: {
    items: unknown;
    pageInfo: {
      limit: number;
      hasNextPage: boolean;
      nextCursor?: unknown;
    };
  },
): string {
  return fingerprintP2ListRequestResult(operation, requestFingerprint, {
    items: result.items,
    pageInfo: {
      limit: result.pageInfo.limit,
      hasNextPage: result.pageInfo.hasNextPage,
    },
  });
}

export async function resolveP2ListCorrelationAcceptedAt(
  runtime: P2ListCorrelationClock | undefined,
  correlationId: string,
  observedAt: string,
): Promise<string> {
  const acceptedAt = await runtime?.resolveCorrelationAcceptedAt?.(
    correlationId,
    observedAt,
  );
  return acceptedAt ?? observedAt;
}
