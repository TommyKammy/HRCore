export type SqlValue = string | number | bigint | null;

export interface SqlStatement {
  get(...values: SqlValue[]): Record<string, unknown> | undefined;
  run(...values: SqlValue[]): unknown;
}

export interface SyntheticWritebackDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
}

export interface SyntheticWorkEmailWritebackInput {
  eventId: string;
  personId: string;
  contactPointId: string;
  providerName: "synthetic_okta";
  providerSubjectId: string;
  providerValue: string;
  targetContactType: "work_email";
  correlationId: string;
  receivedAt: string;
  pocMarker: "synthetic_poc";
}

export interface SyntheticWorkEmailWritebackResult {
  eventId: string;
  personId: string;
  contactPointId: string;
  providerName: "synthetic_okta";
  providerSubjectId: string;
  correlationId: string;
  applied: boolean;
  conflict?: SyntheticWorkEmailConflictEvidence;
}

export interface SyntheticWorkEmailProviderRefreshInput {
  eventId: string;
  providerName: "synthetic_okta";
  providerSubjectId: string;
  providerValue: string;
  refreshedAt: string;
}

export interface SyntheticWorkEmailProviderRefreshResult {
  eventId: string;
  personId: string;
  contactPointId: string;
  providerName: "synthetic_okta";
  providerSubjectId: string;
  eventProviderValue: string;
  refreshedProviderValue: string;
  correlationId: string;
  refreshedAt: string;
  applied: boolean;
  mismatch: boolean;
  conflict?: SyntheticWorkEmailConflictEvidence;
}

export interface SyntheticWorkEmailConflictEvidence {
  conflictId: string;
  conflictType: "inbound_value_conflict" | "provider_refresh_conflict";
  currentContactValue: string;
  attemptedProviderValue: string;
  correlationId: string;
}

export interface SyntheticWorkEmailConflictResolutionInput {
  resolutionId: string;
  conflictId: string;
  writebackEventId: string;
  providerName: "synthetic_okta";
  providerSubjectId: string;
  decision: "accept_provider_value";
  currentContactValue: string;
  resolvedProviderValue: string;
  decidedAt: string;
  decidedBy: string;
  correlationId: string;
}

export interface SyntheticWorkEmailConflictResolutionResult {
  resolutionId: string;
  conflictId: string;
  writebackEventId: string;
  personId: string;
  contactPointId: string;
  providerName: "synthetic_okta";
  providerSubjectId: string;
  decision: "accept_provider_value";
  resolvedProviderValue: string;
  correlationId: string;
  applied: true;
}

export type SyntheticWorkEmailWritebackFixtureOverrides =
  Partial<SyntheticWorkEmailWritebackInput>;
