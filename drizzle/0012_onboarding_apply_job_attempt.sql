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
CREATE UNIQUE INDEX `onboarding_apply_job_attempt_correlation_unique` ON `onboarding_apply_job_attempt` (`correlation_id`);
--> statement-breakpoint
CREATE INDEX `onboarding_apply_job_attempt_request_status_idx` ON `onboarding_apply_job_attempt` (`transaction_request_id`,`status_code`);
