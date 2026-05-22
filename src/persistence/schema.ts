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
    uniqueIndex("contact_point_id_person_unique").on(table.id, table.personId),
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

export const writeback_event = sqliteTable(
  "writeback_event",
  {
    id: syntheticId(),
    personId: text("person_id")
      .notNull()
      .references(() => person.id),
    contactPointId: text("contact_point_id").notNull(),
    providerName: text("provider_name", { enum: ["synthetic_okta"] }).notNull(),
    providerSubjectId: text("provider_subject_id").notNull(),
    providerValue: text("provider_value").notNull(),
    targetContactType: text("target_contact_type", {
      enum: ["work_email"],
    }).notNull(),
    correlationId: text("correlation_id").notNull(),
    receivedAt: text("received_at").notNull(),
    pocMarker: text("poc_marker", { enum: ["synthetic_poc"] })
      .notNull()
      .default("synthetic_poc"),
  },
  (table) => [
    uniqueIndex("writeback_event_correlation_unique").on(table.correlationId),
    foreignKey({
      name: "writeback_event_contact_point_person_match_fk",
      columns: [table.contactPointId, table.personId],
      foreignColumns: [contact_point.id, contact_point.personId],
    }),
    check("writeback_event_id_non_empty", sql`length(${table.id}) > 0`),
    check(
      "writeback_event_contact_point_id_non_empty",
      sql`length(${table.contactPointId}) > 0`,
    ),
    check(
      "writeback_event_provider_name_allowed",
      sql`${table.providerName} in ('synthetic_okta')`,
    ),
    check(
      "writeback_event_provider_subject_id_non_empty",
      sql`length(${table.providerSubjectId}) > 0`,
    ),
    check(
      "writeback_event_provider_value_non_empty",
      sql`length(${table.providerValue}) > 0`,
    ),
    check(
      "writeback_event_provider_work_email_shape",
      sql`${table.targetContactType} != 'work_email' or instr(${table.providerValue}, '@') > 1`,
    ),
    check(
      "writeback_event_target_contact_type_allowed",
      sql`${table.targetContactType} in ('work_email')`,
    ),
    check(
      "writeback_event_correlation_id_non_empty",
      sql`length(${table.correlationId}) > 0`,
    ),
    check(
      "writeback_event_received_at_date",
      sql`${table.receivedAt} glob '????-??-??*'`,
    ),
    check(
      "writeback_event_poc_marker_allowed",
      sql`${table.pocMarker} in ('synthetic_poc')`,
    ),
  ],
);

export const writeback_provider_refresh = sqliteTable(
  "writeback_provider_refresh",
  {
    id: syntheticId(),
    writebackEventId: text("writeback_event_id")
      .notNull()
      .references(() => writeback_event.id),
    personId: text("person_id")
      .notNull()
      .references(() => person.id),
    contactPointId: text("contact_point_id").notNull(),
    providerName: text("provider_name", { enum: ["synthetic_okta"] }).notNull(),
    providerSubjectId: text("provider_subject_id").notNull(),
    providerValue: text("provider_value").notNull(),
    refreshedAt: text("refreshed_at").notNull(),
    correlationId: text("correlation_id").notNull(),
    pocMarker: text("poc_marker", { enum: ["synthetic_poc"] })
      .notNull()
      .default("synthetic_poc"),
  },
  (table) => [
    uniqueIndex("writeback_provider_refresh_correlation_unique").on(
      table.correlationId,
    ),
    foreignKey({
      name: "writeback_provider_refresh_contact_point_person_match_fk",
      columns: [table.contactPointId, table.personId],
      foreignColumns: [contact_point.id, contact_point.personId],
    }),
    check(
      "writeback_provider_refresh_id_non_empty",
      sql`length(${table.id}) > 0`,
    ),
    check(
      "writeback_provider_refresh_event_id_non_empty",
      sql`length(${table.writebackEventId}) > 0`,
    ),
    check(
      "writeback_provider_refresh_contact_point_id_non_empty",
      sql`length(${table.contactPointId}) > 0`,
    ),
    check(
      "writeback_provider_refresh_provider_name_allowed",
      sql`${table.providerName} in ('synthetic_okta')`,
    ),
    check(
      "writeback_provider_refresh_provider_subject_id_non_empty",
      sql`length(${table.providerSubjectId}) > 0`,
    ),
    check(
      "writeback_provider_refresh_provider_value_non_empty",
      sql`length(${table.providerValue}) > 0`,
    ),
    check(
      "writeback_provider_refresh_provider_work_email_shape",
      sql`instr(${table.providerValue}, '@') > 1`,
    ),
    check(
      "writeback_provider_refresh_refreshed_at_date",
      sql`${table.refreshedAt} glob '????-??-??*'`,
    ),
    check(
      "writeback_provider_refresh_correlation_id_non_empty",
      sql`length(${table.correlationId}) > 0`,
    ),
    check(
      "writeback_provider_refresh_poc_marker_allowed",
      sql`${table.pocMarker} in ('synthetic_poc')`,
    ),
  ],
);

export const writeback_work_email_conflict = sqliteTable(
  "writeback_work_email_conflict",
  {
    id: syntheticId(),
    writebackEventId: text("writeback_event_id")
      .notNull()
      .references(() => writeback_event.id),
    personId: text("person_id")
      .notNull()
      .references(() => person.id),
    contactPointId: text("contact_point_id").notNull(),
    providerName: text("provider_name", { enum: ["synthetic_okta"] }).notNull(),
    providerSubjectId: text("provider_subject_id").notNull(),
    conflictType: text("conflict_type", {
      enum: ["inbound_value_conflict", "provider_refresh_conflict"],
    }).notNull(),
    currentContactValue: text("current_contact_value").notNull(),
    attemptedProviderValue: text("attempted_provider_value").notNull(),
    detectedAt: text("detected_at").notNull(),
    correlationId: text("correlation_id").notNull(),
    pocMarker: text("poc_marker", { enum: ["synthetic_poc"] })
      .notNull()
      .default("synthetic_poc"),
  },
  (table) => [
    uniqueIndex("writeback_work_email_conflict_correlation_unique").on(
      table.correlationId,
    ),
    foreignKey({
      name: "writeback_work_email_conflict_contact_point_person_match_fk",
      columns: [table.contactPointId, table.personId],
      foreignColumns: [contact_point.id, contact_point.personId],
    }),
    check(
      "writeback_work_email_conflict_id_non_empty",
      sql`length(${table.id}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_event_id_non_empty",
      sql`length(${table.writebackEventId}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_contact_point_id_non_empty",
      sql`length(${table.contactPointId}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_provider_name_allowed",
      sql`${table.providerName} in ('synthetic_okta')`,
    ),
    check(
      "writeback_work_email_conflict_provider_subject_id_non_empty",
      sql`length(${table.providerSubjectId}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_type_allowed",
      sql`${table.conflictType} in ('inbound_value_conflict', 'provider_refresh_conflict')`,
    ),
    check(
      "writeback_work_email_conflict_current_value_shape",
      sql`instr(${table.currentContactValue}, '@') > 1`,
    ),
    check(
      "writeback_work_email_conflict_attempted_value_shape",
      sql`instr(${table.attemptedProviderValue}, '@') > 1`,
    ),
    check(
      "writeback_work_email_conflict_detected_at_date",
      sql`${table.detectedAt} glob '????-??-??*'`,
    ),
    check(
      "writeback_work_email_conflict_correlation_id_non_empty",
      sql`length(${table.correlationId}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_poc_marker_allowed",
      sql`${table.pocMarker} in ('synthetic_poc')`,
    ),
  ],
);

export const writeback_work_email_conflict_resolution = sqliteTable(
  "writeback_work_email_conflict_resolution",
  {
    id: syntheticId(),
    conflictId: text("conflict_id")
      .notNull()
      .references(() => writeback_work_email_conflict.id),
    writebackEventId: text("writeback_event_id")
      .notNull()
      .references(() => writeback_event.id),
    personId: text("person_id")
      .notNull()
      .references(() => person.id),
    contactPointId: text("contact_point_id").notNull(),
    providerName: text("provider_name", { enum: ["synthetic_okta"] }).notNull(),
    providerSubjectId: text("provider_subject_id").notNull(),
    decision: text("decision", { enum: ["accept_provider_value"] }).notNull(),
    currentContactValue: text("current_contact_value").notNull(),
    resolvedProviderValue: text("resolved_provider_value").notNull(),
    decidedAt: text("decided_at").notNull(),
    decidedBy: text("decided_by").notNull(),
    correlationId: text("correlation_id").notNull(),
    pocMarker: text("poc_marker", { enum: ["synthetic_poc"] })
      .notNull()
      .default("synthetic_poc"),
  },
  (table) => [
    uniqueIndex("writeback_work_email_conflict_resolution_unique").on(
      table.conflictId,
    ),
    uniqueIndex(
      "writeback_work_email_conflict_resolution_correlation_unique",
    ).on(table.correlationId),
    foreignKey({
      name: "writeback_work_email_conflict_resolution_contact_point_person_match_fk",
      columns: [table.contactPointId, table.personId],
      foreignColumns: [contact_point.id, contact_point.personId],
    }),
    check(
      "writeback_work_email_conflict_resolution_id_non_empty",
      sql`length(${table.id}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_resolution_conflict_id_non_empty",
      sql`length(${table.conflictId}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_resolution_event_id_non_empty",
      sql`length(${table.writebackEventId}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_resolution_contact_point_id_non_empty",
      sql`length(${table.contactPointId}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_resolution_provider_name_allowed",
      sql`${table.providerName} in ('synthetic_okta')`,
    ),
    check(
      "writeback_work_email_conflict_resolution_provider_subject_id_non_empty",
      sql`length(${table.providerSubjectId}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_resolution_decision_allowed",
      sql`${table.decision} in ('accept_provider_value')`,
    ),
    check(
      "writeback_work_email_conflict_resolution_current_value_shape",
      sql`instr(${table.currentContactValue}, '@') > 1`,
    ),
    check(
      "writeback_work_email_conflict_resolution_resolved_value_shape",
      sql`instr(${table.resolvedProviderValue}, '@') > 1`,
    ),
    check(
      "writeback_work_email_conflict_resolution_decided_at_date",
      sql`${table.decidedAt} glob '????-??-??*'`,
    ),
    check(
      "writeback_work_email_conflict_resolution_decided_by_non_empty",
      sql`length(${table.decidedBy}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_resolution_correlation_id_non_empty",
      sql`length(${table.correlationId}) > 0`,
    ),
    check(
      "writeback_work_email_conflict_resolution_poc_marker_allowed",
      sql`${table.pocMarker} in ('synthetic_poc')`,
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
      enum: [
        "draft",
        "submitted",
        "returned",
        "rejected",
        "cancelled",
        "approved",
        "completed",
      ],
    }).notNull(),
    requestedAt: text("requested_at").notNull(),
    correlationId: text("correlation_id"),
    payloadVersion: text("payload_version", {
      enum: ["mvp_a_onboarding_v1"],
    }),
    payloadJson: text("payload_json"),
  },
  (table) => [
    uniqueIndex("transaction_request_id_person_unique").on(
      table.id,
      table.personId,
    ),
    uniqueIndex("transaction_request_correlation_unique").on(
      table.correlationId,
    ),
    check("transaction_request_id_non_empty", sql`length(${table.id}) > 0`),
    check(
      "transaction_request_type_allowed",
      sql`${table.requestType} in ('hire', 'change', 'terminate')`,
    ),
    check(
      "transaction_request_status_allowed",
      sql`${table.statusCode} in ('draft', 'submitted', 'returned', 'rejected', 'cancelled', 'approved', 'completed')`,
    ),
    check(
      "transaction_request_requested_at_date",
      sql`${table.requestedAt} glob '????-??-??*'`,
    ),
    check(
      "transaction_request_payload_version_allowed",
      sql`${table.payloadVersion} is null or ${table.payloadVersion} in ('mvp_a_onboarding_v1')`,
    ),
    check(
      "transaction_request_payload_pair",
      sql`(${table.payloadVersion} is null and ${table.payloadJson} is null) or (${table.payloadVersion} is not null and ${table.payloadJson} is not null and length(${table.payloadJson}) > 0)`,
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
    contactPointId: text("contact_point_id"),
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
    foreignKey({
      name: "lifecycle_event_contact_point_person_match_fk",
      columns: [table.contactPointId, table.personId],
      foreignColumns: [contact_point.id, contact_point.personId],
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
    pocMarker: text("poc_marker", { enum: ["synthetic_poc"] })
      .notNull()
      .default("synthetic_poc"),
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

export const onboarding_apply_job_attempt = sqliteTable(
  "onboarding_apply_job_attempt",
  {
    id: syntheticId(),
    transactionRequestId: text("transaction_request_id").notNull(),
    personId: text("person_id").notNull(),
    statusCode: text("status_code", {
      enum: ["applied", "retryable_failure", "non_retryable_failure"],
    }).notNull(),
    attemptedAt: text("attempted_at").notNull(),
    workerId: text("worker_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    retryable: integer("retryable", { mode: "boolean" }).notNull(),
    errorMessage: text("error_message"),
  },
  (table) => [
    uniqueIndex("onboarding_apply_job_attempt_correlation_unique").on(
      table.correlationId,
    ),
    foreignKey({
      name: "onboarding_apply_job_attempt_request_person_match_fk",
      columns: [table.transactionRequestId, table.personId],
      foreignColumns: [transaction_request.id, transaction_request.personId],
    }),
    check(
      "onboarding_apply_job_attempt_id_non_empty",
      sql`length(${table.id}) > 0`,
    ),
    check(
      "onboarding_apply_job_attempt_status_allowed",
      sql`${table.statusCode} in ('applied', 'retryable_failure', 'non_retryable_failure')`,
    ),
    check(
      "onboarding_apply_job_attempt_attempted_at_date",
      sql`${table.attemptedAt} glob '????-??-??*'`,
    ),
    check(
      "onboarding_apply_job_attempt_worker_id_non_empty",
      sql`length(${table.workerId}) > 0`,
    ),
    check(
      "onboarding_apply_job_attempt_correlation_id_non_empty",
      sql`length(${table.correlationId}) > 0`,
    ),
    check(
      "onboarding_apply_job_attempt_error_pair",
      sql`(${table.statusCode} = 'applied' and ${table.errorMessage} is null and ${table.retryable} = 0) or (${table.statusCode} != 'applied' and ${table.errorMessage} is not null and length(${table.errorMessage}) > 0)`,
    ),
  ],
);

export const schema = {
  person,
  employment,
  assignment,
  contact_point,
  writeback_event,
  writeback_provider_refresh,
  writeback_work_email_conflict,
  writeback_work_email_conflict_resolution,
  transaction_request,
  lifecycle_event,
  audit_event,
  onboarding_apply_job_attempt,
};
