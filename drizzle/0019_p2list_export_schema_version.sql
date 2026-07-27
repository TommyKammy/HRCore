PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_p2list_audit_event` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`event_version` text NOT NULL,
	`occurred_at` text NOT NULL,
	`actor_id` text,
	`actor_role` text,
	`evaluated_permission` text NOT NULL,
	`data_scope_id` text,
	`filter_fingerprint` text,
	`sort` text,
	`page_size` integer,
	`row_count` integer,
	`resource_type` text NOT NULL,
	`correlation_id` text NOT NULL,
	`policy_decision` text NOT NULL,
	`reason_code` text,
	`export_schema_version` text,
	`poc_marker` text DEFAULT 'synthetic_poc' NOT NULL,
	CONSTRAINT "p2list_audit_event_id_non_empty" CHECK(length("__new_p2list_audit_event"."event_id") > 0),
	CONSTRAINT "p2list_audit_event_type_allowed" CHECK("__new_p2list_audit_event"."event_type" in ('employee_list.viewed', 'employee_list.search_applied', 'employee_list.page_requested', 'employee_detail.opened_from_list', 'lifecycle_request_list.viewed', 'lifecycle_request_list.search_applied', 'lifecycle_request_list.page_requested', 'lifecycle_request_detail.opened_from_list', 'bounded_export.requested', 'bounded_export.completed', 'bounded_export.denied', 'authorization.denied')),
	CONSTRAINT "p2list_audit_event_version_allowed" CHECK("__new_p2list_audit_event"."event_version" = 'p2list_audit_v1'),
	CONSTRAINT "p2list_audit_event_occurred_at_date" CHECK("__new_p2list_audit_event"."occurred_at" glob '????-??-??*'),
	CONSTRAINT "p2list_audit_event_actor_id_non_empty" CHECK("__new_p2list_audit_event"."actor_id" is null or length("__new_p2list_audit_event"."actor_id") > 0),
	CONSTRAINT "p2list_audit_event_actor_role_non_empty" CHECK("__new_p2list_audit_event"."actor_role" is null or length("__new_p2list_audit_event"."actor_role") > 0),
	CONSTRAINT "p2list_audit_event_permission_non_empty" CHECK(length("__new_p2list_audit_event"."evaluated_permission") > 0),
	CONSTRAINT "p2list_audit_event_data_scope_id_non_empty" CHECK("__new_p2list_audit_event"."data_scope_id" is null or length("__new_p2list_audit_event"."data_scope_id") > 0),
	CONSTRAINT "p2list_audit_event_filter_fingerprint_non_empty" CHECK("__new_p2list_audit_event"."filter_fingerprint" is null or length("__new_p2list_audit_event"."filter_fingerprint") > 0),
	CONSTRAINT "p2list_audit_event_sort_non_empty" CHECK("__new_p2list_audit_event"."sort" is null or length("__new_p2list_audit_event"."sort") > 0),
	CONSTRAINT "p2list_audit_event_page_size_bounded" CHECK("__new_p2list_audit_event"."page_size" is null or "__new_p2list_audit_event"."page_size" between 1 and 100),
	CONSTRAINT "p2list_audit_event_row_count_bounded" CHECK("__new_p2list_audit_event"."row_count" is null or "__new_p2list_audit_event"."row_count" between 0 and 100),
	CONSTRAINT "p2list_audit_event_resource_type_allowed" CHECK("__new_p2list_audit_event"."resource_type" in ('employee', 'lifecycleRequest')),
	CONSTRAINT "p2list_audit_event_correlation_id_non_empty" CHECK(length("__new_p2list_audit_event"."correlation_id") > 0),
	CONSTRAINT "p2list_audit_event_policy_decision_allowed" CHECK("__new_p2list_audit_event"."policy_decision" in ('allow', 'deny')),
	CONSTRAINT "p2list_audit_event_reason_code_non_empty" CHECK("__new_p2list_audit_event"."reason_code" is null or length("__new_p2list_audit_event"."reason_code") > 0),
	CONSTRAINT "p2list_audit_event_export_schema_version_allowed" CHECK("__new_p2list_audit_event"."export_schema_version" is null or "__new_p2list_audit_event"."export_schema_version" = 'p2list_export_v1'),
	CONSTRAINT "p2list_audit_event_poc_marker_allowed" CHECK("__new_p2list_audit_event"."poc_marker" = 'synthetic_poc')
);
--> statement-breakpoint
INSERT INTO `__new_p2list_audit_event`("event_id", "event_type", "event_version", "occurred_at", "actor_id", "actor_role", "evaluated_permission", "data_scope_id", "filter_fingerprint", "sort", "page_size", "row_count", "resource_type", "correlation_id", "policy_decision", "reason_code", "export_schema_version", "poc_marker") SELECT "event_id", "event_type", "event_version", "occurred_at", "actor_id", "actor_role", "evaluated_permission", "data_scope_id", "filter_fingerprint", "sort", "page_size", "row_count", "resource_type", "correlation_id", "policy_decision", "reason_code", NULL, "poc_marker" FROM `p2list_audit_event`;--> statement-breakpoint
DROP TABLE `p2list_audit_event`;--> statement-breakpoint
ALTER TABLE `__new_p2list_audit_event` RENAME TO `p2list_audit_event`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
