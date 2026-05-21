PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transaction_request` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`request_type` text NOT NULL,
	`status_code` text NOT NULL,
	`requested_at` text NOT NULL,
	`correlation_id` text,
	`payload_version` text,
	`payload_json` text,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transaction_request_id_non_empty" CHECK(length("__new_transaction_request"."id") > 0),
	CONSTRAINT "transaction_request_type_allowed" CHECK("__new_transaction_request"."request_type" in ('hire', 'change', 'terminate')),
	CONSTRAINT "transaction_request_status_allowed" CHECK("__new_transaction_request"."status_code" in ('draft', 'submitted', 'completed', 'cancelled')),
	CONSTRAINT "transaction_request_requested_at_date" CHECK("__new_transaction_request"."requested_at" glob '????-??-??*'),
	CONSTRAINT "transaction_request_payload_version_allowed" CHECK("__new_transaction_request"."payload_version" is null or "__new_transaction_request"."payload_version" in ('mvp_a_onboarding_v1')),
	CONSTRAINT "transaction_request_payload_pair" CHECK(("__new_transaction_request"."payload_version" is null and "__new_transaction_request"."payload_json" is null) or ("__new_transaction_request"."payload_version" is not null and "__new_transaction_request"."payload_json" is not null and length("__new_transaction_request"."payload_json") > 0))
);
--> statement-breakpoint
INSERT INTO `__new_transaction_request`("id", "person_id", "request_type", "status_code", "requested_at", "correlation_id", "payload_version", "payload_json") SELECT "id", "person_id", "request_type", "status_code", "requested_at", "correlation_id", NULL, NULL FROM `transaction_request`;--> statement-breakpoint
DROP TABLE `transaction_request`;--> statement-breakpoint
ALTER TABLE `__new_transaction_request` RENAME TO `transaction_request`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_request_id_person_unique` ON `transaction_request` (`id`,`person_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_request_correlation_unique` ON `transaction_request` (`correlation_id`);
