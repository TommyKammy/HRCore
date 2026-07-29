import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";
import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";
import { p2ListCursorContract } from "./p2list-contract.js";
import { createServerP2ListRuntimes } from "./p2list-employee-runtime.js";
import {
  createP2ListUatRuntimeEnvironment,
  p2ListUatTokens,
  prepareP2ListUatFixture,
} from "./p2list-uat-fixture-setup.js";

const baseQuery = {
  q: "UAT",
  sort: "employeeId",
  direction: "asc",
  limit: "25",
} as const;

export interface P2ListUatCursorVerificationEvidence {
  cursorTtlSeconds: number;
  tampered: { statusCode: number; code: string };
  filterMismatch: { statusCode: number; code: string };
  concurrentChange: {
    firstPageLastEmployeeId: string;
    pageCount: number;
    traversedRowCount: number;
    uniqueRowCount: number;
    omittedEmployeeIds: string[];
    duplicateEmployeeIds: string[];
    acceptedSnapshotPreserved: boolean;
  };
  expired: { statusCode: number; code: string };
}

export async function runP2ListUatCursorVerification(
  outputDirectory = path.join(
    tmpdir(),
    `hrcore-p2list-uat-cursor-${process.pid}-${Date.now()}`,
  ),
): Promise<P2ListUatCursorVerificationEvidence> {
  const fixture = await prepareP2ListUatFixture(outputDirectory);
  const database = await openLocalSyntheticWritebackDatabase(
    `file:${fixture.databasePath}`,
  );
  let nowMs = Date.parse("2026-07-29T00:00:00.000Z");
  const now = () => new Date(nowMs);
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  try {
    const runtimes = await createServerP2ListRuntimes(
      database,
      createP2ListUatRuntimeEnvironment(fixture),
      { now },
    );
    app = await buildApp({
      p2ListAuditEvidenceApi: runtimes.auditEvidence,
      p2ListEmployeeApi: runtimes.employee,
      p2ListExportApi: runtimes.export,
      p2ListLifecycleApi: runtimes.lifecycle,
    });

    const firstPage = await requestEmployeePage(
      app,
      baseQuery,
      "p2list-ui-00000000-0000-4000-8000-000000000901",
    );
    assert.equal(firstPage.statusCode, 200);
    const firstPageBody = requireEmployeePage(firstPage.body);
    const cursor = requireCursor(firstPageBody);
    const firstPageIds = employeeIds(firstPageBody);

    const tampered = await requestEmployeePage(
      app,
      { ...baseQuery, cursor: `${cursor}x` },
      "p2list-ui-00000000-0000-4000-8000-000000000902",
    );
    const tamperedCode = requireErrorCode(tampered.body);
    assert.equal(tampered.statusCode, 400);
    assert.equal(tamperedCode, "cursor_invalid");

    const filterMismatch = await requestEmployeePage(
      app,
      { ...baseQuery, q: "UAT-G100-G26", cursor },
      "p2list-ui-00000000-0000-4000-8000-000000000903",
    );
    const filterMismatchCode = requireErrorCode(filterMismatch.body);
    assert.equal(filterMismatch.statusCode, 400);
    assert.equal(filterMismatchCode, "cursor_filter_mismatch");

    database
      .prepare(
        "UPDATE employment SET employment_code = 'EMP-000' WHERE employment_code = 'EMP-025'",
      )
      .run();

    const expectedSnapshotIds = Array.from(
      { length: 101 },
      (_, index) => `EMP-${String(index + 1).padStart(3, "0")}`,
    );
    const traversedIds = [...firstPageIds];
    let nextCursor: string | null = cursor;
    let pageCount = 1;
    let correlationSequence = 904;
    while (nextCursor) {
      const page = await requestEmployeePage(
        app,
        { ...baseQuery, cursor: nextCursor },
        uatCorrelationId(correlationSequence),
      );
      correlationSequence += 1;
      assert.equal(page.statusCode, 200);
      const pageBody = requireEmployeePage(page.body);
      traversedIds.push(...employeeIds(pageBody));
      nextCursor = readNextCursor(pageBody);
      pageCount += 1;
    }
    const duplicateEmployeeIds = traversedIds.filter(
      (employeeId, index) => traversedIds.indexOf(employeeId) !== index,
    );
    const omittedEmployeeIds = expectedSnapshotIds.filter(
      (employeeId) => !traversedIds.includes(employeeId),
    );
    assert.deepEqual(traversedIds, expectedSnapshotIds);
    assert.deepEqual(duplicateEmployeeIds, []);
    assert.deepEqual(omittedEmployeeIds, []);

    const expiringPage = await requestEmployeePage(
      app,
      baseQuery,
      uatCorrelationId(correlationSequence),
    );
    correlationSequence += 1;
    assert.equal(expiringPage.statusCode, 200);
    const expiringCursor = requireCursor(
      requireEmployeePage(expiringPage.body),
    );
    nowMs += p2ListCursorContract.serverSideStateTtlSeconds * 1_000 + 1;
    const expired = await requestEmployeePage(
      app,
      { ...baseQuery, cursor: expiringCursor },
      uatCorrelationId(correlationSequence),
    );
    const expiredCode = requireErrorCode(expired.body);
    assert.equal(expired.statusCode, 400);
    assert.equal(expiredCode, "cursor_invalid");

    return {
      cursorTtlSeconds: p2ListCursorContract.serverSideStateTtlSeconds,
      tampered: {
        statusCode: tampered.statusCode,
        code: tamperedCode,
      },
      filterMismatch: {
        statusCode: filterMismatch.statusCode,
        code: filterMismatchCode,
      },
      concurrentChange: {
        firstPageLastEmployeeId: firstPageIds.at(-1) ?? "",
        pageCount,
        traversedRowCount: traversedIds.length,
        uniqueRowCount: new Set(traversedIds).size,
        omittedEmployeeIds,
        duplicateEmployeeIds,
        acceptedSnapshotPreserved: true,
      },
      expired: {
        statusCode: expired.statusCode,
        code: expiredCode,
      },
    };
  } finally {
    try {
      await app?.close();
    } finally {
      try {
        database.close();
      } finally {
        await rm(outputDirectory, { recursive: true, force: true });
      }
    }
  }
}

async function requestEmployeePage(
  app: Awaited<ReturnType<typeof buildApp>>,
  query: Record<string, string>,
  correlationId: string,
): Promise<{ statusCode: number; body: unknown }> {
  const search = new URLSearchParams(query);
  const response = await app.inject({
    method: "GET",
    url: `/employees?${search.toString()}`,
    headers: {
      authorization: `Bearer ${p2ListUatTokens.hrOperator}`,
      "x-hrcore-correlation-id": correlationId,
    },
  });
  return {
    statusCode: response.statusCode,
    body: response.json(),
  };
}

function requireEmployeePage(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function requireCursor(page: Record<string, unknown>): string {
  const cursor = readNextCursor(page);
  if (!cursor) {
    throw new TypeError("P2LIST UAT cursor evidence is missing nextCursor.");
  }
  return cursor;
}

function readNextCursor(page: Record<string, unknown>): string | null {
  const pageInfo = page.pageInfo;
  assert.ok(
    pageInfo && typeof pageInfo === "object" && !Array.isArray(pageInfo),
  );
  const cursor = (pageInfo as Record<string, unknown>).nextCursor;
  if (cursor !== null && typeof cursor !== "string") {
    throw new TypeError(
      "P2LIST UAT cursor evidence has an invalid nextCursor.",
    );
  }
  return cursor;
}

function employeeIds(page: Record<string, unknown>): string[] {
  assert.ok(Array.isArray(page.items));
  return page.items.map((item) => {
    assert.ok(item && typeof item === "object" && !Array.isArray(item));
    const employeeId = (item as Record<string, unknown>).employeeId;
    if (typeof employeeId !== "string") {
      throw new TypeError("P2LIST UAT cursor evidence has no employeeId.");
    }
    return employeeId;
  });
}

function requireErrorCode(value: unknown): string {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  const code = (value as Record<string, unknown>).code;
  if (typeof code !== "string") {
    throw new TypeError("P2LIST UAT cursor evidence is missing an error code.");
  }
  return code;
}

function uatCorrelationId(sequence: number): string {
  return `p2list-ui-00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runP2ListUatCursorVerification()
    .then((evidence) => {
      console.log(JSON.stringify(evidence, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
