import type {
  OktaMasteringOperation,
  OktaMasteringProjectionResultCore,
  SyntheticOktaUserFixture,
} from "./okta-mastering-adapter.js";

export function createMockOktaUser(
  desiredUser: SyntheticOktaUserFixture,
  usersByEmployeeNumber: Map<string, SyntheticOktaUserFixture>,
): OktaMasteringProjectionResultCore {
  const existingUser = usersByEmployeeNumber.get(desiredUser.employeeNumber);
  if (existingUser !== undefined) {
    return {
      outcome: "skipped",
      operation: "create",
      employeeNumber: desiredUser.employeeNumber,
      externalId: existingUser.externalId,
      reason: "already_exists",
      effectiveAt: desiredUser.effectiveAt,
    };
  }

  usersByEmployeeNumber.set(desiredUser.employeeNumber, {
    ...desiredUser,
  });

  return successResult("create", desiredUser);
}

export function updateMockOktaUser(
  desiredUser: SyntheticOktaUserFixture,
  usersByEmployeeNumber: Map<string, SyntheticOktaUserFixture>,
): OktaMasteringProjectionResultCore {
  if (!usersByEmployeeNumber.has(desiredUser.employeeNumber)) {
    return {
      outcome: "skipped",
      operation: "update",
      employeeNumber: desiredUser.employeeNumber,
      reason: "missing_user",
      effectiveAt: desiredUser.effectiveAt,
    };
  }

  usersByEmployeeNumber.set(desiredUser.employeeNumber, {
    ...desiredUser,
  });

  return successResult("update", desiredUser);
}

export function disableMockOktaUser(
  employeeNumber: string,
  effectiveAt: string,
  usersByEmployeeNumber: Map<string, SyntheticOktaUserFixture>,
): OktaMasteringProjectionResultCore {
  const existingUser = usersByEmployeeNumber.get(employeeNumber);

  if (existingUser === undefined) {
    return {
      outcome: "skipped",
      operation: "disable",
      employeeNumber,
      reason: "missing_user",
      effectiveAt,
    };
  }

  if (existingUser.status === "deprovisioned") {
    return {
      outcome: "skipped",
      operation: "disable",
      employeeNumber,
      reason: "already_deprovisioned",
      effectiveAt,
    };
  }

  const disabledUser = {
    ...existingUser,
    status: "deprovisioned" as const,
    effectiveAt,
  };
  usersByEmployeeNumber.set(employeeNumber, disabledUser);

  return successResult("disable", disabledUser);
}

function successResult(
  operation: OktaMasteringOperation,
  user: SyntheticOktaUserFixture,
): OktaMasteringProjectionResultCore {
  return {
    outcome: "success",
    operation,
    employeeNumber: user.employeeNumber,
    externalId: user.externalId,
    effectiveAt: user.effectiveAt,
  };
}
