import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const syntheticId = () => text("id").primaryKey();
const createdAt = () => text("created_at").notNull();

export const person = sqliteTable(
  "person",
  {
    id: syntheticId(),
    displayName: text("display_name").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check("person_id_non_empty", sql`length(${table.id}) > 0`),
    check(
      "person_display_name_non_empty",
      sql`length(${table.displayName}) > 0`,
    ),
    check("person_created_at_date", sql`${table.createdAt} glob '????-??-??*'`),
  ],
);

export const employment = sqliteTable(
  "employment",
  {
    id: syntheticId(),
    personId: text("person_id")
      .notNull()
      .references(() => person.id),
    employmentCode: text("employment_code").notNull(),
    statusCode: text("status_code", {
      enum: ["active", "inactive", "terminated"],
    }).notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
  },
  (table) => [
    uniqueIndex("employment_employment_code_unique").on(table.employmentCode),
    uniqueIndex("employment_id_person_unique").on(table.id, table.personId),
    check("employment_id_non_empty", sql`length(${table.id}) > 0`),
    check(
      "employment_code_non_empty",
      sql`length(${table.employmentCode}) > 0`,
    ),
    check(
      "employment_status_code_allowed",
      sql`${table.statusCode} in ('active', 'inactive', 'terminated')`,
    ),
    check(
      "employment_start_date_shape",
      sql`${table.startDate} glob '????-??-??'`,
    ),
    check(
      "employment_end_date_shape",
      sql`${table.endDate} is null or ${table.endDate} glob '????-??-??'`,
    ),
  ],
);

export const assignment = sqliteTable(
  "assignment",
  {
    id: syntheticId(),
    personId: text("person_id")
      .notNull()
      .references(() => person.id),
    employmentId: text("employment_id").notNull(),
    assignmentCode: text("assignment_code").notNull(),
    organizationCode: text("organization_code").notNull(),
    positionCode: text("position_code"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
  },
  (table) => [
    uniqueIndex("assignment_assignment_code_unique").on(table.assignmentCode),
    foreignKey({
      name: "assignment_employment_person_match_fk",
      columns: [table.employmentId, table.personId],
      foreignColumns: [employment.id, employment.personId],
    }),
    check("assignment_id_non_empty", sql`length(${table.id}) > 0`),
    check(
      "assignment_code_non_empty",
      sql`length(${table.assignmentCode}) > 0`,
    ),
    check(
      "assignment_organization_code_non_empty",
      sql`length(${table.organizationCode}) > 0`,
    ),
    check(
      "assignment_start_date_shape",
      sql`${table.startDate} glob '????-??-??'`,
    ),
    check(
      "assignment_end_date_shape",
      sql`${table.endDate} is null or ${table.endDate} glob '????-??-??'`,
    ),
  ],
);

export const contact_point = sqliteTable(
  "contact_point",
  {
    id: syntheticId(),
    personId: text("person_id")
      .notNull()
      .references(() => person.id),
    contactType: text("contact_type", { enum: ["work_email"] }).notNull(),
    value: text("value").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("contact_point_person_type_unique").on(
      table.personId,
      table.contactType,
    ),
    check("contact_point_id_non_empty", sql`length(${table.id}) > 0`),
    check(
      "contact_point_type_allowed",
      sql`${table.contactType} in ('work_email')`,
    ),
    check("contact_point_value_non_empty", sql`length(${table.value}) > 0`),
    check(
      "contact_point_work_email_shape",
      sql`${table.contactType} != 'work_email' or instr(${table.value}, '@') > 1`,
    ),
    check(
      "contact_point_created_at_date",
      sql`${table.createdAt} glob '????-??-??*'`,
    ),
  ],
);

export const transaction_request = sqliteTable(
  "transaction_request",
  {
    id: syntheticId(),
    personId: text("person_id")
      .notNull()
      .references(() => person.id),
    requestType: text("request_type", {
      enum: ["hire", "change", "terminate"],
    }).notNull(),
    statusCode: text("status_code", {
      enum: ["draft", "submitted", "completed", "cancelled"],
    }).notNull(),
    requestedAt: text("requested_at").notNull(),
    correlationId: text("correlation_id"),
  },
  (table) => [
    uniqueIndex("transaction_request_id_person_unique").on(
      table.id,
      table.personId,
    ),
    check("transaction_request_id_non_empty", sql`length(${table.id}) > 0`),
    check(
      "transaction_request_type_allowed",
      sql`${table.requestType} in ('hire', 'change', 'terminate')`,
    ),
    check(
      "transaction_request_status_allowed",
      sql`${table.statusCode} in ('draft', 'submitted', 'completed', 'cancelled')`,
    ),
    check(
      "transaction_request_requested_at_date",
      sql`${table.requestedAt} glob '????-??-??*'`,
    ),
  ],
);

export const lifecycle_event = sqliteTable(
  "lifecycle_event",
  {
    id: syntheticId(),
    personId: text("person_id")
      .notNull()
      .references(() => person.id),
    transactionRequestId: text("transaction_request_id"),
    eventType: text("event_type", {
      enum: ["hire", "assignment_change", "termination"],
    }).notNull(),
    effectiveDate: text("effective_date").notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    foreignKey({
      name: "lifecycle_event_request_person_match_fk",
      columns: [table.transactionRequestId, table.personId],
      foreignColumns: [transaction_request.id, transaction_request.personId],
    }),
    check("lifecycle_event_id_non_empty", sql`length(${table.id}) > 0`),
    check(
      "lifecycle_event_type_allowed",
      sql`${table.eventType} in ('hire', 'assignment_change', 'termination')`,
    ),
    check(
      "lifecycle_event_effective_date_shape",
      sql`${table.effectiveDate} glob '????-??-??'`,
    ),
    check(
      "lifecycle_event_occurred_at_date",
      sql`${table.occurredAt} glob '????-??-??*'`,
    ),
  ],
);

export const audit_event = sqliteTable(
  "audit_event",
  {
    id: syntheticId(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    subjectTable: text("subject_table", {
      enum: [
        "person",
        "employment",
        "assignment",
        "contact_point",
        "transaction_request",
        "lifecycle_event",
      ],
    }).notNull(),
    subjectId: text("subject_id").notNull(),
    occurredAt: text("occurred_at").notNull(),
    correlationId: text("correlation_id"),
    pocMarker: text("poc_marker", { enum: ["synthetic_poc"] }).notNull(),
  },
  (table) => [
    check("audit_event_id_non_empty", sql`length(${table.id}) > 0`),
    check("audit_event_actor_id_non_empty", sql`length(${table.actorId}) > 0`),
    check("audit_event_action_non_empty", sql`length(${table.action}) > 0`),
    check(
      "audit_event_subject_table_allowed",
      sql`${table.subjectTable} in ('person', 'employment', 'assignment', 'contact_point', 'transaction_request', 'lifecycle_event')`,
    ),
    check(
      "audit_event_subject_id_non_empty",
      sql`length(${table.subjectId}) > 0`,
    ),
    check(
      "audit_event_occurred_at_date",
      sql`${table.occurredAt} glob '????-??-??*'`,
    ),
    check(
      "audit_event_poc_marker_allowed",
      sql`${table.pocMarker} in ('synthetic_poc')`,
    ),
  ],
);

export const schema = {
  person,
  employment,
  assignment,
  contact_point,
  transaction_request,
  lifecycle_event,
  audit_event,
};
