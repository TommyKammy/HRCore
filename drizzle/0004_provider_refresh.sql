CREATE TABLE `writeback_provider_refresh` (
	`id` text PRIMARY KEY NOT NULL,
	`writeback_event_id` text NOT NULL,
	`person_id` text NOT NULL,
	`contact_point_id` text NOT NULL,
	`provider_name` text NOT NULL,
	`provider_subject_id` text NOT NULL,
	`provider_value` text NOT NULL,
	`refreshed_at` text NOT NULL,
	`correlation_id` text NOT NULL,
	`poc_marker` text DEFAULT 'synthetic_poc' NOT NULL,
	FOREIGN KEY (`writeback_event_id`) REFERENCES `writeback_event`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_point_id`,`person_id`) REFERENCES `contact_point`(`id`,`person_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "writeback_provider_refresh_id_non_empty" CHECK(length("writeback_provider_refresh"."id") > 0),
	CONSTRAINT "writeback_provider_refresh_event_id_non_empty" CHECK(length("writeback_provider_refresh"."writeback_event_id") > 0),
	CONSTRAINT "writeback_provider_refresh_contact_point_id_non_empty" CHECK(length("writeback_provider_refresh"."contact_point_id") > 0),
	CONSTRAINT "writeback_provider_refresh_provider_name_allowed" CHECK("writeback_provider_refresh"."provider_name" in ('synthetic_okta')),
	CONSTRAINT "writeback_provider_refresh_provider_subject_id_non_empty" CHECK(length("writeback_provider_refresh"."provider_subject_id") > 0),
	CONSTRAINT "writeback_provider_refresh_provider_value_non_empty" CHECK(length("writeback_provider_refresh"."provider_value") > 0),
	CONSTRAINT "writeback_provider_refresh_provider_work_email_shape" CHECK(instr("writeback_provider_refresh"."provider_value", '@') > 1),
	CONSTRAINT "writeback_provider_refresh_refreshed_at_date" CHECK("writeback_provider_refresh"."refreshed_at" glob '????-??-??*'),
	CONSTRAINT "writeback_provider_refresh_correlation_id_non_empty" CHECK(length("writeback_provider_refresh"."correlation_id") > 0),
	CONSTRAINT "writeback_provider_refresh_poc_marker_allowed" CHECK("writeback_provider_refresh"."poc_marker" in ('synthetic_poc'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `writeback_provider_refresh_correlation_unique` ON `writeback_provider_refresh` (`correlation_id`);