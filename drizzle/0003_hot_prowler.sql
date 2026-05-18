PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE UNIQUE INDEX `contact_point_id_person_unique` ON `contact_point` (`id`,`person_id`);--> statement-breakpoint
CREATE TABLE `__new_writeback_event` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`contact_point_id` text NOT NULL,
	`provider_name` text NOT NULL,
	`provider_subject_id` text NOT NULL,
	`provider_value` text NOT NULL,
	`target_contact_type` text NOT NULL,
	`correlation_id` text NOT NULL,
	`received_at` text NOT NULL,
	`poc_marker` text DEFAULT 'synthetic_poc' NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_point_id`,`person_id`) REFERENCES `contact_point`(`id`,`person_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "writeback_event_id_non_empty" CHECK(length("__new_writeback_event"."id") > 0),
	CONSTRAINT "writeback_event_contact_point_id_non_empty" CHECK(length("__new_writeback_event"."contact_point_id") > 0),
	CONSTRAINT "writeback_event_provider_name_allowed" CHECK("__new_writeback_event"."provider_name" in ('synthetic_okta')),
	CONSTRAINT "writeback_event_provider_subject_id_non_empty" CHECK(length("__new_writeback_event"."provider_subject_id") > 0),
	CONSTRAINT "writeback_event_provider_value_non_empty" CHECK(length("__new_writeback_event"."provider_value") > 0),
	CONSTRAINT "writeback_event_provider_work_email_shape" CHECK("__new_writeback_event"."target_contact_type" != 'work_email' or instr("__new_writeback_event"."provider_value", '@') > 1),
	CONSTRAINT "writeback_event_target_contact_type_allowed" CHECK("__new_writeback_event"."target_contact_type" in ('work_email')),
	CONSTRAINT "writeback_event_correlation_id_non_empty" CHECK(length("__new_writeback_event"."correlation_id") > 0),
	CONSTRAINT "writeback_event_received_at_date" CHECK("__new_writeback_event"."received_at" glob '????-??-??*'),
	CONSTRAINT "writeback_event_poc_marker_allowed" CHECK("__new_writeback_event"."poc_marker" in ('synthetic_poc'))
);
--> statement-breakpoint
INSERT INTO `__new_writeback_event`("id", "person_id", "contact_point_id", "provider_name", "provider_subject_id", "provider_value", "target_contact_type", "correlation_id", "received_at", "poc_marker") SELECT "id", "person_id", "contact_point_id", "provider_name", "provider_subject_id", "provider_value", "target_contact_type", "correlation_id", "received_at", "poc_marker" FROM `writeback_event`;--> statement-breakpoint
DROP TABLE `writeback_event`;--> statement-breakpoint
ALTER TABLE `__new_writeback_event` RENAME TO `writeback_event`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `writeback_event_correlation_unique` ON `writeback_event` (`correlation_id`);
