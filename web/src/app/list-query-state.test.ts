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
      "?view=lifecycle&requestType=onboarding,termination&status=submitted,approved&effectiveFrom=2026-08-20&effectiveTo=2026-08-01",
    );
    expect(parsed.query.requestType).toEqual(["onboarding", "termination"]);
    expect(parsed.query.status).toEqual(["submitted", "approved"]);
    expect(parsed.errors).toContain(
      "適用日の開始日は終了日以前にしてください。",
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
});
