CREATE TABLE `csv_import_job` (
	`id` text PRIMARY KEY NOT NULL,
	`correlation_id` text NOT NULL,
	`import_fingerprint` text NOT NULL,
	`template_version` text NOT NULL,
	`tenant_environment_id` text NOT NULL,
	`status_code` text NOT NULL,
	`requested_at` text NOT NULL,
	`requested_by` text NOT NULL,
	`accepted_rows` integer NOT NULL,
	`failed_rows` integer NOT NULL,
	CONSTRAINT "csv_import_job_id_non_empty" CHECK(length("csv_import_job"."id") > 0),
	CONSTRAINT "csv_import_job_correlation_id_non_empty" CHECK(length("csv_import_job"."correlation_id") > 0),
	CONSTRAINT "csv_import_job_import_fingerprint_non_empty" CHECK(length("csv_import_job"."import_fingerprint") > 0),
	CONSTRAINT "csv_import_job_template_version_allowed" CHECK("csv_import_job"."template_version" = 'mvp_d_lifecycle_support_v1'),
	CONSTRAINT "csv_import_job_tenant_environment_allowed" CHECK("csv_import_job"."tenant_environment_id" = 'repo_owned_synthetic_mvp_d_csv'),
	CONSTRAINT "csv_import_job_status_allowed" CHECK("csv_import_job"."status_code" in ('applied', 'failed')),
	CONSTRAINT "csv_import_job_requested_at_date" CHECK("csv_import_job"."requested_at" glob '????-??-??*'),
	CONSTRAINT "csv_import_job_requested_by_non_empty" CHECK(length("csv_import_job"."requested_by") > 0),
	CONSTRAINT "csv_import_job_counts_non_negative" CHECK("csv_import_job"."accepted_rows" >= 0 and "csv_import_job"."failed_rows" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `csv_import_job_correlation_unique` ON `csv_import_job` (`correlation_id`);--> statement-breakpoint
CREATE TABLE `csv_import_row_outcome` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`row_id` text NOT NULL,
	`lifecycle_type` text NOT NULL,
	`status_code` text NOT NULL,
	`transaction_request_id` text,
	`lifecycle_event_id` text,
	`row_fingerprint` text NOT NULL,
	`error_message` text,
	`correlation_id` text NOT NULL,
	`decided_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `csv_import_job`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "csv_import_row_outcome_id_non_empty" CHECK(length("csv_import_row_outcome"."id") > 0),
	CONSTRAINT "csv_import_row_outcome_row_id_non_empty" CHECK(length("csv_import_row_outcome"."row_id") > 0),
	CONSTRAINT "csv_import_row_outcome_lifecycle_type_allowed" CHECK("csv_import_row_outcome"."lifecycle_type" in ('onboarding', 'transfer', 'termination')),
	CONSTRAINT "csv_import_row_outcome_status_allowed" CHECK("csv_import_row_outcome"."status_code" in ('applied', 'failed', 'idempotent')),
	CONSTRAINT "csv_import_row_outcome_row_fingerprint_non_empty" CHECK(length("csv_import_row_outcome"."row_fingerprint") > 0),
	CONSTRAINT "csv_import_row_outcome_correlation_id_non_empty" CHECK(length("csv_import_row_outcome"."correlation_id") > 0),
	CONSTRAINT "csv_import_row_outcome_decided_at_date" CHECK("csv_import_row_outcome"."decided_at" glob '????-??-??*'),
	CONSTRAINT "csv_import_row_outcome_status_payload_pair" CHECK(("csv_import_row_outcome"."status_code" in ('applied', 'idempotent') and "csv_import_row_outcome"."transaction_request_id" is not null and "csv_import_row_outcome"."lifecycle_event_id" is not null and "csv_import_row_outcome"."error_message" is null) or ("csv_import_row_outcome"."status_code" = 'failed' and "csv_import_row_outcome"."transaction_request_id" is null and "csv_import_row_outcome"."lifecycle_event_id" is null and "csv_import_row_outcome"."error_message" is not null and length("csv_import_row_outcome"."error_message") > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `csv_import_row_outcome_job_row_unique` ON `csv_import_row_outcome` (`job_id`,`row_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `csv_import_row_outcome_correlation_unique` ON `csv_import_row_outcome` (`correlation_id`);
