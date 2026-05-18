import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  createSyntheticHireFixture,
  saveSyntheticHire,
  type SyntheticHireDatabase,
} from "./synthetic-hire.js";

const readRepoFile = (path: string): Promise<string> =>
  readFile(join(process.cwd(), path), "utf8");

const normalizeRows = <TRow extends Record<string, unknown>>(
  rows: TRow[],
): Record<string, unknown>[] => rows.map((row) => ({ ...row }));

const normalizeRow = <TRow extends Record<string, unknown>>(
  row: TRow | undefined,
): Record<string, unknown> | undefined => (row ? { ...row } : row);

const openSchemaBackedDatabase = async (t: test.TestContext) => {
  let sqlite: typeof import("node:sqlite");
  try {
    sqlite = await import("node:sqlite");
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_BUILTIN_MODULE"
    ) {
      t.skip("node:sqlite is unavailable in this Node runtime");
      return undefined;
    }

    throw error;
  }

  const db = new sqlite.DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(await readRepoFile("drizzle/0000_rich_redwing.sql"));
  return db;
};

test("synthetic hire use case persists person, employment, and assignment together", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const result = saveSyntheticHire(db, createSyntheticHireFixture());

    assert.deepEqual(result, {
      personId: "person-syn-hire-001",
      employmentId: "employment-syn-hire-001",
      assignmentId: "assignment-syn-hire-001",
      contactPointId: "contact-point-syn-hire-001",
    });

    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, display_name, created_at
              FROM person
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "person-syn-hire-001",
          display_name: "Synthetic Hire One",
          created_at: "2026-05-18T00:00:00Z",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, employment_code, status_code, start_date
              FROM employment
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "employment-syn-hire-001",
          person_id: "person-syn-hire-001",
          employment_code: "EMP-SYN-HIRE-001",
          status_code: "active",
          start_date: "2026-05-18",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, employment_id, assignment_code, organization_code, position_code, start_date
              FROM assignment
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "assignment-syn-hire-001",
          person_id: "person-syn-hire-001",
          employment_id: "employment-syn-hire-001",
          assignment_code: "ASN-SYN-HIRE-001",
          organization_code: "ORG-SYN-001",
          position_code: "POS-SYN-001",
          start_date: "2026-05-18",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, contact_type, value, is_primary, created_at
              FROM contact_point
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "contact-point-syn-hire-001",
          person_id: "person-syn-hire-001",
          contact_type: "work_email",
          value: "synthetic.hire.001@example.invalid",
          is_primary: 1,
          created_at: "2026-05-18T00:00:00Z",
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("synthetic hire input validation fails closed before partial writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const incompleteHire = createSyntheticHireFixture({
      assignment: {
        organizationCode: "",
      },
    });

    assert.throws(
      () => saveSyntheticHire(db, incompleteHire),
      /assignment.organizationCode must be a non-empty string/,
    );

    for (const tableName of ["person", "employment", "assignment"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must remain empty after rejected hire input`,
      );
    }
  } finally {
    db.close();
  }
});

test("synthetic hire validation rejects malformed timestamps and impossible dates", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const rejectedInputs = [
      {
        input: createSyntheticHireFixture({
          person: {
            createdAt: "2026-05-18Tnot-a-time",
          },
        }),
        error: /person.createdAt must be an ISO timestamp/,
      },
      {
        input: createSyntheticHireFixture({
          person: {
            createdAt: "2026-02-30T00:00:00Z",
          },
        }),
        error: /person.createdAt must be an ISO timestamp/,
      },
      {
        input: createSyntheticHireFixture({
          employment: {
            startDate: "2026-02-30",
          },
        }),
        error: /employment.startDate must be an ISO date/,
      },
      {
        input: createSyntheticHireFixture({
          contactPoint: {
            value: "@example.invalid",
          },
        }),
        error: /contactPoint.value must be a skeleton work email/,
      },
      {
        input: createSyntheticHireFixture({
          contactPoint: {
            isPrimary: "false" as unknown as boolean,
          },
        }),
        error: /contactPoint.isPrimary must be a boolean/,
      },
    ];

    for (const { input, error } of rejectedInputs) {
      assert.throws(() => saveSyntheticHire(db, input), error);
    }

    for (const tableName of [
      "person",
      "employment",
      "assignment",
      "contact_point",
    ]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must remain empty after rejected timestamp or date input`,
      );
    }
  } finally {
    db.close();
  }
});

test("synthetic hire can use a minimal database adapter without transaction introspection", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const minimalDb = {
      exec: db.exec.bind(db),
      prepare: db.prepare.bind(db),
    };

    const result = saveSyntheticHire(minimalDb, createSyntheticHireFixture());

    assert.deepEqual(result, {
      personId: "person-syn-hire-001",
      employmentId: "employment-syn-hire-001",
      assignmentId: "assignment-syn-hire-001",
      contactPointId: "contact-point-syn-hire-001",
    });
    assert.deepEqual(
      normalizeRow(db.prepare("SELECT count(*) AS count FROM person").get()),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("synthetic hire can run inside a caller-owned transaction", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec("BEGIN IMMEDIATE");

    const result = saveSyntheticHire(db, createSyntheticHireFixture());

    assert.deepEqual(result, {
      personId: "person-syn-hire-001",
      employmentId: "employment-syn-hire-001",
      assignmentId: "assignment-syn-hire-001",
      contactPointId: "contact-point-syn-hire-001",
    });
    assert.deepEqual(
      normalizeRow(db.prepare("SELECT count(*) AS count FROM person").get()),
      { count: 1 },
    );

    db.exec("ROLLBACK");

    for (const tableName of ["person", "employment", "assignment"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must remain under the caller-owned transaction boundary`,
      );
    }
  } finally {
    if (db.isTransaction) {
      db.exec("ROLLBACK");
    }
    db.close();
  }
});

test("synthetic hire database failures roll back earlier hire writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-existing-contact', 'Synthetic Existing Contact', '2026-05-18T00:00:00Z');

      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-syn-hire-001',
        'person-existing-contact',
        'work_email',
        'synthetic.existing@example.invalid',
        1,
        '2026-05-18T00:00:00Z'
      );
    `);

    const minimalDb: SyntheticHireDatabase = {
      exec: db.exec.bind(db),
      prepare: db.prepare.bind(db),
    };

    assert.throws(
      () => saveSyntheticHire(minimalDb, createSyntheticHireFixture()),
      /UNIQUE constraint failed/,
    );
    assert.equal(db.isTransaction, false);

    for (const tableName of ["employment", "assignment"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must remain empty after rolled back hire input`,
      );
    }
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id
              FROM person
              ORDER BY id
            `,
          )
          .all(),
      ),
      [{ id: "person-existing-contact" }],
    );
  } finally {
    db.close();
  }
});

test("synthetic hire preserves the original error when savepoint start fails", () => {
  const calls: string[] = [];
  const db: SyntheticHireDatabase = {
    exec(sql: string) {
      calls.push(sql);
      if (sql === "SAVEPOINT synthetic_hire_persistence") {
        throw new Error("savepoint start failed");
      }
      if (sql.startsWith("ROLLBACK TO")) {
        throw new Error("no such savepoint");
      }
    },
    prepare() {
      throw new Error("prepare must not run when savepoint start fails");
    },
  };

  assert.throws(
    () => saveSyntheticHire(db, createSyntheticHireFixture()),
    /savepoint start failed/,
  );
  assert.deepEqual(calls, ["SAVEPOINT synthetic_hire_persistence"]);
});

test("synthetic hire database failures inside a caller-owned transaction roll back to the savepoint", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec("BEGIN IMMEDIATE");
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-existing-contact', 'Synthetic Existing Contact', '2026-05-18T00:00:00Z');

      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-syn-hire-001',
        'person-existing-contact',
        'work_email',
        'synthetic.existing@example.invalid',
        1,
        '2026-05-18T00:00:00Z'
      );
    `);

    assert.throws(
      () => saveSyntheticHire(db, createSyntheticHireFixture()),
      /UNIQUE constraint failed/,
    );

    assert.equal(db.isTransaction, true);
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id
              FROM person
              ORDER BY id
            `,
          )
          .all(),
      ),
      [{ id: "person-existing-contact" }],
    );
    for (const tableName of ["employment", "assignment"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must remain empty after savepoint rollback`,
      );
    }

    db.exec("ROLLBACK");
  } finally {
    if (db.isTransaction) {
      db.exec("ROLLBACK");
    }
    db.close();
  }
});
