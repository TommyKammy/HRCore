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

  it.each(["25.0", "0x19", "%2025%20"])(
    "rejects noncanonical page size %s",
    (limit) => {
      const parsed = parseEmployeeListQuery(`?view=employees&limit=${limit}`);

      expect(parsed.query.limit).toBe(25);
      expect(parsed.errors).toEqual([
        "表示件数は 25、50、100 のいずれかを指定してください。",
      ]);
    },
  );

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

  it("rejects unknown and duplicate collection URL parameters", () => {
    const employee = parseEmployeeListQuery(
      "?view=employees&organization=ORG-001&q=first&q=second",
    );
    const lifecycle = parseLifecycleListQuery(
      "?view=lifecycle&requestStatus=submitted",
    );

    expect(employee.errors).toContain(
      "organization は対応していない検索条件です。",
    );
    expect(employee.errors).toContain("q を複数回指定することはできません。");
    expect(lifecycle.errors).toContain(
      "requestStatus は対応していない検索条件です。",
    );
  });

  it("accepts the full 100-character search contract and rejects 101 characters", () => {
    const validQuery = "A".repeat(100);
    const invalidQuery = "B".repeat(101);

    expect(
      parseEmployeeListQuery(`?view=employees&q=${validQuery}`).errors,
    ).toEqual([]);
    expect(
      parseLifecycleListQuery(`?view=lifecycle&q=${validQuery}`).errors,
    ).toEqual([]);
    expect(
      parseEmployeeListQuery(`?view=employees&q=${invalidQuery}`).errors,
    ).toContain("q は 100 文字以内で指定してください。");
    expect(
      parseLifecycleListQuery(`?view=lifecycle&q=${invalidQuery}`).errors,
    ).toContain("q は 100 文字以内で指定してください。");
  });

  it("rejects short and prohibited bounded search terms", () => {
    expect(parseEmployeeListQuery("?view=employees&q=A").errors).toContain(
      "q は 2 文字以上で指定してください。",
    );
    for (const encodedQuery of ["A%25", "A_", "A.", "A%28B%29"]) {
      expect(
        parseLifecycleListQuery(`?view=lifecycle&q=${encodedQuery}`).errors,
      ).toContain("q に使用できない文字が含まれています。");
    }
    expect(
      parseEmployeeListQuery("?view=employees&q=Synthetic%20Employee").errors,
    ).toEqual([]);
  });

  it("accepts full-length employee identifiers and rejects 129 characters", () => {
    const validValue = "A".repeat(128);
    const invalidValue = "B".repeat(129);
    const valid = parseEmployeeListQuery(
      `?view=employees&employeeId=${validValue}&organizationCode=${validValue}`,
    );
    const invalid = parseEmployeeListQuery(
      `?view=employees&employeeId=${invalidValue}&organizationCode=${invalidValue}`,
    );

    expect(valid.errors).toEqual([]);
    expect(valid.query.employeeId).toBe(validValue);
    expect(valid.query.organizationCode).toBe(validValue);
    expect(invalid.errors).toEqual([
      "employeeId は 128 文字以内で指定してください。",
      "organizationCode は 128 文字以内で指定してください。",
    ]);
  });

  it("rejects padded or oversized opaque cursors without normalizing them", () => {
    const padded = parseEmployeeListQuery(
      "?view=employees&cursor=%20opaque-page%20",
    );
    const oversized = parseLifecycleListQuery(
      `?view=lifecycle&cursor=${"A".repeat(2049)}`,
    );

    expect(padded.query.cursor).toBeUndefined();
    expect(padded.errors).toContain(
      "ページ情報の前後に空白を含めないでください。",
    );
    expect(oversized.query.cursor).toBeUndefined();
    expect(oversized.errors).toContain(
      "ページ情報が長すぎます。フィルターをリセットしてください。",
    );
  });

  it("rejects duplicate or empty lifecycle array members", () => {
    const parsed = parseLifecycleListQuery(
      "?view=lifecycle&status=approved,approved&requestType=transfer,",
    );

    expect(parsed.query.status).toBeUndefined();
    expect(parsed.query.requestType).toBeUndefined();
    expect(parsed.errors).toEqual([
      "requestType に空、重複、または許可されていない値が指定されています。",
      "status に空、重複、または許可されていない値が指定されています。",
    ]);
  });

  it("rejects whitespace-padded and empty temporal filters without normalizing them", () => {
    const employee = parseEmployeeListQuery(
      "?view=employees&asOf=%202026-07-01",
    );
    const lifecycle = parseLifecycleListQuery(
      "?view=lifecycle&requestedFrom=2026-07-01T00%3A00%3A00Z%20&requestedTo=2026-07-02T00%3A00%3A00Z&effectiveFrom=&effectiveTo=2026-07-02",
    );

    expect(employee.query.asOf).toBeUndefined();
    expect(employee.errors).toContain(
      "asOf の前後に空白を含めないでください。",
    );
    expect(lifecycle.query.requestedFrom).toBeUndefined();
    expect(lifecycle.errors).toContain(
      "requestedFrom の前後に空白を含めないでください。",
    );
    expect(lifecycle.query.effectiveFrom).toBeUndefined();
    expect(lifecycle.errors).toContain("effectiveFrom が空です。");
  });
});
