import type {
  OktaGroupProjectionOperation,
  OktaGroupProjectionResult,
  OktaMasteringOperation,
  OktaMasteringProjectionMetadata,
  OktaMasteringProjectionResult,
  OktaWorkEmailWritebackEmissionInput,
} from "./okta-mastering-adapter.js";

type MockUserMetadataInput = {
  operation: OktaMasteringOperation;
  employeeNumber: string;
  effectiveAt: string;
};

type MockGroupMetadataInput = {
  operation: OktaGroupProjectionOperation;
  employeeNumber: string;
  groupKeys: string[];
  effectiveAt: string;
};

type WritebackProjectionEvidence = {
  operation: "create" | "update";
  projectionKey: string;
  effectiveAt: string;
};

export function withMockMetadata<T extends MockUserMetadataInput>(
  result: T,
): OktaMasteringProjectionResult {
  return {
    ...result,
    metadata: {
      adapterMode: "mock",
      provider: "okta",
      projectionKey: [
        "okta",
        "mock",
        encodeProjectionKeyPart(result.operation),
        encodeProjectionKeyPart(result.employeeNumber),
        encodeProjectionKeyPart(result.effectiveAt),
      ].join(":"),
      synthetic: true,
    },
  } as unknown as OktaMasteringProjectionResult;
}

export function withMockGroupMetadata<T extends MockGroupMetadataInput>(
  result: T,
): OktaGroupProjectionResult {
  const groupKeys = [...result.groupKeys];

  return {
    ...result,
    groupKeys,
    metadata: {
      adapterMode: "mock",
      provider: "okta",
      projectionKey: [
        "okta",
        "mock",
        encodeProjectionKeyPart(result.operation),
        encodeProjectionKeyPart(result.employeeNumber),
        encodeProjectionKeyPart(JSON.stringify(groupKeys)),
        encodeProjectionKeyPart(result.effectiveAt),
      ].join(":"),
      synthetic: true,
    },
  } as unknown as OktaGroupProjectionResult;
}

export function readMatchingWritebackProjectionEvidence(
  input: OktaWorkEmailWritebackEmissionInput,
): WritebackProjectionEvidence | undefined {
  const projectionKeyParts = input.projectionEvidence.projectionKey.split(":");
  if (projectionKeyParts.length !== 5) {
    return undefined;
  }

  try {
    const [provider, adapterMode, operation, employeeNumber, effectiveAt] =
      projectionKeyParts.map(decodeURIComponent);

    if (
      provider !== "okta" ||
      adapterMode !== "mock" ||
      (operation !== "create" && operation !== "update") ||
      employeeNumber !== input.employeeNumber ||
      effectiveAt !== input.emittedAt
    ) {
      return undefined;
    }

    return {
      operation,
      projectionKey: input.projectionEvidence.projectionKey,
      effectiveAt,
    };
  } catch {
    return undefined;
  }
}

export function readUserProjectionEvidenceForEmployee(
  metadata: OktaMasteringProjectionMetadata,
  employeeNumber: string,
): WritebackProjectionEvidence | undefined {
  const projectionKeyParts = metadata.projectionKey.split(":");
  if (projectionKeyParts.length !== 5) {
    return undefined;
  }

  try {
    const [
      provider,
      adapterMode,
      operation,
      evidenceEmployeeNumber,
      effectiveAt,
    ] = projectionKeyParts.map(decodeURIComponent);

    if (
      provider !== "okta" ||
      adapterMode !== "mock" ||
      (operation !== "create" && operation !== "update") ||
      evidenceEmployeeNumber !== employeeNumber
    ) {
      return undefined;
    }

    return {
      operation,
      projectionKey: metadata.projectionKey,
      effectiveAt,
    };
  } catch {
    return undefined;
  }
}

export function encodeProjectionKeyPart(value: string): string {
  return encodeURIComponent(toWellFormedString(value));
}

export function areProjectionKeyFieldsWellFormed(values: string[]): boolean {
  return values.every(isWellFormedString);
}

function isWellFormedString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (isHighSurrogate(codeUnit)) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (!isLowSurrogate(nextCodeUnit)) {
        return false;
      }
      index += 1;
      continue;
    }

    if (isLowSurrogate(codeUnit)) {
      return false;
    }
  }

  return true;
}

function toWellFormedString(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (isHighSurrogate(codeUnit)) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (isLowSurrogate(nextCodeUnit)) {
        result += value[index] + value[index + 1];
        index += 1;
      } else {
        result += "\uFFFD";
      }
      continue;
    }

    result += isLowSurrogate(codeUnit) ? "\uFFFD" : value[index];
  }

  return result;
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

export function normalizeGroupKeys(groupKeys: string[]): string[] {
  return Array.from(new Set(groupKeys.map((groupKey) => groupKey.trim()))).sort(
    compareGroupKeys,
  );
}

function compareGroupKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

export function areSameGroupSet(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeGroupKeys(left);
  const normalizedRight = normalizeGroupKeys(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every(
      (groupKey, index) => groupKey === normalizedRight[index],
    )
  );
}

export function toTimestampMillis(timestamp: string): number {
  const millis = Date.parse(timestamp);
  if (!Number.isFinite(millis)) {
    throw new Error("Synthetic Okta timestamp must be parseable.");
  }

  return millis;
}
