PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_lifecycle_event` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`transaction_request_id` text,
	`contact_point_id` text,
	`event_type` text NOT NULL,
	`effective_date` text NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_request_id`,`person_id`) REFERENCES `transaction_request`(`id`,`person_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_point_id`,`person_id`) REFERENCES `contact_point`(`id`,`person_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "lifecycle_event_id_non_empty" CHECK(length("__new_lifecycle_event"."id") > 0),
	CONSTRAINT "lifecycle_event_type_allowed" CHECK("__new_lifecycle_event"."event_type" in ('hire', 'assignment_change', 'termination')),
	CONSTRAINT "lifecycle_event_effective_date_shape" CHECK("__new_lifecycle_event"."effective_date" glob '????-??-??'),
	CONSTRAINT "lifecycle_event_occurred_at_date" CHECK("__new_lifecycle_event"."occurred_at" glob '????-??-??*')
);
--> statement-breakpoint
INSERT INTO `__new_lifecycle_event`("id", "person_id", "transaction_request_id", "contact_point_id", "event_type", "effective_date", "occurred_at") SELECT "id", "person_id", "transaction_request_id", "contact_point_id", "event_type", "effective_date", "occurred_at" FROM `lifecycle_event`;--> statement-breakpoint
DROP TABLE `lifecycle_event`;--> statement-breakpoint
ALTER TABLE `__new_lifecycle_event` RENAME TO `lifecycle_event`;--> statement-breakpoint
PRAGMA foreign_keys=ON;