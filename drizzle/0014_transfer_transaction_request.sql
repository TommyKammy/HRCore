-- Rebuild request-dependent tables around the transaction_request rebuild so
-- SQLite foreign-key enforcement never sees a referenced request table drop.
CREATE TEMP TABLE `__transfer_migration_lifecycle_event_rows` AS SELECT "id", "person_id", "transaction_request_id", "contact_point_id", "event_type", "effective_date", "occurred_at" FROM `lifecycle_event`;
--> statement-breakpoint
CREATE TEMP TABLE `__transfer_migration_onboarding_apply_job_attempt_rows` AS SELECT "id", "transaction_request_id", "person_id", "status_code", "attempted_at", "worker_id", "correlation_id", "retryable", "error_message" FROM `onboarding_apply_job_attempt`;
--> statement-breakpoint
DROP TABLE `onboarding_apply_job_attempt`;
--> statement-breakpoint
DROP TABLE `lifecycle_event`;
--> statement-breakpoint
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
	CONSTRAINT "transaction_request_type_allowed" CHECK("__new_transaction_request"."request_type" in ('hire', 'change', 'terminate', 'transfer')),
	CONSTRAINT "transaction_request_status_allowed" CHECK("__new_transaction_request"."status_code" in ('draft', 'submitted', 'returned', 'rejected', 'cancelled', 'approved', 'completed')),
	CONSTRAINT "transaction_request_requested_at_date" CHECK("__new_transaction_request"."requested_at" glob '????-??-??*'),
	CONSTRAINT "transaction_request_payload_version_allowed" CHECK("__new_transaction_request"."payload_version" is null or "__new_transaction_request"."payload_version" in ('mvp_a_onboarding_v1', 'mvp_b_transfer_v1')),
	CONSTRAINT "transaction_request_payload_pair" CHECK(("__new_transaction_request"."payload_version" is null and "__new_transaction_request"."payload_json" is null) or ("__new_transaction_request"."payload_version" is not null and "__new_transaction_request"."payload_json" is not null and length("__new_transaction_request"."payload_json") > 0))
);
--> statement-breakpoint
INSERT INTO `__new_transaction_request`("id", "person_id", "request_type", "status_code", "requested_at", "correlation_id", "payload_version", "payload_json") SELECT "id", "person_id", "request_type", "status_code", "requested_at", "correlation_id", "payload_version", "payload_json" FROM `transaction_request`;
--> statement-breakpoint
DROP TABLE `transaction_request`;
--> statement-breakpoint
ALTER TABLE `__new_transaction_request` RENAME TO `transaction_request`;
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_request_id_person_unique` ON `transaction_request` (`id`,`person_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_request_correlation_unique` ON `transaction_request` (`correlation_id`);
--> statement-breakpoint
CREATE TABLE `lifecycle_event` (
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
	CONSTRAINT "lifecycle_event_id_non_empty" CHECK(length("lifecycle_event"."id") > 0),
	CONSTRAINT "lifecycle_event_type_allowed" CHECK("lifecycle_event"."event_type" in ('hire', 'assignment_change', 'termination')),
	CONSTRAINT "lifecycle_event_effective_date_shape" CHECK("lifecycle_event"."effective_date" glob '????-??-??'),
	CONSTRAINT "lifecycle_event_occurred_at_date" CHECK("lifecycle_event"."occurred_at" glob '????-??-??*')
);
--> statement-breakpoint
INSERT INTO `lifecycle_event`("id", "person_id", "transaction_request_id", "contact_point_id", "event_type", "effective_date", "occurred_at") SELECT "id", "person_id", "transaction_request_id", "contact_point_id", "event_type", "effective_date", "occurred_at" FROM `__transfer_migration_lifecycle_event_rows`;
--> statement-breakpoint
CREATE TABLE `onboarding_apply_job_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_request_id` text NOT NULL,
	`person_id` text NOT NULL,
	`status_code` text NOT NULL,
	`attempted_at` text NOT NULL,
	`worker_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	`retryable` integer NOT NULL,
	`error_message` text,
	CONSTRAINT "onboarding_apply_job_attempt_request_person_match_fk" FOREIGN KEY (`transaction_request_id`,`person_id`) REFERENCES `transaction_request`(`id`,`person_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "onboarding_apply_job_attempt_id_non_empty" CHECK(length("onboarding_apply_job_attempt"."id") > 0),
	CONSTRAINT "onboarding_apply_job_attempt_status_allowed" CHECK("onboarding_apply_job_attempt"."status_code" in ('applied', 'retryable_failure', 'non_retryable_failure')),
	CONSTRAINT "onboarding_apply_job_attempt_attempted_at_date" CHECK("onboarding_apply_job_attempt"."attempted_at" glob '????-??-??*'),
	CONSTRAINT "onboarding_apply_job_attempt_worker_id_non_empty" CHECK(length("onboarding_apply_job_attempt"."worker_id") > 0),
	CONSTRAINT "onboarding_apply_job_attempt_correlation_id_non_empty" CHECK(length("onboarding_apply_job_attempt"."correlation_id") > 0),
	CONSTRAINT "onboarding_apply_job_attempt_error_pair" CHECK(("onboarding_apply_job_attempt"."status_code" = 'applied' and "onboarding_apply_job_attempt"."error_message" is null and "onboarding_apply_job_attempt"."retryable" = 0) or ("onboarding_apply_job_attempt"."status_code" != 'applied' and "onboarding_apply_job_attempt"."error_message" is not null and length("onboarding_apply_job_attempt"."error_message") > 0))
);
--> statement-breakpoint
INSERT INTO `onboarding_apply_job_attempt`("id", "transaction_request_id", "person_id", "status_code", "attempted_at", "worker_id", "correlation_id", "retryable", "error_message") SELECT "id", "transaction_request_id", "person_id", "status_code", "attempted_at", "worker_id", "correlation_id", "retryable", "error_message" FROM `__transfer_migration_onboarding_apply_job_attempt_rows`;
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_apply_job_attempt_correlation_unique` ON `onboarding_apply_job_attempt` (`correlation_id`);
--> statement-breakpoint
CREATE INDEX `onboarding_apply_job_attempt_request_status_idx` ON `onboarding_apply_job_attempt` (`transaction_request_id`,`status_code`);
--> statement-breakpoint
DROP TABLE `__transfer_migration_lifecycle_event_rows`;
--> statement-breakpoint
DROP TABLE `__transfer_migration_onboarding_apply_job_attempt_rows`;
