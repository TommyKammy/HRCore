CREATE TABLE `local_ops_failure_decision` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow` text NOT NULL,
	`source_type` text NOT NULL,
	`job_correlation_id` text NOT NULL,
	`row_id` text NOT NULL,
	`decision` text NOT NULL,
	`failure_status` text NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`evidence_version` text NOT NULL,
	`reason` text NOT NULL,
	`decided_at` text NOT NULL,
	`decided_by` text NOT NULL,
	`decision_correlation_id` text NOT NULL,
	`audit_event_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`audit_event_id`) REFERENCES `audit_event`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "local_ops_failure_decision_workflow_allowed" CHECK("local_ops_failure_decision"."workflow" = 'csv_import'),
	CONSTRAINT "local_ops_failure_decision_source_type_allowed" CHECK("local_ops_failure_decision"."source_type" = 'repo_owned_synthetic_mvp_d_csv_failure'),
	CONSTRAINT "local_ops_failure_decision_id_non_empty" CHECK(length("local_ops_failure_decision"."id") > 0),
	CONSTRAINT "local_ops_failure_decision_job_correlation_non_empty" CHECK(length("local_ops_failure_decision"."job_correlation_id") > 0),
	CONSTRAINT "local_ops_failure_decision_row_id_non_empty" CHECK(length("local_ops_failure_decision"."row_id") > 0),
	CONSTRAINT "local_ops_failure_decision_decision_allowed" CHECK("local_ops_failure_decision"."decision" in ('retry', 'replay', 'ignore', 'close')),
	CONSTRAINT "local_ops_failure_decision_failure_status_allowed" CHECK("local_ops_failure_decision"."failure_status" in ('open', 'replayed', 'ignored', 'closed')),
	CONSTRAINT "local_ops_failure_decision_status_consistent" CHECK(("local_ops_failure_decision"."decision" = 'retry' and "local_ops_failure_decision"."failure_status" = 'open') or ("local_ops_failure_decision"."decision" = 'replay' and "local_ops_failure_decision"."failure_status" = 'replayed') or ("local_ops_failure_decision"."decision" = 'ignore' and "local_ops_failure_decision"."failure_status" = 'ignored') or ("local_ops_failure_decision"."decision" = 'close' and "local_ops_failure_decision"."failure_status" = 'closed')),
	CONSTRAINT "local_ops_failure_decision_retry_count_range" CHECK("local_ops_failure_decision"."retry_count" >= 0 and "local_ops_failure_decision"."retry_count" <= 3),
	CONSTRAINT "local_ops_failure_decision_evidence_version_non_empty" CHECK(length("local_ops_failure_decision"."evidence_version") > 0),
	CONSTRAINT "local_ops_failure_decision_reason_non_empty" CHECK(length("local_ops_failure_decision"."reason") > 0),
	CONSTRAINT "local_ops_failure_decision_decided_at_date" CHECK("local_ops_failure_decision"."decided_at" glob '????-??-??*'),
	CONSTRAINT "local_ops_failure_decision_decided_by_non_empty" CHECK(length("local_ops_failure_decision"."decided_by") > 0),
	CONSTRAINT "local_ops_failure_decision_correlation_non_empty" CHECK(length("local_ops_failure_decision"."decision_correlation_id") > 0),
	CONSTRAINT "local_ops_failure_decision_audit_event_non_empty" CHECK(length("local_ops_failure_decision"."audit_event_id") > 0),
	CONSTRAINT "local_ops_failure_decision_created_at_date" CHECK("local_ops_failure_decision"."created_at" glob '????-??-??*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_ops_failure_decision_correlation_unique` ON `local_ops_failure_decision` (`decision_correlation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_ops_failure_decision_audit_event_unique` ON `local_ops_failure_decision` (`audit_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `local_ops_failure_decision_replay_unique` ON `local_ops_failure_decision` (`workflow`,`job_correlation_id`,`row_id`,`decision`) WHERE "local_ops_failure_decision"."decision" = 'replay';--> statement-breakpoint
CREATE UNIQUE INDEX `local_ops_failure_decision_retry_attempt_unique` ON `local_ops_failure_decision` (`workflow`,`job_correlation_id`,`row_id`,`decision`,`retry_count`) WHERE "local_ops_failure_decision"."decision" = 'retry';--> statement-breakpoint
CREATE TRIGGER `local_ops_failure_decision_replay_guard`
BEFORE INSERT ON `local_ops_failure_decision`
WHEN NEW.decision = 'replay'
  AND EXISTS (
    SELECT 1
    FROM `local_ops_failure_decision`
    WHERE workflow = NEW.workflow
      AND job_correlation_id = NEW.job_correlation_id
      AND row_id = NEW.row_id
      AND decision = 'replay'
  )
BEGIN
  SELECT RAISE(ABORT, 'local ops failure decision rejects duplicate replay');
END;--> statement-breakpoint
CREATE TRIGGER `local_ops_failure_decision_retry_limit`
BEFORE INSERT ON `local_ops_failure_decision`
WHEN NEW.decision = 'retry'
  AND (
    SELECT count(*)
    FROM `local_ops_failure_decision`
    WHERE workflow = NEW.workflow
      AND job_correlation_id = NEW.job_correlation_id
      AND row_id = NEW.row_id
      AND decision = 'retry'
  ) >= 3
BEGIN
  SELECT RAISE(ABORT, 'local ops failure decision retry limit exceeded');
END;--> statement-breakpoint
CREATE TRIGGER `local_ops_failure_decision_terminal_guard`
BEFORE INSERT ON `local_ops_failure_decision`
WHEN EXISTS (
  SELECT 1
  FROM `local_ops_failure_decision`
  WHERE workflow = NEW.workflow
    AND job_correlation_id = NEW.job_correlation_id
    AND row_id = NEW.row_id
    AND failure_status IN ('ignored', 'closed')
)
BEGIN
  SELECT RAISE(ABORT, 'local ops failure decision rejects terminal failure state');
END;
