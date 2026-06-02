export const terminationTransactionRequestFields = [
  "id",
  "person",
  "requestType",
  "statusCode",
  "requestedAt",
  "correlationId",
  "payloadVersion",
  "payload",
];

export const terminationPersonFields = ["id", "displayName", "createdAt"];

export const terminationPayloadFields = [
  "tenantEnvironmentId",
  "effectiveDate",
  "currentEmployment",
  "currentAssignment",
  "terminationReason",
];

export const terminationCurrentEmploymentFields = [
  "employmentId",
  "employmentCode",
];

export const terminationCurrentAssignmentFields = [
  "assignmentId",
  "assignmentCode",
];

export const terminationReasonFields = ["reasonCode", "note"];
