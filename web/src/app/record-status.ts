import type { EmployeeListItem, LifecycleRequestListItem } from "../api-client";

export function employeeStatusClass(
  status: EmployeeListItem["employmentStatus"],
): string {
  return {
    active: "status-success",
    inactive: "status-queued",
    terminated: "status-failed",
  }[status];
}

export function lifecycleStatusClass(
  status: LifecycleRequestListItem["status"],
): string {
  if (status === "approved" || status === "completed") {
    return "status-success";
  }
  if (status === "rejected" || status === "cancelled") {
    return "status-failed";
  }
  if (status === "submitted") {
    return "status-running";
  }
  return "status-queued";
}
