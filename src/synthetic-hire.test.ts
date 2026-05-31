import assert from "node:assert/strict";
import test from "node:test";

import {
  createSyntheticHireFixture,
  createSyntheticHireRequestFixture,
  applySyntheticFutureDateHireJob,
  applySyntheticHireRequest,
  saveSyntheticHire,
  saveSyntheticHireRequest,
  type SyntheticHireDatabase,
} from "./synthetic-hire.js";
import {
  normalizeRow,
  normalizeRows,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

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
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT actor_id, action, subject_table, subject_id, occurred_at, correlation_id, poc_marker
              FROM audit_event
              ORDER BY
                CASE subject_table
                  WHEN 'transaction_request' THEN 1
                  WHEN 'lifecycle_event' THEN 2
                  ELSE 3
                END,
                id
            `,
          )
          .all(),
      ),
      [
        {
          actor_id: "synthetic-poc-actor",
          action: "poc.synthetic_hire.persisted",
          subject_table: "person",
          subject_id: "person-syn-hire-001",
          occurred_at: "2026-05-18T00:00:00Z",
          correlation_id: "correlation-syn-hire-direct-001",
          poc_marker: "synthetic_poc",
        },
      ],
    );
  } finally {
    db.close();
  }
});
