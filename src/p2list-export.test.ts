import assert from "node:assert/strict";
import test from "node:test";

import { parse } from "csv-parse/sync";

import {
  buildEmployeeExportArtifact,
  buildLifecycleExportArtifact,
} from "./p2list-export.js";

test("P2LIST employee CSV is deterministic, null-safe, quoted, and formula-protected", () => {
  const artifact = buildEmployeeExportArtifact([
    {
      personId: "person-001",
      employeeId: "EMP-001",
      displayName: '=HYPERLINK("https://example.invalid","Synthetic")',
      employmentStatus: "active",
      organizationCode: "ORG,001",
      positionCode: null,
      hireDate: "2026-01-01",
      terminationDate: null,
    },
  ]);

  assert.equal(artifact.schemaVersion, "p2list_export_v1");
  assert.equal(artifact.rowCount, 1);
  assert.equal(
    artifact.csv,
    [
      "employee_id,display_name,employment_status,organization_code,position_code,hire_date,termination_date",
      'EMP-001,"\'=HYPERLINK(""https://example.invalid"",""Synthetic"")",active,"ORG,001",,2026-01-01,',
      "",
    ].join("\n"),
  );
  assert.deepEqual(
    parse(artifact.csv, {
      columns: true,
      skip_empty_lines: true,
    }),
    [
      {
        employee_id: "EMP-001",
        display_name: '\'=HYPERLINK("https://example.invalid","Synthetic")',
        employment_status: "active",
        organization_code: "ORG,001",
        position_code: "",
        hire_date: "2026-01-01",
        termination_date: "",
      },
    ],
  );
});

test("P2LIST lifecycle CSV preserves canonical UTC timestamps and neutralizes every dangerous prefix", () => {
  const artifact = buildLifecycleExportArtifact([
    {
      transactionRequestId: "request-001",
      requestType: "transfer",
      status: "submitted",
      subjectPersonId: "person-001",
      subjectEmployeeId: "+EMP-001",
      subjectDisplayName: "@Synthetic",
      organizationCode: "-ORG-001",
      decidedBy: null,
      requestedAt: "2026-07-01T00:00:00.000Z",
      effectiveDate: "2026-08-01",
    },
  ]);

  assert.equal(
    artifact.csv,
    [
      "transaction_request_id,request_type,status,subject_employee_id,subject_display_name,organization_code,requested_at,effective_date",
      "request-001,transfer,submitted,'+EMP-001,'@Synthetic,'-ORG-001,2026-07-01T00:00:00.000Z,2026-08-01",
      "",
    ].join("\n"),
  );
  assert.equal(
    buildLifecycleExportArtifact([
      {
        transactionRequestId: "request-002",
        requestType: "onboarding",
        status: "submitted",
        subjectPersonId: "person-002",
        subjectEmployeeId: "'=already-neutralized",
        subjectDisplayName: "Synthetic",
        organizationCode: "ORG-002",
        decidedBy: null,
        requestedAt: "2026-07-01T00:00:00.000Z",
        effectiveDate: "2026-08-01",
      },
    ]).csv,
    [
      "transaction_request_id,request_type,status,subject_employee_id,subject_display_name,organization_code,requested_at,effective_date",
      "request-002,onboarding,submitted,'=already-neutralized,Synthetic,ORG-002,2026-07-01T00:00:00.000Z,2026-08-01",
      "",
    ].join("\n"),
  );
});
