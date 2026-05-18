CREATE TABLE `writeback_event` (
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
	FOREIGN KEY (`contact_point_id`) REFERENCES `contact_point`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "writeback_event_id_non_empty" CHECK(length("writeback_event"."id") > 0),
	CONSTRAINT "writeback_event_contact_point_id_non_empty" CHECK(length("writeback_event"."contact_point_id") > 0),
	CONSTRAINT "writeback_event_provider_name_allowed" CHECK("writeback_event"."provider_name" in ('synthetic_okta')),
	CONSTRAINT "writeback_event_provider_subject_id_non_empty" CHECK(length("writeback_event"."provider_subject_id") > 0),
	CONSTRAINT "writeback_event_provider_value_non_empty" CHECK(length("writeback_event"."provider_value") > 0),
	CONSTRAINT "writeback_event_provider_work_email_shape" CHECK("writeback_event"."target_contact_type" != 'work_email' or instr("writeback_event"."provider_value", '@') > 1),
	CONSTRAINT "writeback_event_target_contact_type_allowed" CHECK("writeback_event"."target_contact_type" in ('work_email')),
	CONSTRAINT "writeback_event_correlation_id_non_empty" CHECK(length("writeback_event"."correlation_id") > 0),
	CONSTRAINT "writeback_event_received_at_date" CHECK("writeback_event"."received_at" glob '????-??-??*'),
	CONSTRAINT "writeback_event_poc_marker_allowed" CHECK("writeback_event"."poc_marker" in ('synthetic_poc'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `writeback_event_correlation_unique` ON `writeback_event` (`correlation_id`);