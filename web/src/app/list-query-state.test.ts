import { describe, expect, it } from "vitest";

import type { EmployeeListQuery } from "../api-client";
import {
  parseEmployeeListQuery,
  parseLifecycleListQuery,
  writeListQuery,
} from "./list-query-state";

describe("bounded list URL query state", () => {
  it("parses allowlisted employee filters and rejects invalid paging values", () => {
    const valid = parseEmployeeListQuery(
      "?view=employees&q=Synthetic&employmentStatus=active&sort=hireDate&direction=desc&limit=50&cursor=opaque-page",
    );
    expect(valid).toEqual({
      query: {
        q: "Synthetic",
        employmentStatus: "active",
        sort: "hireDate",
        direction: "desc",
        limit: 50,
        cursor: "opaque-page",
      },
      errors: [],
    });

    const invalid = parseEmployeeListQuery(
      "?view=employees&employmentStatus=unknown&limit=500&cursor=",
    );
    expect(invalid.errors).toEqual([
      "employmentStatus に許可されていない値が指定されています。",
      "表示件数は 25、50、100 のいずれかを指定してください。",
      "ページ情報が空です。フィルターをリセットしてください。",
    ]);
  });

  it("parses lifecycle filters and rejects reversed date ranges", () => {
    const parsed = parseLifecycleListQuery(
      "?view=lifecycle&requestType=onboarding,termination&status=submitted,approved&subjectEmployeeId=EMP-001&organizationCode=ORG-001&decidedBy=approver-001&requestedFrom=2026-08-20T00%3A00%3A00.000Z&requestedTo=2026-08-01T00%3A00%3A00.000Z&effectiveFrom=2026-08-20&effectiveTo=2026-08-01&correlationId=correlation-001",
    );
    expect(parsed.query.requestType).toEqual(["onboarding", "termination"]);
    expect(parsed.query.status).toEqual(["submitted", "approved"]);
    expect(parsed.query).toMatchObject({
      subjectEmployeeId: "EMP-001",
      organizationCode: "ORG-001",
      decidedBy: "approver-001",
      requestedFrom: "2026-08-20T00:00:00.000Z",
      requestedTo: "2026-08-01T00:00:00.000Z",
      correlationId: "correlation-001",
    });
    expect(parsed.errors).toContain(
      "申請日時の開始日時は終了日時以前にしてください。",
    );
    expect(parsed.errors).toContain(
      "適用日の開始日は終了日以前にしてください。",
    );
  });

  it("rejects incomplete and malformed lifecycle ranges", () => {
    const parsed = parseLifecycleListQuery(
      "?view=lifecycle&requestedFrom=0&effectiveFrom=2026-02-30",
    );

    expect(parsed.errors).toEqual([
      "requestedFrom は RFC3339 日時形式で指定してください。",
      "effectiveFrom は実在する日付で指定してください。",
    ]);

    const incomplete = parseLifecycleListQuery(
      "?view=lifecycle&requestedFrom=2026-08-01T00%3A00%3A00Z&effectiveFrom=2026-08-01",
    );
    expect(incomplete.errors).toContain(
      "申請日時の開始日時と終了日時を両方指定してください。",
    );
    expect(incomplete.errors).toContain(
      "適用日の開始日と終了日を両方指定してください。",
    );
  });

  it("writes only approved URL fields and never serializes unexpected values", () => {
    writeListQuery("employees", {
      q: "Synthetic",
      sort: "displayName",
      direction: "asc",
      limit: 25,
      rawPayload: "must-not-leak",
    } as EmployeeListQuery);

    expect(window.location.search).toBe(
      "?view=employees&q=Synthetic&sort=displayName&direction=asc&limit=25",
    );
    expect(window.location.search).not.toContain("rawPayload");
    expect(window.location.search).not.toContain("must-not-leak");
  });

  it("rejects boundary whitespace instead of silently normalizing it", () => {
    const employee = parseEmployeeListQuery("?view=employees&q=%20Synthetic");
    const lifecycle = parseLifecycleListQuery("?view=lifecycle&q=Synthetic%20");

    expect(employee.errors).toContain("q の前後に空白を含めないでください。");
    expect(lifecycle.errors).toContain("q の前後に空白を含めないでください。");
    expect(employee.query.q).toBeUndefined();
    expect(lifecycle.query.q).toBeUndefined();
  });
});
