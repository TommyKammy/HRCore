import { describe, expect, it } from "vitest";

import { employeeStatusClass, lifecycleStatusClass } from "./record-status";

describe("bounded record status presentation", () => {
  it("maps employee states without treating inactive or terminated as success", () => {
    expect(employeeStatusClass("active")).toBe("status-success");
    expect(employeeStatusClass("inactive")).toBe("status-queued");
    expect(employeeStatusClass("terminated")).toBe("status-failed");
  });

  it("maps lifecycle states to their operational tone", () => {
    expect(lifecycleStatusClass("draft")).toBe("status-queued");
    expect(lifecycleStatusClass("submitted")).toBe("status-running");
    expect(lifecycleStatusClass("returned")).toBe("status-queued");
    expect(lifecycleStatusClass("rejected")).toBe("status-failed");
    expect(lifecycleStatusClass("cancelled")).toBe("status-failed");
    expect(lifecycleStatusClass("approved")).toBe("status-success");
    expect(lifecycleStatusClass("completed")).toBe("status-success");
  });
});
