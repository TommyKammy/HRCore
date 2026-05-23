CREATE TABLE `onboarding_apply_job_run` (
	`id` text PRIMARY KEY NOT NULL,
	`correlation_id` text NOT NULL,
	`worker_id` text NOT NULL,
	`started_at` text NOT NULL,
	`effective_date` text NOT NULL,
	`attempted` integer NOT NULL,
	`applied` integer NOT NULL,
	`failed` integer NOT NULL,
	`skipped` integer NOT NULL,
	CONSTRAINT "onboarding_apply_job_run_id_non_empty" CHECK(length("onboarding_apply_job_run"."id") > 0),
	CONSTRAINT "onboarding_apply_job_run_correlation_id_non_empty" CHECK(length("onboarding_apply_job_run"."correlation_id") > 0),
	CONSTRAINT "onboarding_apply_job_run_worker_id_non_empty" CHECK(length("onboarding_apply_job_run"."worker_id") > 0),
	CONSTRAINT "onboarding_apply_job_run_started_at_date" CHECK("onboarding_apply_job_run"."started_at" glob '????-??-??*'),
	CONSTRAINT "onboarding_apply_job_run_effective_date_shape" CHECK("onboarding_apply_job_run"."effective_date" glob '????-??-??'),
	CONSTRAINT "onboarding_apply_job_run_counts_non_negative" CHECK("onboarding_apply_job_run"."attempted" >= 0 and "onboarding_apply_job_run"."applied" >= 0 and "onboarding_apply_job_run"."failed" >= 0 and "onboarding_apply_job_run"."skipped" >= 0),
	CONSTRAINT "onboarding_apply_job_run_counts_consistent" CHECK("onboarding_apply_job_run"."attempted" = "onboarding_apply_job_run"."applied" + "onboarding_apply_job_run"."failed")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_apply_job_run_correlation_unique` ON `onboarding_apply_job_run` (`correlation_id`);