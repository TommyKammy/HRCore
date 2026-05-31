import type {
  OktaGroupProjection,
  OktaGroupProjectionResult,
  SyntheticOktaGroupFixture,
  SyntheticOktaUserFixture,
} from "./okta-mastering-adapter.js";
import {
  areProjectionKeyFieldsWellFormed,
  areSameGroupSet,
  normalizeGroupKeys,
  withMockGroupMetadata,
} from "./okta-mastering-adapter-metadata.js";

export type MockOktaGroupProjectionState = {
  groupsByKey: Map<string, SyntheticOktaGroupFixture>;
  usersByEmployeeNumber: Map<string, SyntheticOktaUserFixture>;
  groupKeysByEmployeeNumber: Map<string, string[]>;
};

export function projectMockOktaGroups(
  projection: OktaGroupProjection,
  state: MockOktaGroupProjectionState,
  invalidProjectionKeyMessage: string,
): OktaGroupProjectionResult {
  const normalizedGroupKeys = normalizeGroupKeys(projection.groupKeys);
  if (
    !areProjectionKeyFieldsWellFormed([
      projection.employeeNumber,
      projection.effectiveAt,
      ...normalizedGroupKeys,
    ])
  ) {
    return withMockGroupMetadata({
      outcome: "permanent_failure",
      operation: "replace_user_groups",
      employeeNumber: projection.employeeNumber,
      errorCode: "mock_invalid_projection_key",
      message: invalidProjectionKeyMessage,
      groupKeys: normalizedGroupKeys,
      effectiveAt: projection.effectiveAt,
    });
  }

  if (projection.operation !== "replace_user_groups") {
    return withMockGroupMetadata({
      outcome: "permanent_failure",
      operation: "replace_user_groups",
      employeeNumber: projection.employeeNumber,
      errorCode: "mock_invalid_group_operation",
      message: "Synthetic group projection operation is not supported.",
      groupKeys: normalizedGroupKeys,
      effectiveAt: projection.effectiveAt,
    });
  }

  const unknownGroupKeys = normalizedGroupKeys.filter(
    (groupKey) => !state.groupsByKey.has(groupKey),
  );
  if (unknownGroupKeys.length > 0) {
    return withMockGroupMetadata({
      outcome: "permanent_failure",
      operation: "replace_user_groups",
      employeeNumber: projection.employeeNumber,
      errorCode: "mock_unknown_group",
      message: "Synthetic group projection references unknown group keys.",
      groupKeys: normalizedGroupKeys,
      effectiveAt: projection.effectiveAt,
    });
  }

  if (!state.usersByEmployeeNumber.has(projection.employeeNumber)) {
    return withMockGroupMetadata({
      outcome: "skipped",
      operation: "replace_user_groups",
      employeeNumber: projection.employeeNumber,
      reason: "missing_user",
      groupKeys: normalizedGroupKeys,
      effectiveAt: projection.effectiveAt,
    });
  }

  const currentGroupKeys =
    state.groupKeysByEmployeeNumber.get(projection.employeeNumber) ?? [];
  if (areSameGroupSet(currentGroupKeys, normalizedGroupKeys)) {
    return withMockGroupMetadata({
      outcome: "skipped",
      operation: "replace_user_groups",
      employeeNumber: projection.employeeNumber,
      reason: "already_projected",
      groupKeys: normalizedGroupKeys,
      effectiveAt: projection.effectiveAt,
    });
  }

  state.groupKeysByEmployeeNumber.set(projection.employeeNumber, [
    ...normalizedGroupKeys,
  ]);

  return withMockGroupMetadata({
    outcome: "success",
    operation: "replace_user_groups",
    employeeNumber: projection.employeeNumber,
    groupKeys: normalizedGroupKeys,
    effectiveAt: projection.effectiveAt,
  });
}
