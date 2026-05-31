import type { SyntheticWorkEmailProviderRefreshInput } from "./writeback-ingest-types.js";

export function createSyntheticWorkEmailProviderRefreshId(
  eventId: string,
  input: SyntheticWorkEmailProviderRefreshInput,
): string {
  return [
    "synthetic-work-email-provider-refresh",
    encodeURIComponent(eventId),
    encodeURIComponent(input.refreshedAt),
  ].join(":");
}

export function createSyntheticWorkEmailProviderRefreshCorrelationId(
  eventCorrelationId: string,
  input: SyntheticWorkEmailProviderRefreshInput,
): string {
  return [
    eventCorrelationId,
    "provider_refresh",
    encodeURIComponent(input.refreshedAt),
  ].join(":");
}
