PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`subject_table` text NOT NULL,
	`subject_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`correlation_id` text,
	`poc_marker` text DEFAULT 'synthetic_poc' NOT NULL,
	CONSTRAINT "audit_event_id_non_empty" CHECK(length("__new_audit_event"."id") > 0),
	CONSTRAINT "audit_event_actor_id_non_empty" CHECK(length("__new_audit_event"."actor_id") > 0),
	CONSTRAINT "audit_event_action_non_empty" CHECK(length("__new_audit_event"."action") > 0),
	CONSTRAINT "audit_event_subject_table_allowed" CHECK("__new_audit_event"."subject_table" in ('person', 'employment', 'assignment', 'contact_point', 'transaction_request', 'lifecycle_event')),
	CONSTRAINT "audit_event_subject_id_non_empty" CHECK(length("__new_audit_event"."subject_id") > 0),
	CONSTRAINT "audit_event_occurred_at_date" CHECK("__new_audit_event"."occurred_at" glob '????-??-??*'),
	CONSTRAINT "audit_event_poc_marker_allowed" CHECK("__new_audit_event"."poc_marker" in ('synthetic_poc'))
);
--> statement-breakpoint
INSERT INTO `__new_audit_event`("id", "actor_id", "action", "subject_table", "subject_id", "occurred_at", "correlation_id", "poc_marker") SELECT "id", "actor_id", "action", "subject_table", "subject_id", "occurred_at", "correlation_id", 'synthetic_poc' FROM `audit_event`;--> statement-breakpoint
DROP TABLE `audit_event`;--> statement-breakpoint
ALTER TABLE `__new_audit_event` RENAME TO `audit_event`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
