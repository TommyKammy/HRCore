CREATE TABLE `assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`employment_id` text NOT NULL,
	`assignment_code` text NOT NULL,
	`organization_code` text NOT NULL,
	`position_code` text,
	`start_date` text NOT NULL,
	`end_date` text,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assignment_employment_person_match_fk" FOREIGN KEY (`employment_id`,`person_id`) REFERENCES `employment`(`id`,`person_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assignment_id_non_empty" CHECK(length("assignment"."id") > 0),
	CONSTRAINT "assignment_code_non_empty" CHECK(length("assignment"."assignment_code") > 0),
	CONSTRAINT "assignment_organization_code_non_empty" CHECK(length("assignment"."organization_code") > 0),
	CONSTRAINT "assignment_start_date_shape" CHECK("assignment"."start_date" glob '????-??-??'),
	CONSTRAINT "assignment_end_date_shape" CHECK("assignment"."end_date" is null or "assignment"."end_date" glob '????-??-??')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_assignment_code_unique` ON `assignment` (`assignment_code`);--> statement-breakpoint
CREATE TABLE `audit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`subject_table` text NOT NULL,
	`subject_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`correlation_id` text,
	CONSTRAINT "audit_event_id_non_empty" CHECK(length("audit_event"."id") > 0),
	CONSTRAINT "audit_event_actor_id_non_empty" CHECK(length("audit_event"."actor_id") > 0),
	CONSTRAINT "audit_event_action_non_empty" CHECK(length("audit_event"."action") > 0),
	CONSTRAINT "audit_event_subject_table_allowed" CHECK("audit_event"."subject_table" in ('person', 'employment', 'assignment', 'contact_point', 'transaction_request', 'lifecycle_event')),
	CONSTRAINT "audit_event_subject_id_non_empty" CHECK(length("audit_event"."subject_id") > 0),
	CONSTRAINT "audit_event_occurred_at_date" CHECK("audit_event"."occurred_at" glob '????-??-??*')
);
--> statement-breakpoint
CREATE TABLE `contact_point` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`contact_type` text NOT NULL,
	`value` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "contact_point_id_non_empty" CHECK(length("contact_point"."id") > 0),
	CONSTRAINT "contact_point_type_allowed" CHECK("contact_point"."contact_type" in ('work_email')),
	CONSTRAINT "contact_point_value_non_empty" CHECK(length("contact_point"."value") > 0),
	CONSTRAINT "contact_point_work_email_shape" CHECK("contact_point"."contact_type" != 'work_email' or instr("contact_point"."value", '@') > 1),
	CONSTRAINT "contact_point_created_at_date" CHECK("contact_point"."created_at" glob '????-??-??*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_point_person_type_unique` ON `contact_point` (`person_id`,`contact_type`);--> statement-breakpoint
CREATE TABLE `employment` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`employment_code` text NOT NULL,
	`status_code` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "employment_id_non_empty" CHECK(length("employment"."id") > 0),
	CONSTRAINT "employment_code_non_empty" CHECK(length("employment"."employment_code") > 0),
	CONSTRAINT "employment_status_code_allowed" CHECK("employment"."status_code" in ('active', 'inactive', 'terminated')),
	CONSTRAINT "employment_start_date_shape" CHECK("employment"."start_date" glob '????-??-??'),
	CONSTRAINT "employment_end_date_shape" CHECK("employment"."end_date" is null or "employment"."end_date" glob '????-??-??')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employment_employment_code_unique` ON `employment` (`employment_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `employment_id_person_unique` ON `employment` (`id`,`person_id`);--> statement-breakpoint
CREATE TABLE `lifecycle_event` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`transaction_request_id` text,
	`event_type` text NOT NULL,
	`effective_date` text NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "lifecycle_event_request_person_match_fk" FOREIGN KEY (`transaction_request_id`,`person_id`) REFERENCES `transaction_request`(`id`,`person_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "lifecycle_event_id_non_empty" CHECK(length("lifecycle_event"."id") > 0),
	CONSTRAINT "lifecycle_event_type_allowed" CHECK("lifecycle_event"."event_type" in ('hire', 'assignment_change', 'termination')),
	CONSTRAINT "lifecycle_event_effective_date_shape" CHECK("lifecycle_event"."effective_date" glob '????-??-??'),
	CONSTRAINT "lifecycle_event_occurred_at_date" CHECK("lifecycle_event"."occurred_at" glob '????-??-??*')
);
--> statement-breakpoint
CREATE TABLE `person` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "person_id_non_empty" CHECK(length("person"."id") > 0),
	CONSTRAINT "person_display_name_non_empty" CHECK(length("person"."display_name") > 0),
	CONSTRAINT "person_created_at_date" CHECK("person"."created_at" glob '????-??-??*')
);
--> statement-breakpoint
CREATE TABLE `transaction_request` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`request_type` text NOT NULL,
	`status_code` text NOT NULL,
	`requested_at` text NOT NULL,
	`correlation_id` text,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transaction_request_id_non_empty" CHECK(length("transaction_request"."id") > 0),
	CONSTRAINT "transaction_request_type_allowed" CHECK("transaction_request"."request_type" in ('hire', 'change', 'terminate')),
	CONSTRAINT "transaction_request_status_allowed" CHECK("transaction_request"."status_code" in ('draft', 'submitted', 'completed', 'cancelled')),
	CONSTRAINT "transaction_request_requested_at_date" CHECK("transaction_request"."requested_at" glob '????-??-??*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transaction_request_id_person_unique` ON `transaction_request` (`id`,`person_id`);
