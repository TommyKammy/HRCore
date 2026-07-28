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
