type SqlValue = string | number | bigint | null;

export interface SqlStatement {
  run(...values: SqlValue[]): unknown;
}

export interface SyntheticHireDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): SqlStatement;
}

export type SyntheticEmploymentStatus = "active" | "inactive" | "terminated";

export interface SyntheticHirePersonInput {
  id: string;
  displayName: string;
  createdAt: string;
}

export interface SyntheticHireEmploymentInput {
  id: string;
  personId: string;
  employmentCode: string;
  statusCode: SyntheticEmploymentStatus;
  startDate: string;
  endDate?: string | null;
}

export interface SyntheticHireAssignmentInput {
  id: string;
  personId: string;
  employmentId: string;
  assignmentCode: string;
  organizationCode: string;
  positionCode?: string | null;
  startDate: string;
  endDate?: string | null;
}

export interface SyntheticHireContactPointInput {
  id: string;
  personId: string;
  contactType: "work_email";
  value: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface SyntheticHireInput {
  person: SyntheticHirePersonInput;
  employment: SyntheticHireEmploymentInput;
  assignment: SyntheticHireAssignmentInput;
  contactPoint?: SyntheticHireContactPointInput;
}

export interface SyntheticHirePersistenceResult {
  personId: string;
  employmentId: string;
  assignmentId: string;
  contactPointId?: string;
}

type SyntheticHireFixtureOverrides = {
  person?: Partial<SyntheticHirePersonInput>;
  employment?: Partial<SyntheticHireEmploymentInput>;
  assignment?: Partial<SyntheticHireAssignmentInput>;
  contactPoint?: Partial<SyntheticHireContactPointInput> | null;
};

const allowedEmploymentStatuses = new Set<SyntheticEmploymentStatus>([
  "active",
  "inactive",
  "terminated",
]);

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;
const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

export function createSyntheticHireFixture(
  overrides: SyntheticHireFixtureOverrides = {},
): SyntheticHireInput {
  const person: SyntheticHirePersonInput = {
    id: "person-syn-hire-001",
    displayName: "Synthetic Hire One",
    createdAt: "2026-05-18T00:00:00Z",
    ...overrides.person,
  };
  const employment: SyntheticHireEmploymentInput = {
    id: "employment-syn-hire-001",
    personId: person.id,
    employmentCode: "EMP-SYN-HIRE-001",
    statusCode: "active",
    startDate: "2026-05-18",
    endDate: null,
    ...overrides.employment,
  };
  const assignment: SyntheticHireAssignmentInput = {
    id: "assignment-syn-hire-001",
    personId: person.id,
    employmentId: employment.id,
    assignmentCode: "ASN-SYN-HIRE-001",
    organizationCode: "ORG-SYN-001",
    positionCode: "POS-SYN-001",
    startDate: "2026-05-18",
    endDate: null,
    ...overrides.assignment,
  };
  const contactPoint =
    overrides.contactPoint === null
      ? undefined
      : {
          id: "contact-point-syn-hire-001",
          personId: person.id,
          contactType: "work_email" as const,
          value: "synthetic.hire.001@example.invalid",
          isPrimary: true,
          createdAt: "2026-05-18T00:00:00Z",
          ...overrides.contactPoint,
        };

  return {
    person,
    employment,
    assignment,
    ...(contactPoint ? { contactPoint } : {}),
  };
}

export function saveSyntheticHire(
  db: SyntheticHireDatabase,
  input: SyntheticHireInput,
): SyntheticHirePersistenceResult {
  validateSyntheticHire(input);

  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT synthetic_hire_persistence");
    savepointStarted = true;

    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES (?, ?, ?)
      `,
    ).run(input.person.id, input.person.displayName, input.person.createdAt);

    db.prepare(
      `
        INSERT INTO employment (
          id,
          person_id,
          employment_code,
          status_code,
          start_date,
          end_date
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.employment.id,
      input.employment.personId,
      input.employment.employmentCode,
      input.employment.statusCode,
      input.employment.startDate,
      input.employment.endDate ?? null,
    );

    db.prepare(
      `
        INSERT INTO assignment (
          id,
          person_id,
          employment_id,
          assignment_code,
          organization_code,
          position_code,
          start_date,
          end_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      input.assignment.id,
      input.assignment.personId,
      input.assignment.employmentId,
      input.assignment.assignmentCode,
      input.assignment.organizationCode,
      input.assignment.positionCode ?? null,
      input.assignment.startDate,
      input.assignment.endDate ?? null,
    );

    if (input.contactPoint) {
      db.prepare(
        `
          INSERT INTO contact_point (
            id,
            person_id,
            contact_type,
            value,
            is_primary,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).run(
        input.contactPoint.id,
        input.contactPoint.personId,
        input.contactPoint.contactType,
        input.contactPoint.value,
        input.contactPoint.isPrimary ? 1 : 0,
        input.contactPoint.createdAt,
      );
    }

    db.exec("RELEASE SAVEPOINT synthetic_hire_persistence");

    return {
      personId: input.person.id,
      employmentId: input.employment.id,
      assignmentId: input.assignment.id,
      ...(input.contactPoint ? { contactPointId: input.contactPoint.id } : {}),
    };
  } catch (error) {
    if (savepointStarted) {
      rollbackSavepoint(db);
    }

    throw error;
  }
}

function rollbackSavepoint(db: SyntheticHireDatabase): void {
  try {
    db.exec("ROLLBACK TO SAVEPOINT synthetic_hire_persistence");
  } catch {
    // Preserve the original write failure; rollback cleanup is best-effort.
  }

  try {
    db.exec("RELEASE SAVEPOINT synthetic_hire_persistence");
  } catch {
    // Preserve the original write failure; rollback cleanup is best-effort.
  }
}

function validateSyntheticHire(input: SyntheticHireInput): void {
  validatePerson(input.person);
  validateEmployment(input.employment);
  validateAssignment(input.assignment);

  if (input.contactPoint) {
    validateContactPoint(input.contactPoint);
  }

  if (input.employment.personId !== input.person.id) {
    throw new Error("employment.personId must match person.id");
  }
  if (input.assignment.personId !== input.person.id) {
    throw new Error("assignment.personId must match person.id");
  }
  if (input.assignment.employmentId !== input.employment.id) {
    throw new Error("assignment.employmentId must match employment.id");
  }
  if (input.contactPoint && input.contactPoint.personId !== input.person.id) {
    throw new Error("contactPoint.personId must match person.id");
  }
}

function validatePerson(person: SyntheticHirePersonInput): void {
  requireNonEmpty("person.id", person.id);
  requireNonEmpty("person.displayName", person.displayName);
  requireTimestamp("person.createdAt", person.createdAt);
}

function validateEmployment(employment: SyntheticHireEmploymentInput): void {
  requireNonEmpty("employment.id", employment.id);
  requireNonEmpty("employment.personId", employment.personId);
  requireNonEmpty("employment.employmentCode", employment.employmentCode);
  if (!allowedEmploymentStatuses.has(employment.statusCode)) {
    throw new Error("employment.statusCode must be an allowed status");
  }
  requireDate("employment.startDate", employment.startDate);
  requireOptionalDate("employment.endDate", employment.endDate);
}

function validateAssignment(assignment: SyntheticHireAssignmentInput): void {
  requireNonEmpty("assignment.id", assignment.id);
  requireNonEmpty("assignment.personId", assignment.personId);
  requireNonEmpty("assignment.employmentId", assignment.employmentId);
  requireNonEmpty("assignment.assignmentCode", assignment.assignmentCode);
  requireNonEmpty("assignment.organizationCode", assignment.organizationCode);
  requireDate("assignment.startDate", assignment.startDate);
  requireOptionalDate("assignment.endDate", assignment.endDate);
}

function validateContactPoint(
  contactPoint: SyntheticHireContactPointInput,
): void {
  requireNonEmpty("contactPoint.id", contactPoint.id);
  requireNonEmpty("contactPoint.personId", contactPoint.personId);
  if (contactPoint.contactType !== "work_email") {
    throw new Error("contactPoint.contactType must be work_email");
  }
  requireNonEmpty("contactPoint.value", contactPoint.value);
  if (contactPoint.value.indexOf("@") <= 0) {
    throw new Error("contactPoint.value must be a skeleton work email");
  }
  if (typeof contactPoint.isPrimary !== "boolean") {
    throw new Error("contactPoint.isPrimary must be a boolean");
  }
  requireTimestamp("contactPoint.createdAt", contactPoint.createdAt);
}

function requireNonEmpty(fieldName: string, value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function requireDate(fieldName: string, value: string): void {
  requireNonEmpty(fieldName, value);
  if (!isValidIsoDate(value)) {
    throw new Error(`${fieldName} must be an ISO date`);
  }
}

function requireOptionalDate(
  fieldName: string,
  value: string | null | undefined,
): void {
  if (value === undefined || value === null) {
    return;
  }

  requireDate(fieldName, value);
}

function requireTimestamp(fieldName: string, value: string): void {
  requireNonEmpty(fieldName, value);
  const match = timestampPattern.exec(value);
  if (!match || !isValidIsoDateParts(match[1], match[2], match[3])) {
    throw new Error(`${fieldName} must be an ISO timestamp`);
  }
}

function isValidIsoDate(value: string): boolean {
  const match = datePattern.exec(value);
  return Boolean(match && isValidIsoDateParts(match[1], match[2], match[3]));
}

function isValidIsoDateParts(
  yearText: string,
  monthText: string,
  dayText: string,
): boolean {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}
