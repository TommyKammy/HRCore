export const p2ListReadiness =
  "bounded_synthetic_only_not_production_ready" as const;
export const p2ListCursorVersion = "p2list_cursor_v1" as const;
export const p2ListExportSchemaVersion = "p2list_export_v1" as const;
export const p2ListAuditEventVersion = "p2list_audit_v1" as const;

export const p2ListDefaultLimit = 25;
export const p2ListMaximumLimit = 100;
export const p2ListMaximumQueryLength = 100;
export const p2ListQueryPattern =
  "^[^\\s\\\\^$.*+?()[\\]{}|%_](?:[^\\s\\\\^$.*+?()[\\]{}|%_]| )*[^\\s\\\\^$.*+?()[\\]{}|%_](?![\\s\\S])";
export const p2ListMaximumCursorLength = 2048;
export const p2ListMaximumDateRangeDays = 366;
export const p2ListExportMaximumRows = 100;
export const p2ListErrorMessageMaximumLength = 200;
export const p2ListUnknownQueryParameterPolicy = "reject" as const;

export const p2ListExportReasonCodes = [
  "uat_reconciliation",
  "operational_reconciliation",
  "authorized_case_support",
  "data_quality_investigation",
] as const;

export const p2ListPermissions = {
  employeeListRead: "employee:list:read",
  employeeListExport: "employee:list:export",
  lifecycleRequestListRead: "lifecycle-request:list:read",
  lifecycleRequestListExport: "lifecycle-request:list:export",
  supportCorrelationRead: "support:correlation:read",
  csvDownload: "mvp_d.synthetic_csv_download",
} as const;

export const p2ListEmployeeFilters = [
  "q",
  "employeeId",
  "employmentStatus",
  "organizationCode",
  "asOf",
] as const;

export const p2ListEmployeeSortFields = [
  "employeeId",
  "displayName",
  "hireDate",
] as const;

export const p2ListEmployeeStatuses = [
  "active",
  "inactive",
  "terminated",
] as const;

export const p2ListEmployeeDefaultOrder = [
  { field: "employeeId", direction: "asc" },
  { field: "employmentId", direction: "asc", tieBreaker: true },
] as const;

export const p2ListEmployeeAsOfResolutionContract = {
  omittedValue: "initial_request_accepted_at_utc_calendar_date",
  canonicalFilterField: "asOf",
  cursorStateField: "resolvedAsOf",
  appliedFiltersIncludesResolvedValue: true,
  continuationRule:
    "reuse_cursor_bound_value_and_reject_mismatched_explicit_asOf",
} as const;

export const p2ListEmployeeAssignmentResolutionContract = {
  employmentEffectivePredicate:
    "employment.startDate_lte_asOf_and_employment.endDate_null_or_gte_asOf",
  employmentEligibility:
    "required_before_authorization_scope_sorting_and_cursor_generation",
  effectivePredicate: "startDate_lte_asOf_and_endDate_null_or_gte_asOf",
  cardinality: "zero_or_one_per_employment",
  noEffectiveAssignment: "project_null_organization_and_position",
  multipleEffectiveAssignments:
    "fail_closed_before_authorization_scope_and_projection",
  failureCode: "data_scope_denied",
} as const;

export const p2ListSyntheticProvenanceContract = {
  authority: "server_loaded_dataset_manifest",
  acceptedEvidenceType: "repo_owned_synthetic_fixture",
  requiredEvidenceFields: [
    "evidenceType",
    "datasetReference",
    "tenantEnvironmentId",
    "sourceRowPrimaryKeys",
    "integrity",
  ],
  tenantEnvironmentId: "repo_owned_synthetic_p2list",
  coveredSources: [
    "person",
    "employment",
    "assignment",
    "transaction_request",
    "audit_event",
  ],
  resourceRequiredSources: {
    employee: ["person", "employment"],
    lifecycleRequest: ["transaction_request", "person"],
  },
  conditionallyRequiredSources: {
    employee: {
      assignment: "when_any_assignment_row_is_selected",
    },
    lifecycleRequest: {
      employment: "when_any_employment_row_is_selected",
      assignment: "when_any_assignment_row_is_selected",
      audit_event: "when_any_decision_audit_event_row_is_selected",
    },
  },
  sourceRowPrimaryKeyFields: {
    person: "person.id",
    employment: "employment.id",
    assignment: "assignment.id",
    transaction_request: "transaction_request.id",
    audit_event: "audit_event.id",
  },
  integrity: {
    algorithm: "hmac_sha256",
    canonicalization: "canonical_json",
    keySource: "server_injected_non_default_local_test_secret",
  },
  sourceRowPredicate:
    "every_selected_primary_key_is_bound_to_the_verified_manifest_dataset_and_tenant_environment",
  unusedSourceAbsenceAllowed: true,
  clientSuppliedEvidenceAllowed: false,
  payloadMarkerAloneIsSufficient: false,
  readinessLabelAloneIsSufficient: false,
  missingOrMismatchedEvidence: "fail_closed_before_query_projection_or_export",
  failureCode: "data_scope_denied",
} as const;

export const p2ListLifecycleFilters = [
  "requestType",
  "status",
  "subjectEmployeeId",
  "q",
  "organizationCode",
  "decidedBy",
  "requestedFrom",
  "requestedTo",
  "effectiveFrom",
  "effectiveTo",
  "correlationId",
] as const;

export const p2ListLifecycleSortFields = [
  "requestedAt",
  "effectiveDate",
] as const;

export const p2ListLifecycleRangePairs = [
  ["requestedFrom", "requestedTo"],
  ["effectiveFrom", "effectiveTo"],
] as const;

export const p2ListLifecycleRequestTypes = [
  "onboarding",
  "transfer",
  "termination",
] as const;

export const p2ListPersistedLifecycleTypeMap = {
  hire: "onboarding",
  change: "transfer",
  transfer: "transfer",
  terminate: "termination",
} as const;

export const p2ListLifecycleStatuses = [
  "draft",
  "submitted",
  "returned",
  "rejected",
  "cancelled",
  "approved",
  "completed",
] as const;

export const p2ListLifecycleDefaultOrder = [
  { field: "requestedAt", direction: "desc" },
  {
    field: "transactionRequestId",
    direction: "desc",
    tieBreaker: true,
  },
] as const;

export const p2ListLifecycleSortNullPlacement = {
  requestedAt: "not_nullable",
  effectiveDate: "not_nullable",
} as const;

export const p2ListLifecycleRequestedAtNormalizationContract = {
  acceptedInput: "rfc3339_date_time_with_offset",
  comparisonBasis: "utc_instant",
  canonicalValue: "YYYY-MM-DDTHH:mm:ss.sssZ",
  appliesTo: [
    "requestedAt",
    "requestedFrom",
    "requestedTo",
    "cursor.lastSortValue",
  ],
  textComparisonAllowed: false,
} as const;

export const p2ListLifecycleRangeValidationContract = {
  pairs: p2ListLifecycleRangePairs,
  normalizedComparison: {
    requestedRange: "utc_instant",
    effectiveRange: "iso_calendar_date",
  },
  ordering: "start_lte_end",
  maximumInclusiveDays: p2ListMaximumDateRangeDays,
  beforeRepositoryAccess: true,
  reversedRangeFailureCode: "invalid_filter",
} as const;

export const p2ListLifecycleSubjectEmploymentResolutionContract = {
  sourceLink: "transaction_request.person_id",
  resolution: "zero_or_exactly_one_employment_for_person",
  zeroEmployments:
    "project_null_subjectEmployeeId_and_do_not_match_subjectEmployeeId_filter",
  multipleEmployments: "fail_closed_before_filter_scope_projection_and_export",
  payloadInferenceAllowed: false,
  failureCode: "data_scope_denied",
} as const;

export const p2ListLifecycleDecisionResolutionContract = {
  sourceTable: "audit_event",
  subjectPredicate:
    "audit_event.subject_table_eq_transaction_request_and_subject_id_eq_transaction_request.id",
  actionPrefixByPersistedRequestType: {
    hire: "mvp_a.onboarding",
    change: "mvp_b.transfer",
    transfer: "mvp_b.transfer",
    terminate: "mvp_c.termination",
  },
  decisionActionByCurrentStatus: {
    draft: null,
    submitted: null,
    returned: "return",
    rejected: "reject",
    cancelled: "cancel",
    approved: "approve",
    completed: "approve",
  },
  candidateAction:
    "exact_request_type_prefix_plus_decision_action_for_current_status",
  requiredPocMarker: "synthetic_poc",
  requiredActorId: "non_empty",
  occurredAtComparison: "rfc3339_utc_instant",
  selectedEvent: "unique_candidate_with_maximum_occurredAt_utc_instant",
  sameMaximumInstant: "fail_closed",
  noDecisionStatus:
    "project_null_decidedBy_and_ignore_historical_decisions_for_draft_or_submitted",
  missingExpectedEvent:
    "fail_closed_for_returned_rejected_cancelled_approved_or_completed",
  appliesTo: ["projection", "filter", "export"],
  filterAuthorization:
    "same_as_authorized_lifecycle_collection_no_additional_permission",
  payloadInferenceAllowed: false,
  failureCode: "data_scope_denied",
} as const;

export const p2ListLifecycleEffectiveDateResolutionContract = {
  sourceTable: "transaction_request",
  sourceColumns: {
    requestType: "request_type",
    payloadVersion: "payload_version",
    payload: "payload_json",
  },
  sourceByPersistedRequestType: {
    hire: {
      payloadVersion: "mvp_a_onboarding_v1",
      payloadField: "effectiveDate",
    },
    change: {
      payloadVersion: "mvp_b_transfer_v1",
      payloadField: "effectiveDate",
    },
    transfer: {
      payloadVersion: "mvp_b_transfer_v1",
      payloadField: "effectiveDate",
    },
    terminate: {
      payloadVersion: "mvp_c_termination_v1",
      payloadField: "effectiveDate",
    },
  },
  validation:
    "strict_persisted_type_version_mapping_and_versioned_payload_parser_and_iso_calendar_date",
  statusIndependent: true,
  lifecycleEventFallbackAllowed: false,
  successfulProjection: "effectiveDate_non_null",
  appliesTo: [
    "projection",
    "filter",
    "sort",
    "cursor",
    "organization_resolution",
    "export",
  ],
  missingMalformedUnsupportedOrMismatched:
    "fail_closed_before_filter_sort_cursor_scope_projection_or_export",
  failureCode: "data_scope_denied",
} as const;

export const p2ListLifecycleOrganizationResolutionContract = {
  onboarding: {
    source:
      "validated_mvp_a_onboarding_v1_payload.assignment.departmentReference",
    relation: "target_assignment_at_effectiveDate",
  },
  transfer: {
    source:
      "validated_mvp_b_transfer_v1_payload.targetAssignment.organizationReference",
    relation: "target_assignment_at_effectiveDate",
  },
  termination: {
    source: "organization_code_of_exact_payload_currentAssignment_id_and_code",
    relation:
      "exact_current_assignment_effective_on_effectiveDate_inclusive_of_end_date",
  },
  appliesTo: ["projection", "filter", "query_layer_scope", "export"],
  nullOrAmbiguous:
    "fail_closed_before_filter_authorization_scope_projection_or_export",
  rawPayloadExposureAllowed: false,
  failureCode: "data_scope_denied",
} as const;

export const p2ListCursorContract = {
  version: p2ListCursorVersion,
  wireFormat: "opaque_authenticated_random_handle",
  integrityAlgorithm: "hmac_sha256",
  filterFingerprintAlgorithm: "sha256_canonical_json",
  resolvedServerDefaultsInFilterFingerprint: {
    employee: ["asOf"],
    lifecycleRequest: [],
  },
  wireRequiredClaims: ["version", "stateId", "expiresAt"],
  minimumHandleEntropyBits: 128,
  handleGeneration: "cryptographically_secure_random",
  serverSideStateTtlSeconds: 900,
  serverSideStateCleanup: "delete_after_expiry",
  authorizationContextFingerprint: {
    algorithm: "sha256_canonical_json",
    inputs: ["actorId", "tenantId", "permissions", "dataScope"],
  },
  serverSideStateRequiredFields: [
    "resource",
    "sort",
    "direction",
    "lastSortValue",
    "lastSortValueIsNull",
    "lastStableId",
    "filterFingerprint",
    "authorizationContextFingerprint",
  ],
  resourceStateRequiredFields: {
    employee: ["resolvedAsOf"],
    lifecycleRequest: [],
  },
  maximumWireLength: p2ListMaximumCursorLength,
  serverSideStateSensitiveFields: ["lastSortValue"],
  serverSideStateLogging: "prohibited",
  nullableSortValueEncoding:
    "lastSortValue_null_with_explicit_lastSortValueIsNull",
  nullableSortContinuation: {
    placement: "last_regardless_of_direction",
    nonNullPartitionPrecedesNullPartition: true,
    nullPartitionOrder: "lastStableId_in_requested_direction",
  },
  sortValueNullabilityByResource: {
    employee: "not_nullable",
    lifecycleRequest: "not_nullable",
  },
  invalidNullSortState:
    "reject_lastSortValueIsNull_true_as_cursor_invalid_for_current_resources",
  rejectedConditions: [
    "malformed",
    "tampered",
    "unsupported_version",
    "resource_mismatch",
    "cursor_filter_mismatch",
    "sort_mismatch",
    "direction_mismatch",
    "expired",
    "state_not_found",
    "authorization_context_mismatch",
  ],
  publicErrorCodeByRejectedCondition: {
    malformed: "cursor_invalid",
    tampered: "cursor_invalid",
    unsupported_version: "cursor_version_unsupported",
    resource_mismatch: "cursor_invalid",
    cursor_filter_mismatch: "cursor_filter_mismatch",
    sort_mismatch: "cursor_invalid",
    direction_mismatch: "cursor_invalid",
    expired: "cursor_invalid",
    state_not_found: "cursor_invalid",
    authorization_context_mismatch: "permission_denied",
  },
  wireContainsPii: false,
  wireContainsRawQuery: false,
  boundedKeyRule:
    "A non-default local/test authentication key is required; production key custody remains blocked.",
} as const;

export const p2ListEmployeeFields = [
  "personId",
  "employeeId",
  "displayName",
  "employmentStatus",
  "organizationCode",
  "positionCode",
  "hireDate",
  "terminationDate",
] as const;

export const p2ListLifecycleFields = [
  "transactionRequestId",
  "requestType",
  "status",
  "subjectPersonId",
  "subjectEmployeeId",
  "subjectDisplayName",
  "organizationCode",
  "decidedBy",
  "requestedAt",
  "effectiveDate",
  "allowedActions",
] as const;

export const p2ListDeferredEmployeeFields = [
  "employmentType",
  "departmentId",
  "departmentName",
  "jobTitle",
  "updatedAt",
] as const;

export const p2ListDeferredLifecycleFields = [
  "requestedBy",
  "currentStep",
  "updatedAt",
] as const;

export const p2ListDeniedSurfaces = [
  "rawPayload",
  "raw_payload",
  "providerPayload",
  "provider_payload",
  "freeFormNote",
  "note",
  "memo",
  "attachment",
  "contactPoint",
  "personalEmail",
  "phoneNumber",
  "address",
  "bankAccount",
  "taxIdentifier",
  "myNumber",
  "my_number",
  "healthInformation",
  "disabilityInformation",
  "specificPersonalInformation",
  "sensitivePersonalInformation",
  "realEmployeeData",
  "broadSearch",
  "broadExport",
] as const;

export const p2ListEmployeeExportFields = [
  "employee_id",
  "display_name",
  "employment_status",
  "organization_code",
  "position_code",
  "hire_date",
  "termination_date",
] as const;

export const p2ListLifecycleExportFields = [
  "transaction_request_id",
  "request_type",
  "status",
  "subject_employee_id",
  "subject_display_name",
  "organization_code",
  "requested_at",
  "effective_date",
] as const;

export const p2ListExportContract = {
  schemaVersion: p2ListExportSchemaVersion,
  maximumRows: p2ListExportMaximumRows,
  requireMeaningfulFilter: true,
  rejectRatherThanTruncate: true,
  requireReasonCode: true,
  reasonCodes: p2ListExportReasonCodes,
  delivery: "synchronous_text_csv",
  formulaInjectionProtectionRequired: true,
  conditionalPermissionByFilter: {
    correlationId: p2ListPermissions.supportCorrelationRead,
  },
  meaningfulFilterAnyOf: {
    employee: ["employeeId", "organizationCode"],
    lifecycleRequest: [
      "subjectEmployeeId",
      "organizationCode",
      "correlationId",
      "requestedRange",
      "effectiveRange",
    ],
  },
  serverOwnedColumnAllowlists: {
    employee: p2ListEmployeeExportFields,
    lifecycleRequest: p2ListLifecycleExportFields,
  },
} as const;

export const p2ListAuditEventTypes = [
  "employee_list.viewed",
  "employee_list.search_applied",
  "employee_list.page_requested",
  "employee_detail.opened_from_list",
  "lifecycle_request_list.viewed",
  "lifecycle_request_list.search_applied",
  "lifecycle_request_list.page_requested",
  "lifecycle_request_detail.opened_from_list",
  "bounded_export.requested",
  "bounded_export.completed",
  "bounded_export.denied",
  "authorization.denied",
] as const;

export const p2ListAuditFields = [
  "eventId",
  "eventType",
  "eventVersion",
  "occurredAt",
  "actorId",
  "actorRole",
  "evaluatedPermission",
  "dataScopeId",
  "filterFingerprint",
  "sort",
  "pageSize",
  "rowCount",
  "resourceType",
  "correlationId",
  "policyDecision",
  "reasonCode",
  "exportSchemaVersion",
] as const;

export const p2ListAuditDeniedFields = [
  "displayName",
  "subjectDisplayName",
  "rawSearchTerm",
  "rawQuery",
  "rawCursor",
  "cursorState",
  "lastSortValue",
  "provenanceManifest",
  "sourceRowPrimaryKeys",
  "manifestIntegrity",
  "csv",
  "csvBody",
  "rawPayload",
  "providerPayload",
  "freeFormReason",
] as const;

export const p2ListAuditContract = {
  eventVersion: p2ListAuditEventVersion,
  serverAuthoritative: true,
  clientTelemetryIsSufficient: false,
  detailOpenSource: "authorized_detail_api_response",
  filterEvidence: "canonical_allowlisted_summary_and_fingerprint",
  rawReasonPersistenceAllowed: false,
} as const;

export const p2ListErrorCodes = [
  "invalid_filter",
  "unsupported_filter",
  "invalid_sort",
  "unsupported_sort",
  "limit_out_of_range",
  "date_range_too_wide",
  "cursor_invalid",
  "cursor_version_unsupported",
  "cursor_filter_mismatch",
  "actor_context_required",
  "permission_denied",
  "data_scope_denied",
  "export_filter_required",
  "export_row_limit_exceeded",
  "export_reason_code_required",
  "export_reason_code_unsupported",
  "export_field_denied",
] as const;

export const p2ListFieldVisibility = {
  hrOperator: {
    employee: p2ListEmployeeFields,
    lifecycleRequest: p2ListLifecycleFields,
  },
  approver: {
    employee: [] as const,
    lifecycleRequest: [] as const,
  },
  hrOpsSupport: {
    employee: p2ListEmployeeFields,
    lifecycleRequest: p2ListLifecycleFields,
  },
  boundedAdmin: {
    employee: [] as const,
    lifecycleRequest: [] as const,
  },
  maskedFieldsAreReported: true,
} as const;

export const p2ListRoleActionMatrix = {
  hrOperator: {
    employeeList: {
      uiVisible: true,
      requiredPermission: p2ListPermissions.employeeListRead,
      scope: "assigned_organization",
    },
    lifecycleRequestList: {
      uiVisible: true,
      requiredPermission: p2ListPermissions.lifecycleRequestListRead,
      scope: "assigned_organization",
    },
    employeeExport: {
      uiVisible: true,
      requiredPermissions: [
        p2ListPermissions.employeeListRead,
        p2ListPermissions.employeeListExport,
        p2ListPermissions.csvDownload,
      ],
      scope: "assigned_organization",
    },
    lifecycleRequestExport: {
      uiVisible: true,
      requiredPermissions: [
        p2ListPermissions.lifecycleRequestListRead,
        p2ListPermissions.lifecycleRequestListExport,
        p2ListPermissions.csvDownload,
      ],
      scope: "assigned_organization",
    },
  },
  approver: {
    employeeList: {
      uiVisible: false,
      requiredPermission: null,
      scope: "none",
    },
    lifecycleRequestList: {
      uiVisible: false,
      requiredPermission: null,
      scope: "none",
      deferredReason: "no_authoritative_current_approver_assignment_source",
    },
    employeeExport: {
      uiVisible: false,
      requiredPermissions: [] as const,
      scope: "none",
    },
    lifecycleRequestExport: {
      uiVisible: false,
      requiredPermissions: [] as const,
      scope: "none",
    },
  },
  hrOpsSupport: {
    employeeList: {
      uiVisible: true,
      requiredPermission: p2ListPermissions.employeeListRead,
      scope: "assigned_support_scope",
    },
    lifecycleRequestList: {
      uiVisible: true,
      requiredPermission: p2ListPermissions.lifecycleRequestListRead,
      scope: "assigned_support_scope",
    },
    employeeExport: {
      uiVisible: true,
      requiredPermissions: [
        p2ListPermissions.employeeListRead,
        p2ListPermissions.employeeListExport,
        p2ListPermissions.csvDownload,
      ],
      scope: "assigned_support_scope",
    },
    lifecycleRequestExport: {
      uiVisible: true,
      requiredPermissions: [
        p2ListPermissions.lifecycleRequestListRead,
        p2ListPermissions.lifecycleRequestListExport,
        p2ListPermissions.csvDownload,
      ],
      scope: "assigned_support_scope",
    },
  },
  boundedAdmin: {
    employeeList: {
      uiVisible: false,
      requiredPermission: null,
      scope: "none",
    },
    lifecycleRequestList: {
      uiVisible: false,
      requiredPermission: null,
      scope: "none",
    },
    employeeExport: {
      uiVisible: false,
      requiredPermissions: [] as const,
      scope: "none",
    },
    lifecycleRequestExport: {
      uiVisible: false,
      requiredPermissions: [] as const,
      scope: "none",
    },
  },
} as const;

export const p2ListAuthorizationContract = {
  serverAuthoritative: true,
  clientPersonaIsAuthoritative: false,
  failClosedWhenActorContextMissing: true,
  failClosedWhenScopeUnknown: true,
  requirePermissionAndDataScope: true,
  rowFilteringAtQueryLayer: true,
  postFetchFilteringIsSufficient: false,
  rlsIsAuthorizationSourceOfTruth: false,
  allowedScopeDimensions: [
    "organization_code",
    "subject_person_id",
    "subject_employee_id",
    "requester_actor_id",
    "approver_actor_id",
    "support_correlation_id",
    "effective_date",
  ],
  allowedScopeOperators: ["equals", "in", "prefix", "date_range"],
} as const;

export type P2ListPermission =
  (typeof p2ListPermissions)[keyof typeof p2ListPermissions];
export type P2ListEmployeeFilter = (typeof p2ListEmployeeFilters)[number];
export type P2ListLifecycleFilter = (typeof p2ListLifecycleFilters)[number];
export type P2ListErrorCode = (typeof p2ListErrorCodes)[number];
