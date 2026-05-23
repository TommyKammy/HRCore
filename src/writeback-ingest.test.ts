import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { buildApp } from "./app.js";
import {
  buildOktaMasteringAdapter,
  createSyntheticOktaUserFixture,
} from "./okta-mastering-adapter.js";
import {
  createSyntheticWorkEmailWritebackFixture,
  refreshSyntheticWorkEmailFromProvider,
  ingestSyntheticWorkEmailWriteback,
  resolveSyntheticWorkEmailConflict,
} from "./writeback-ingest.js";

const readRepoFile = (path: string): Promise<string> =>
  readFile(join(process.cwd(), path), "utf8");

const readCommittedMigrationSql = async (): Promise<string> => {
  const migrationFiles = (await readdir(join(process.cwd(), "drizzle")))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const migrationSqlFiles = await Promise.all(
    migrationFiles.map((file) => readRepoFile(join("drizzle", file))),
  );

  return migrationSqlFiles.join("\n");
};

const normalizeRow = <TRow extends Record<string, unknown>>(
  row: TRow | undefined,
): Record<string, unknown> | undefined => (row ? { ...row } : row);

const normalizeRows = <TRow extends Record<string, unknown>>(
  rows: TRow[],
): Record<string, unknown>[] => rows.map((row) => ({ ...row }));

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
  db.exec(await readCommittedMigrationSql());
  return db;
};

test("synthetic work email writeback ingest persists event evidence and upserts contact point", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');

      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-writeback-001',
        'person-writeback-001',
        'work_email',
        'confirmed.writeback@example.invalid',
        1,
        '2026-05-18T00:00:00Z'
      );
    `);

    const result = ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    assert.deepEqual(result, {
      eventId: "writeback-event-work-email-001",
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      correlationId: "correlation-writeback-work-email-001",
      applied: true,
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT id, person_id, contact_type, value, is_primary, created_at
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
            `,
          )
          .get(),
      ),
      {
        id: "contact-point-writeback-001",
        person_id: "person-writeback-001",
        contact_type: "work_email",
        value: "confirmed.writeback@example.invalid",
        is_primary: 1,
        created_at: "2026-05-18T00:00:00Z",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                id,
                person_id,
                provider_name,
                provider_subject_id,
                provider_value,
                target_contact_type,
                correlation_id,
                received_at,
                poc_marker
              FROM writeback_event
              WHERE id = 'writeback-event-work-email-001'
            `,
          )
          .get(),
      ),
      {
        id: "writeback-event-work-email-001",
        person_id: "person-writeback-001",
        provider_name: "synthetic_okta",
        provider_subject_id: "synthetic-okta-user-001",
        provider_value: "confirmed.writeback@example.invalid",
        target_contact_type: "work_email",
        correlation_id: "correlation-writeback-work-email-001",
        received_at: "2026-05-18T01:00:00Z",
        poc_marker: "synthetic_poc",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email writeback promotes a matching existing value to primary", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');

      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-writeback-001',
        'person-writeback-001',
        'work_email',
        'confirmed.writeback@example.invalid',
        0,
        '2026-05-18T00:00:00Z'
      );
    `);

    assert.deepEqual(
      ingestSyntheticWorkEmailWriteback(
        db,
        createSyntheticWorkEmailWritebackFixture(),
      ),
      {
        eventId: "writeback-event-work-email-001",
        personId: "person-writeback-001",
        contactPointId: "contact-point-writeback-001",
        providerName: "synthetic_okta",
        providerSubjectId: "synthetic-okta-user-001",
        correlationId: "correlation-writeback-work-email-001",
        applied: true,
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value, is_primary
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "confirmed.writeback@example.invalid",
        is_primary: 1,
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict
              WHERE writeback_event_id = 'writeback-event-work-email-001'
            `,
          )
          .get(),
      ),
      {
        count: 0,
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email writeback records existing HRCore value conflicts without overwrite", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-conflict-001', 'Synthetic Writeback Conflict Person', '2026-05-18T00:00:00Z');

      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-writeback-conflict-001',
        'person-writeback-conflict-001',
        'work_email',
        'hrcore.authoritative@example.invalid',
        1,
        '2026-05-18T00:00:00Z'
      );
    `);

    const result = ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture({
        eventId: "writeback-event-work-email-conflict-001",
        personId: "person-writeback-conflict-001",
        contactPointId: "contact-point-writeback-conflict-001",
        providerValue: "provider.inbound@example.invalid",
        correlationId: "correlation-writeback-work-email-conflict-001",
      }),
    );

    assert.deepEqual(result, {
      eventId: "writeback-event-work-email-conflict-001",
      personId: "person-writeback-conflict-001",
      contactPointId: "contact-point-writeback-conflict-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      correlationId: "correlation-writeback-work-email-conflict-001",
      applied: false,
      conflict: {
        conflictId:
          "synthetic-work-email-conflict:writeback-event-work-email-conflict-001:inbound_value_conflict",
        conflictType: "inbound_value_conflict",
        currentContactValue: "hrcore.authoritative@example.invalid",
        attemptedProviderValue: "provider.inbound@example.invalid",
        correlationId:
          "correlation-writeback-work-email-conflict-001:conflict:inbound_value_conflict",
      },
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-conflict-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "hrcore.authoritative@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                writeback_event_id,
                conflict_type,
                current_contact_value,
                attempted_provider_value,
                correlation_id,
                poc_marker
              FROM writeback_work_email_conflict
              WHERE writeback_event_id = 'writeback-event-work-email-conflict-001'
            `,
          )
          .get(),
      ),
      {
        writeback_event_id: "writeback-event-work-email-conflict-001",
        conflict_type: "inbound_value_conflict",
        current_contact_value: "hrcore.authoritative@example.invalid",
        attempted_provider_value: "provider.inbound@example.invalid",
        correlation_id:
          "correlation-writeback-work-email-conflict-001:conflict:inbound_value_conflict",
        poc_marker: "synthetic_poc",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email writeback does not use rejected conflicts as accepted provider baseline", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    assert.equal(
      ingestSyntheticWorkEmailWriteback(
        db,
        createSyntheticWorkEmailWritebackFixture({
          eventId: "writeback-event-work-email-conflict-001",
          providerValue: "provider.rejected@example.invalid",
          correlationId: "correlation-writeback-work-email-conflict-001",
          receivedAt: "2026-05-18T01:05:00Z",
        }),
      ).applied,
      false,
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'provider.rejected@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const retryResult = ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture({
        eventId: "writeback-event-work-email-conflict-002",
        providerValue: "provider.retry@example.invalid",
        correlationId: "correlation-writeback-work-email-conflict-002",
        receivedAt: "2026-05-18T01:10:00Z",
      }),
    );

    assert.deepEqual(retryResult, {
      eventId: "writeback-event-work-email-conflict-002",
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      correlationId: "correlation-writeback-work-email-conflict-002",
      applied: false,
      conflict: {
        conflictId:
          "synthetic-work-email-conflict:writeback-event-work-email-conflict-002:inbound_value_conflict",
        conflictType: "inbound_value_conflict",
        currentContactValue: "provider.rejected@example.invalid",
        attemptedProviderValue: "provider.retry@example.invalid",
        correlationId:
          "correlation-writeback-work-email-conflict-002:conflict:inbound_value_conflict",
      },
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "provider.rejected@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict
              WHERE conflict_type = 'inbound_value_conflict'
            `,
          )
          .get(),
      ),
      {
        count: 2,
      },
    );
  } finally {
    db.close();
  }
});

test("mock Okta emitted work email writeback payload can be ingested", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    const adapter = buildOktaMasteringAdapter({
      mode: "mock",
      initialUsers: [
        createSyntheticOktaUserFixture({
          externalId: "okta-user-writeback-001",
          employeeNumber: "EMP-WRITEBACK-001",
          email: "writeback.identity@example.invalid",
          displayName: "Writeback Identity",
          givenName: "Writeback",
          familyName: "Identity",
          status: "active",
          departmentCode: "DEPT-SYN",
          effectiveAt: "2026-05-18T08:00:00.000Z",
        }),
      ],
    });

    const projectionResult = await adapter.project({
      operation: "update",
      desiredUser: createSyntheticOktaUserFixture({
        externalId: "okta-user-writeback-001",
        employeeNumber: "EMP-WRITEBACK-001",
        email: "confirmed.writeback@example.invalid",
        displayName: "Writeback Identity",
        givenName: "Writeback",
        familyName: "Identity",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T16:00:00.000Z",
      }),
    });
    assert.equal(projectionResult.outcome, "success");

    const emittedEvent = await adapter.emitWorkEmailWriteback({
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      employeeNumber: "EMP-WRITEBACK-001",
      workEmail: "confirmed.writeback@example.invalid",
      emittedAt: "2026-05-18T16:00:00.000Z",
      projectionEvidence: projectionResult.metadata,
    });

    assert.equal(
      emittedEvent.metadata.projectionKey,
      "okta:mock:update:EMP-WRITEBACK-001:2026-05-18T16%3A00%3A00.000Z",
    );
    assert.deepEqual(
      ingestSyntheticWorkEmailWriteback(db, emittedEvent.payload),
      {
        eventId:
          "okta-work-email-writeback-update-EMP-WRITEBACK-001-2026-05-18T16%3A00%3A00.000Z",
        personId: "person-writeback-001",
        contactPointId: "contact-point-writeback-001",
        providerName: "synthetic_okta",
        providerSubjectId: "okta-user-writeback-001",
        correlationId:
          "okta:mock:work_email_writeback:update:EMP-WRITEBACK-001:2026-05-18T16%3A00%3A00.000Z",
        applied: true,
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email writeback can refresh a changed mock provider value", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-refresh-001', 'Synthetic Writeback Refresh Person', '2026-05-18T00:00:00Z');
    `);

    const adapter = buildOktaMasteringAdapter({
      mode: "mock",
      initialUsers: [
        createSyntheticOktaUserFixture({
          externalId: "okta-user-writeback-refresh-001",
          employeeNumber: "EMP-WRITEBACK-REFRESH-001",
          email: "event.refresh@example.invalid",
          displayName: "Writeback Refresh",
          givenName: "Writeback",
          familyName: "Refresh",
          status: "active",
          departmentCode: "DEPT-SYN",
          effectiveAt: "2026-05-18T08:00:00.000Z",
        }),
      ],
    });

    const eventProjectionResult = await adapter.project({
      operation: "update",
      desiredUser: createSyntheticOktaUserFixture({
        externalId: "okta-user-writeback-refresh-001",
        employeeNumber: "EMP-WRITEBACK-REFRESH-001",
        email: "event.refresh@example.invalid",
        displayName: "Writeback Refresh",
        givenName: "Writeback",
        familyName: "Refresh",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T16:00:00.000Z",
      }),
    });
    assert.equal(eventProjectionResult.outcome, "success");

    const emittedEvent = await adapter.emitWorkEmailWriteback({
      personId: "person-writeback-refresh-001",
      contactPointId: "contact-point-writeback-refresh-001",
      employeeNumber: "EMP-WRITEBACK-REFRESH-001",
      workEmail: "event.refresh@example.invalid",
      emittedAt: "2026-05-18T16:00:00.000Z",
      projectionEvidence: eventProjectionResult.metadata,
    });

    ingestSyntheticWorkEmailWriteback(db, emittedEvent.payload);

    const refreshProjectionResult = await adapter.project({
      operation: "update",
      desiredUser: createSyntheticOktaUserFixture({
        externalId: "okta-user-writeback-refresh-001",
        employeeNumber: "EMP-WRITEBACK-REFRESH-001",
        email: "provider.refresh@example.invalid",
        displayName: "Writeback Refresh",
        givenName: "Writeback",
        familyName: "Refresh",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T16:05:00.000Z",
      }),
    });
    assert.equal(refreshProjectionResult.outcome, "success");

    const refreshedProviderValue = await adapter.refreshWorkEmailWriteback({
      providerSubjectId: emittedEvent.payload.providerSubjectId,
      refreshedAt: "2026-05-18T16:06:00.000Z",
      projectionEvidence: refreshProjectionResult.metadata,
    });

    assert.deepEqual(
      refreshSyntheticWorkEmailFromProvider(db, {
        eventId: emittedEvent.payload.eventId,
        providerName: "synthetic_okta",
        providerSubjectId: emittedEvent.payload.providerSubjectId,
        providerValue: refreshedProviderValue.providerValue,
        refreshedAt: refreshedProviderValue.refreshedAt,
      }),
      {
        eventId: emittedEvent.payload.eventId,
        personId: "person-writeback-refresh-001",
        contactPointId: "contact-point-writeback-refresh-001",
        providerName: "synthetic_okta",
        providerSubjectId: "okta-user-writeback-refresh-001",
        eventProviderValue: "event.refresh@example.invalid",
        refreshedProviderValue: "provider.refresh@example.invalid",
        correlationId:
          "okta:mock:work_email_writeback:update:EMP-WRITEBACK-REFRESH-001:2026-05-18T16%3A00%3A00.000Z",
        refreshedAt: "2026-05-18T16:06:00.000Z",
        applied: true,
        mismatch: true,
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-refresh-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "provider.refresh@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT provider_value
              FROM writeback_event
              WHERE id = ?
            `,
          )
          .get(emittedEvent.payload.eventId),
      ),
      {
        provider_value: "event.refresh@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                writeback_event_id,
                provider_value,
                refreshed_at,
                poc_marker
              FROM writeback_provider_refresh
              WHERE writeback_event_id = ?
            `,
          )
          .get(emittedEvent.payload.eventId),
      ),
      {
        writeback_event_id: emittedEvent.payload.eventId,
        provider_value: "provider.refresh@example.invalid",
        refreshed_at: "2026-05-18T16:06:00.000Z",
        poc_marker: "synthetic_poc",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email provider refresh can confirm the event value", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    const result = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "confirmed.writeback@example.invalid",
      refreshedAt: "2026-05-18T01:05:00Z",
    });

    assert.equal(result.eventProviderValue, result.refreshedProviderValue);
    assert.equal(result.mismatch, false);
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "confirmed.writeback@example.invalid",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email provider refresh records HRCore drift conflicts without overwrite", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const result = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.changed@example.invalid",
      refreshedAt: "2026-05-18T01:05:00Z",
    });

    assert.deepEqual(result, {
      eventId: "writeback-event-work-email-001",
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      eventProviderValue: "confirmed.writeback@example.invalid",
      refreshedProviderValue: "provider.changed@example.invalid",
      correlationId: "correlation-writeback-work-email-001",
      refreshedAt: "2026-05-18T01:05:00Z",
      applied: false,
      mismatch: true,
      conflict: {
        conflictId:
          "synthetic-work-email-conflict:writeback-event-work-email-001:synthetic-work-email-provider-refresh:writeback-event-work-email-001:2026-05-18T01%3A05%3A00Z:provider_refresh_conflict",
        conflictType: "provider_refresh_conflict",
        currentContactValue: "hrcore.changed@example.invalid",
        attemptedProviderValue: "provider.changed@example.invalid",
        correlationId:
          "correlation-writeback-work-email-001:provider_refresh:2026-05-18T01%3A05%3A00Z:conflict:provider_refresh_conflict",
      },
    });
    const secondResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.second@example.invalid",
      refreshedAt: "2026-05-18T01:10:00Z",
    });

    assert.deepEqual(secondResult, {
      eventId: "writeback-event-work-email-001",
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      eventProviderValue: "confirmed.writeback@example.invalid",
      refreshedProviderValue: "provider.second@example.invalid",
      correlationId: "correlation-writeback-work-email-001",
      refreshedAt: "2026-05-18T01:10:00Z",
      applied: false,
      mismatch: true,
      conflict: {
        conflictId:
          "synthetic-work-email-conflict:writeback-event-work-email-001:synthetic-work-email-provider-refresh:writeback-event-work-email-001:2026-05-18T01%3A10%3A00Z:provider_refresh_conflict",
        conflictType: "provider_refresh_conflict",
        currentContactValue: "hrcore.changed@example.invalid",
        attemptedProviderValue: "provider.second@example.invalid",
        correlationId:
          "correlation-writeback-work-email-001:provider_refresh:2026-05-18T01%3A10%3A00Z:conflict:provider_refresh_conflict",
      },
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "hrcore.changed@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT
                id,
                conflict_type,
                current_contact_value,
                attempted_provider_value,
                detected_at,
                correlation_id
              FROM writeback_work_email_conflict
              WHERE writeback_event_id = 'writeback-event-work-email-001'
              ORDER BY detected_at ASC
            `,
          )
          .all(),
      ),
      [
        {
          id: "synthetic-work-email-conflict:writeback-event-work-email-001:synthetic-work-email-provider-refresh:writeback-event-work-email-001:2026-05-18T01%3A05%3A00Z:provider_refresh_conflict",
          conflict_type: "provider_refresh_conflict",
          current_contact_value: "hrcore.changed@example.invalid",
          attempted_provider_value: "provider.changed@example.invalid",
          detected_at: "2026-05-18T01:05:00Z",
          correlation_id:
            "correlation-writeback-work-email-001:provider_refresh:2026-05-18T01%3A05%3A00Z:conflict:provider_refresh_conflict",
        },
        {
          id: "synthetic-work-email-conflict:writeback-event-work-email-001:synthetic-work-email-provider-refresh:writeback-event-work-email-001:2026-05-18T01%3A10%3A00Z:provider_refresh_conflict",
          conflict_type: "provider_refresh_conflict",
          current_contact_value: "hrcore.changed@example.invalid",
          attempted_provider_value: "provider.second@example.invalid",
          detected_at: "2026-05-18T01:10:00Z",
          correlation_id:
            "correlation-writeback-work-email-001:provider_refresh:2026-05-18T01%3A10%3A00Z:conflict:provider_refresh_conflict",
        },
      ],
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_provider_refresh
              WHERE writeback_event_id = 'writeback-event-work-email-001'
            `,
          )
          .get(),
      ),
      {
        count: 0,
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email provider refresh accepts values already reflected in HRCore", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'provider.reflected@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const result = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.reflected@example.invalid",
      refreshedAt: "2026-05-18T01:05:00Z",
    });

    assert.deepEqual(result, {
      eventId: "writeback-event-work-email-001",
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      eventProviderValue: "confirmed.writeback@example.invalid",
      refreshedProviderValue: "provider.reflected@example.invalid",
      correlationId: "correlation-writeback-work-email-001",
      refreshedAt: "2026-05-18T01:05:00Z",
      applied: true,
      mismatch: true,
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict
              WHERE writeback_event_id = 'writeback-event-work-email-001'
            `,
          )
          .get(),
      ),
      {
        count: 0,
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT provider_value, refreshed_at
              FROM writeback_provider_refresh
              WHERE writeback_event_id = 'writeback-event-work-email-001'
            `,
          )
          .get(),
      ),
      {
        provider_value: "provider.reflected@example.invalid",
        refreshed_at: "2026-05-18T01:05:00Z",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email provider refresh advances after HRCore resolves a refresh conflict", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const conflictResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.resolved@example.invalid",
      refreshedAt: "2026-05-18T01:05:00Z",
    });

    assert.equal(conflictResult.applied, false);

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'provider.resolved@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const result = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.next@example.invalid",
      refreshedAt: "2026-05-18T01:10:00Z",
    });

    assert.deepEqual(result, {
      eventId: "writeback-event-work-email-001",
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      eventProviderValue: "confirmed.writeback@example.invalid",
      refreshedProviderValue: "provider.next@example.invalid",
      correlationId: "correlation-writeback-work-email-001",
      refreshedAt: "2026-05-18T01:10:00Z",
      applied: true,
      mismatch: true,
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "provider.next@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict
              WHERE writeback_event_id = 'writeback-event-work-email-001'
                AND conflict_type = 'provider_refresh_conflict'
            `,
          )
          .get(),
      ),
      {
        count: 1,
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email conflict resolution records an operator decision before provider refresh confirmation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const conflictResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.resolved@example.invalid",
      refreshedAt: "2026-05-18T01:05:00Z",
    });

    assert.equal(conflictResult.applied, false);
    assert.ok(conflictResult.conflict);

    assert.deepEqual(
      resolveSyntheticWorkEmailConflict(db, {
        resolutionId: "resolution-provider-refresh-conflict-001",
        conflictId: conflictResult.conflict.conflictId,
        writebackEventId: "writeback-event-work-email-001",
        providerName: "synthetic_okta",
        providerSubjectId: "synthetic-okta-user-001",
        decision: "accept_provider_value",
        currentContactValue: "hrcore.changed@example.invalid",
        resolvedProviderValue: "provider.resolved@example.invalid",
        decidedAt: "2026-05-18T01:06:00Z",
        decidedBy: "synthetic-operator",
        correlationId: "correlation-resolution-provider-refresh-conflict-001",
      }),
      {
        resolutionId: "resolution-provider-refresh-conflict-001",
        conflictId: conflictResult.conflict.conflictId,
        writebackEventId: "writeback-event-work-email-001",
        personId: "person-writeback-001",
        contactPointId: "contact-point-writeback-001",
        providerName: "synthetic_okta",
        providerSubjectId: "synthetic-okta-user-001",
        decision: "accept_provider_value",
        resolvedProviderValue: "provider.resolved@example.invalid",
        correlationId: "correlation-resolution-provider-refresh-conflict-001",
        applied: true,
      },
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                conflict_id,
                writeback_event_id,
                decision,
                resolved_provider_value,
                decided_by,
                correlation_id,
                poc_marker
              FROM writeback_work_email_conflict_resolution
              WHERE id = 'resolution-provider-refresh-conflict-001'
            `,
          )
          .get(),
      ),
      {
        conflict_id: conflictResult.conflict.conflictId,
        writeback_event_id: "writeback-event-work-email-001",
        decision: "accept_provider_value",
        resolved_provider_value: "provider.resolved@example.invalid",
        decided_by: "synthetic-operator",
        correlation_id: "correlation-resolution-provider-refresh-conflict-001",
        poc_marker: "synthetic_poc",
      },
    );

    const confirmationResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.resolved@example.invalid",
      refreshedAt: "2026-05-18T01:07:00Z",
    });

    assert.equal(confirmationResult.applied, true);
    assert.equal(
      confirmationResult.refreshedProviderValue,
      "provider.resolved@example.invalid",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT
                conflict.writeback_event_id,
                conflict.correlation_id AS conflict_correlation_id,
                resolution.correlation_id AS resolution_correlation_id,
                refresh.correlation_id AS refresh_correlation_id
              FROM writeback_work_email_conflict AS conflict
              JOIN writeback_work_email_conflict_resolution AS resolution
                ON resolution.conflict_id = conflict.id
              JOIN writeback_provider_refresh AS refresh
                ON refresh.writeback_event_id = conflict.writeback_event_id
              WHERE conflict.id = ?
            `,
          )
          .all(conflictResult.conflict.conflictId),
      ),
      [
        {
          writeback_event_id: "writeback-event-work-email-001",
          conflict_correlation_id: conflictResult.conflict.correlationId,
          resolution_correlation_id:
            "correlation-resolution-provider-refresh-conflict-001",
          refresh_correlation_id:
            "correlation-writeback-work-email-001:provider_refresh:2026-05-18T01%3A07%3A00Z",
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("synthetic work email conflict resolution rejects stale HRCore state without partial writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const conflictResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.resolved@example.invalid",
      refreshedAt: "2026-05-18T01:05:00Z",
    });

    assert.ok(conflictResult.conflict);

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed-again@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    assert.throws(
      () =>
        resolveSyntheticWorkEmailConflict(db, {
          resolutionId: "resolution-provider-refresh-conflict-stale-001",
          conflictId: conflictResult.conflict!.conflictId,
          writebackEventId: "writeback-event-work-email-001",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-001",
          decision: "accept_provider_value",
          currentContactValue: "hrcore.changed@example.invalid",
          resolvedProviderValue: "provider.resolved@example.invalid",
          decidedAt: "2026-05-18T01:06:00Z",
          decidedBy: "synthetic-operator",
          correlationId:
            "correlation-resolution-provider-refresh-conflict-stale-001",
        }),
      /conflict resolution requires current HRCore value to match the recorded conflict/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "hrcore.changed-again@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict_resolution
            `,
          )
          .get(),
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email conflict resolution rejects stale writeback events without partial writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const conflictResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.resolved@example.invalid",
      refreshedAt: "2026-05-18T01:05:00Z",
    });

    assert.ok(conflictResult.conflict);

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'provider.resolved@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture({
        eventId: "writeback-event-work-email-002",
        providerValue: "newer.provider@example.invalid",
        correlationId: "correlation-writeback-work-email-002",
        receivedAt: "2026-05-18T01:10:00Z",
      }),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    assert.throws(
      () =>
        resolveSyntheticWorkEmailConflict(db, {
          resolutionId: "resolution-provider-refresh-conflict-stale-event-001",
          conflictId: conflictResult.conflict!.conflictId,
          writebackEventId: "writeback-event-work-email-001",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-001",
          decision: "accept_provider_value",
          currentContactValue: "hrcore.changed@example.invalid",
          resolvedProviderValue: "provider.resolved@example.invalid",
          decidedAt: "2026-05-18T01:11:00Z",
          decidedBy: "synthetic-operator",
          correlationId:
            "correlation-resolution-provider-refresh-conflict-stale-event-001",
        }),
      /conflict resolution requires the latest writeback event for the contact point/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "hrcore.changed@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict_resolution
            `,
          )
          .get(),
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email conflict resolution rejects non-latest provider refresh conflicts without partial writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const olderConflictResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.older-conflict@example.invalid",
      refreshedAt: "2026-05-18T01:05:00Z",
    });

    assert.equal(olderConflictResult.applied, false);
    assert.ok(olderConflictResult.conflict);

    const newerConflictResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.newer-conflict@example.invalid",
      refreshedAt: "2026-05-18T01:10:00Z",
    });

    assert.equal(newerConflictResult.applied, false);
    assert.ok(newerConflictResult.conflict);

    assert.throws(
      () =>
        resolveSyntheticWorkEmailConflict(db, {
          resolutionId: "resolution-provider-refresh-conflict-non-latest-001",
          conflictId: olderConflictResult.conflict!.conflictId,
          writebackEventId: "writeback-event-work-email-001",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-001",
          decision: "accept_provider_value",
          currentContactValue: "hrcore.changed@example.invalid",
          resolvedProviderValue: "provider.older-conflict@example.invalid",
          decidedAt: "2026-05-18T01:11:00Z",
          decidedBy: "synthetic-operator",
          correlationId:
            "correlation-resolution-provider-refresh-conflict-non-latest-001",
        }),
      /conflict resolution requires the latest provider refresh conflict/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "hrcore.changed@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict_resolution
            `,
          )
          .get(),
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email conflict resolution rejects conflicts superseded by provider refreshes without partial writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const conflictResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.older-conflict@example.invalid",
      refreshedAt: "2026-05-18T01:05:00Z",
    });

    assert.equal(conflictResult.applied, false);
    assert.ok(conflictResult.conflict);

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'provider.newer-refresh@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const refreshResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.newer-refresh@example.invalid",
      refreshedAt: "2026-05-18T01:10:00Z",
    });

    assert.equal(refreshResult.applied, true);

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    assert.throws(
      () =>
        resolveSyntheticWorkEmailConflict(db, {
          resolutionId:
            "resolution-provider-refresh-conflict-superseded-refresh-001",
          conflictId: conflictResult.conflict!.conflictId,
          writebackEventId: "writeback-event-work-email-001",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-001",
          decision: "accept_provider_value",
          currentContactValue: "hrcore.changed@example.invalid",
          resolvedProviderValue: "provider.older-conflict@example.invalid",
          decidedAt: "2026-05-18T01:11:00Z",
          decidedBy: "synthetic-operator",
          correlationId:
            "correlation-resolution-provider-refresh-conflict-superseded-refresh-001",
        }),
      /conflict resolution requires the latest provider refresh attempt/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "hrcore.changed@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict_resolution
            `,
          )
          .get(),
      ),
      { count: 0 },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_provider_refresh
              WHERE writeback_event_id = 'writeback-event-work-email-001'
            `,
          )
          .get(),
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email conflict resolution rejects inbound conflicts without partial writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-conflict-001', 'Synthetic Writeback Conflict Person', '2026-05-18T00:00:00Z');

      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-writeback-conflict-001',
        'person-writeback-conflict-001',
        'work_email',
        'hrcore.authoritative@example.invalid',
        1,
        '2026-05-18T00:00:00Z'
      );
    `);

    const conflictResult = ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture({
        eventId: "writeback-event-work-email-conflict-001",
        personId: "person-writeback-conflict-001",
        contactPointId: "contact-point-writeback-conflict-001",
        providerValue: "provider.inbound@example.invalid",
        correlationId: "correlation-writeback-work-email-conflict-001",
      }),
    );

    assert.equal(conflictResult.applied, false);
    assert.ok(conflictResult.conflict);
    assert.equal(
      conflictResult.conflict.conflictType,
      "inbound_value_conflict",
    );

    assert.throws(
      () =>
        resolveSyntheticWorkEmailConflict(db, {
          resolutionId: "resolution-inbound-conflict-001",
          conflictId: conflictResult.conflict!.conflictId,
          writebackEventId: "writeback-event-work-email-conflict-001",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-001",
          decision: "accept_provider_value",
          currentContactValue: "hrcore.authoritative@example.invalid",
          resolvedProviderValue: "provider.inbound@example.invalid",
          decidedAt: "2026-05-18T01:06:00Z",
          decidedBy: "synthetic-operator",
          correlationId: "correlation-resolution-inbound-conflict-001",
        }),
      /conflict resolution requires a provider refresh conflict/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-conflict-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "hrcore.authoritative@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict_resolution
            `,
          )
          .get(),
      ),
      { count: 0 },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                writeback_event_id,
                conflict_type,
                correlation_id
              FROM writeback_work_email_conflict
              WHERE id = ?
            `,
          )
          .get(conflictResult.conflict.conflictId),
      ),
      {
        writeback_event_id: "writeback-event-work-email-conflict-001",
        conflict_type: "inbound_value_conflict",
        correlation_id:
          "correlation-writeback-work-email-conflict-001:conflict:inbound_value_conflict",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email inbound baseline advances after resolved provider refresh conflicts", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const conflictResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.resolved@example.invalid",
      refreshedAt: "2026-05-18T01:05:00Z",
    });

    assert.equal(conflictResult.applied, false);

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'provider.resolved@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const result = ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture({
        eventId: "writeback-event-work-email-002",
        providerValue: "provider.next-inbound@example.invalid",
        correlationId: "correlation-writeback-work-email-002",
        receivedAt: "2026-05-18T01:10:00Z",
      }),
    );

    assert.deepEqual(result, {
      eventId: "writeback-event-work-email-002",
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      correlationId: "correlation-writeback-work-email-002",
      applied: true,
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict
              WHERE writeback_event_id = 'writeback-event-work-email-002'
            `,
          )
          .get(),
      ),
      {
        count: 0,
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "provider.next-inbound@example.invalid",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email provider refresh rejects attempts older than a conflict resolution", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const conflictResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.resolved@example.invalid",
      refreshedAt: "2026-05-18T01:05:00Z",
    });

    assert.equal(conflictResult.applied, false);
    assert.ok(conflictResult.conflict);

    resolveSyntheticWorkEmailConflict(db, {
      resolutionId: "resolution-provider-refresh-conflict-stale-refresh-001",
      conflictId: conflictResult.conflict.conflictId,
      writebackEventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      decision: "accept_provider_value",
      currentContactValue: "hrcore.changed@example.invalid",
      resolvedProviderValue: "provider.resolved@example.invalid",
      decidedAt: "2026-05-18T01:06:00Z",
      decidedBy: "synthetic-operator",
      correlationId:
        "correlation-resolution-provider-refresh-conflict-stale-refresh-001",
    });

    assert.throws(
      () =>
        refreshSyntheticWorkEmailFromProvider(db, {
          eventId: "writeback-event-work-email-001",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-001",
          providerValue: "provider.delayed@example.invalid",
          refreshedAt: "2026-05-18T01:05:30Z",
        }),
      /provider refresh must be newer than the latest provider refresh attempt/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "provider.resolved@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_provider_refresh
            `,
          )
          .get(),
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email provider refresh rejects attempts older than a recorded conflict", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    const conflictResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.newer-conflict@example.invalid",
      refreshedAt: "2026-05-18T01:10:00Z",
    });

    assert.equal(conflictResult.applied, false);

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'confirmed.writeback@example.invalid'
        WHERE person_id = 'person-writeback-001'
          AND contact_type = 'work_email'
      `,
    ).run();

    assert.throws(
      () =>
        refreshSyntheticWorkEmailFromProvider(db, {
          eventId: "writeback-event-work-email-001",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-001",
          providerValue: "provider.delayed@example.invalid",
          refreshedAt: "2026-05-18T01:05:00Z",
        }),
      /provider refresh must be newer than the latest provider refresh attempt/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "confirmed.writeback@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_provider_refresh
              WHERE writeback_event_id = 'writeback-event-work-email-001'
            `,
          )
          .get(),
      ),
      {
        count: 0,
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict
              WHERE writeback_event_id = 'writeback-event-work-email-001'
                AND conflict_type = 'provider_refresh_conflict'
            `,
          )
          .get(),
      ),
      {
        count: 1,
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email provider refresh rejects provider subject drift without partial updates", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    assert.throws(
      () =>
        refreshSyntheticWorkEmailFromProvider(db, {
          eventId: "writeback-event-work-email-001",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-drift-001",
          providerValue: "drifted.provider@example.invalid",
          refreshedAt: "2026-05-18T01:05:00Z",
        }),
      /provider refresh must match the original writeback event identity/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "confirmed.writeback@example.invalid",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email provider refresh rejects values older than the writeback event", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    assert.throws(
      () =>
        refreshSyntheticWorkEmailFromProvider(db, {
          eventId: "writeback-event-work-email-001",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-001",
          providerValue: "stale.provider@example.invalid",
          refreshedAt: "2026-05-18T00:59:00Z",
        }),
      /provider refresh must not be older than the original writeback event/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "confirmed.writeback@example.invalid",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email provider refresh rejects superseded writeback events", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture({
        eventId: "writeback-event-work-email-001",
        providerValue: "first.writeback@example.invalid",
        correlationId: "correlation-writeback-work-email-001",
        receivedAt: "2026-05-18T01:00:00Z",
      }),
    );
    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture({
        eventId: "writeback-event-work-email-002",
        providerValue: "second.writeback@example.invalid",
        correlationId: "correlation-writeback-work-email-002",
        receivedAt: "2026-05-18T01:10:00Z",
      }),
    );

    assert.throws(
      () =>
        refreshSyntheticWorkEmailFromProvider(db, {
          eventId: "writeback-event-work-email-001",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-001",
          providerValue: "delayed.refresh@example.invalid",
          refreshedAt: "2026-05-18T01:11:00Z",
        }),
      /provider refresh requires the latest writeback event for the contact point/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "second.writeback@example.invalid",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email writeback rejects stale events before overwrite", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture({
        eventId: "writeback-event-work-email-newer",
        providerValue: "newer.writeback@example.invalid",
        correlationId: "correlation-writeback-work-email-newer",
        receivedAt: "2026-05-18T01:10:00Z",
      }),
    );

    assert.throws(
      () =>
        ingestSyntheticWorkEmailWriteback(
          db,
          createSyntheticWorkEmailWritebackFixture({
            eventId: "writeback-event-work-email-stale",
            providerValue: "stale.writeback@example.invalid",
            correlationId: "correlation-writeback-work-email-stale",
            receivedAt: "2026-05-18T01:05:00Z",
          }),
        ),
      /writeback event must not be older than the latest accepted event for the contact point/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      { value: "newer.writeback@example.invalid" },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_event
            `,
          )
          .get(),
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email provider refresh rejects same-time superseded writeback events by ingest order", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture({
        eventId: "writeback-event-work-email-z",
        providerValue: "same-time-first@example.invalid",
        correlationId: "correlation-writeback-work-email-z",
        receivedAt: "2026-05-18T01:00:00Z",
      }),
    );
    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture({
        eventId: "writeback-event-work-email-a",
        providerValue: "same-time-second@example.invalid",
        correlationId: "correlation-writeback-work-email-a",
        receivedAt: "2026-05-18T01:00:00Z",
      }),
    );

    assert.throws(
      () =>
        refreshSyntheticWorkEmailFromProvider(db, {
          eventId: "writeback-event-work-email-z",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-001",
          providerValue: "same-time-delayed-refresh@example.invalid",
          refreshedAt: "2026-05-18T01:01:00Z",
        }),
      /provider refresh requires the latest writeback event for the contact point/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "same-time-second@example.invalid",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email provider refresh preserves newer provider refreshes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-work-email-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "newer.provider@example.invalid",
      refreshedAt: "2026-05-18T01:10:00Z",
    });

    assert.throws(
      () =>
        refreshSyntheticWorkEmailFromProvider(db, {
          eventId: "writeback-event-work-email-001",
          providerName: "synthetic_okta",
          providerSubjectId: "synthetic-okta-user-001",
          providerValue: "delayed.provider@example.invalid",
          refreshedAt: "2026-05-18T01:05:00Z",
        }),
      /provider refresh must be newer than the latest provider refresh attempt/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        value: "newer.provider@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_provider_refresh
              WHERE writeback_event_id = 'writeback-event-work-email-001'
            `,
          )
          .get(),
      ),
      {
        count: 1,
      },
    );
  } finally {
    db.close();
  }
});

test("mock Okta emitted create and update writebacks with the same timestamp both ingest", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-operation-001', 'Synthetic Writeback Operation Person', '2026-05-18T00:00:00Z');
    `);

    const adapter = buildOktaMasteringAdapter({ mode: "mock" });
    const effectiveAt = "2026-05-18T16:40:00.000Z";

    const createProjectionResult = await adapter.project({
      operation: "create",
      desiredUser: createSyntheticOktaUserFixture({
        externalId: "okta-user-writeback-operation-001",
        employeeNumber: "EMP-WRITEBACK-OPERATION-001",
        email: "created.operation@example.invalid",
        displayName: "Writeback Operation",
        givenName: "Writeback",
        familyName: "Operation",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt,
      }),
    });
    assert.equal(createProjectionResult.outcome, "success");

    const createEvent = await adapter.emitWorkEmailWriteback({
      personId: "person-writeback-operation-001",
      contactPointId: "contact-point-writeback-operation-001",
      employeeNumber: "EMP-WRITEBACK-OPERATION-001",
      workEmail: "created.operation@example.invalid",
      emittedAt: effectiveAt,
      projectionEvidence: createProjectionResult.metadata,
    });

    const updateProjectionResult = await adapter.project({
      operation: "update",
      desiredUser: createSyntheticOktaUserFixture({
        externalId: "okta-user-writeback-operation-001",
        employeeNumber: "EMP-WRITEBACK-OPERATION-001",
        email: "updated.operation@example.invalid",
        displayName: "Writeback Operation",
        givenName: "Writeback",
        familyName: "Operation",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt,
      }),
    });
    assert.equal(updateProjectionResult.outcome, "success");

    const updateEvent = await adapter.emitWorkEmailWriteback({
      personId: "person-writeback-operation-001",
      contactPointId: "contact-point-writeback-operation-001",
      employeeNumber: "EMP-WRITEBACK-OPERATION-001",
      workEmail: "updated.operation@example.invalid",
      emittedAt: effectiveAt,
      projectionEvidence: updateProjectionResult.metadata,
    });

    assert.notEqual(createEvent.payload.eventId, updateEvent.payload.eventId);
    assert.notEqual(
      createEvent.payload.correlationId,
      updateEvent.payload.correlationId,
    );

    ingestSyntheticWorkEmailWriteback(db, createEvent.payload);
    ingestSyntheticWorkEmailWriteback(db, updateEvent.payload);

    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, correlation_id, provider_value
              FROM writeback_event
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "okta-work-email-writeback-create-EMP-WRITEBACK-OPERATION-001-2026-05-18T16%3A40%3A00.000Z",
          correlation_id:
            "okta:mock:work_email_writeback:create:EMP-WRITEBACK-OPERATION-001:2026-05-18T16%3A40%3A00.000Z",
          provider_value: "created.operation@example.invalid",
        },
        {
          id: "okta-work-email-writeback-update-EMP-WRITEBACK-OPERATION-001-2026-05-18T16%3A40%3A00.000Z",
          correlation_id:
            "okta:mock:work_email_writeback:update:EMP-WRITEBACK-OPERATION-001:2026-05-18T16%3A40%3A00.000Z",
          provider_value: "updated.operation@example.invalid",
        },
      ],
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT id, value
              FROM contact_point
              WHERE person_id = 'person-writeback-operation-001'
            `,
          )
          .get(),
      ),
      {
        id: "contact-point-writeback-operation-001",
        value: "updated.operation@example.invalid",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email writeback rejects invalid input before durable writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    assert.throws(
      () =>
        ingestSyntheticWorkEmailWriteback(
          db,
          createSyntheticWorkEmailWritebackFixture({
            providerValue: "not-an-email",
          }),
        ),
      /providerValue must be a skeleton work email/,
    );

    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
      ),
      { count: 0 },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM contact_point").get(),
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email writeback rejects contact point id drift before evidence writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');

      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-authoritative-001',
        'person-writeback-001',
        'work_email',
        'old.writeback@example.invalid',
        1,
        '2026-05-18T00:00:00Z'
      );
    `);

    assert.throws(
      () =>
        ingestSyntheticWorkEmailWriteback(
          db,
          createSyntheticWorkEmailWritebackFixture({
            contactPointId: "contact-point-payload-001",
          }),
        ),
      /contactPointId must match existing work_email contact point/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT id, value
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
                AND contact_type = 'work_email'
            `,
          )
          .get(),
      ),
      {
        id: "contact-point-authoritative-001",
        value: "old.writeback@example.invalid",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email writeback rejects unknown person without partial durable writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    assert.throws(
      () =>
        ingestSyntheticWorkEmailWriteback(
          db,
          createSyntheticWorkEmailWritebackFixture({
            personId: "person-writeback-missing",
          }),
        ),
      /FOREIGN KEY constraint failed/,
    );

    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
      ),
      { count: 0 },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM contact_point").get(),
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("POST /writeback-events/work-email exposes the local synthetic ingest API", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  const app = await buildApp({ writebackDb: db });
  t.after(async () => {
    await app.close();
    db.close();
  });

  db.exec(`
    INSERT INTO person (id, display_name, created_at)
    VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
  `);

  const response = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
    payload: createSyntheticWorkEmailWritebackFixture(),
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    eventId: "writeback-event-work-email-001",
    personId: "person-writeback-001",
    contactPointId: "contact-point-writeback-001",
    providerName: "synthetic_okta",
    providerSubjectId: "synthetic-okta-user-001",
    correlationId: "correlation-writeback-work-email-001",
    applied: true,
  });
  assert.deepEqual(
    normalizeRow(
      db
        .prepare(
          `
            SELECT provider_value
            FROM writeback_event
            WHERE id = 'writeback-event-work-email-001'
          `,
        )
        .get(),
    ),
    {
      provider_value: "confirmed.writeback@example.invalid",
    },
  );
});

test("POST /writeback-events/work-email maps invalid synthetic input to 400", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  const app = await buildApp({ writebackDb: db });
  t.after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
    payload: createSyntheticWorkEmailWritebackFixture({
      providerValue: "not-an-email",
    }),
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "providerValue must be a skeleton work email",
  });
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
    ),
    { count: 0 },
  );
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM contact_point").get(),
    ),
    { count: 0 },
  );
});

test("POST /writeback-events/work-email maps local constraint failures to 400", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  const app = await buildApp({ writebackDb: db });
  t.after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
    payload: createSyntheticWorkEmailWritebackFixture({
      personId: "person-writeback-missing",
    }),
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "writeback event violates local synthetic constraints",
  });
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
    ),
    { count: 0 },
  );
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM contact_point").get(),
    ),
    { count: 0 },
  );
});

test("POST /writeback-events/work-email maps duplicate writeback evidence to 400 without partial updates", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  const app = await buildApp({ writebackDb: db });
  t.after(async () => {
    await app.close();
    db.close();
  });

  db.exec(`
    INSERT INTO person (id, display_name, created_at)
    VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
  `);

  const acceptedResponse = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
    payload: createSyntheticWorkEmailWritebackFixture(),
  });

  assert.equal(acceptedResponse.statusCode, 201);

  const duplicateResponse = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
    payload: createSyntheticWorkEmailWritebackFixture({
      eventId: "writeback-event-work-email-002",
      contactPointId: "contact-point-writeback-001",
      providerValue: "retry-should-not-apply@example.invalid",
    }),
  });

  assert.equal(duplicateResponse.statusCode, 400);
  assert.deepEqual(duplicateResponse.json(), {
    error: "writeback event violates local synthetic constraints",
  });
  assert.deepEqual(
    normalizeRow(
      db
        .prepare(
          `
            SELECT value
            FROM contact_point
            WHERE person_id = 'person-writeback-001'
              AND contact_type = 'work_email'
          `,
        )
        .get(),
    ),
    {
      value: "confirmed.writeback@example.invalid",
    },
  );
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
    ),
    { count: 1 },
  );
});

test("POST /writeback-events/work-email rejects contact point id drift before durable writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  const app = await buildApp({ writebackDb: db });
  t.after(async () => {
    await app.close();
    db.close();
  });

  db.exec(`
    INSERT INTO person (id, display_name, created_at)
    VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');

    INSERT INTO contact_point (
      id,
      person_id,
      contact_type,
      value,
      is_primary,
      created_at
    )
    VALUES (
      'contact-point-authoritative-001',
      'person-writeback-001',
      'work_email',
      'old.writeback@example.invalid',
      1,
      '2026-05-18T00:00:00Z'
    );
  `);

  const response = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
    payload: createSyntheticWorkEmailWritebackFixture({
      contactPointId: "contact-point-payload-001",
    }),
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "contactPointId must match existing work_email contact point",
  });
  assert.deepEqual(
    normalizeRow(
      db
        .prepare(
          `
            SELECT id, value
            FROM contact_point
            WHERE person_id = 'person-writeback-001'
              AND contact_type = 'work_email'
          `,
        )
        .get(),
    ),
    {
      id: "contact-point-authoritative-001",
      value: "old.writeback@example.invalid",
    },
  );
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
    ),
    { count: 0 },
  );
});

test("POST /writeback-events/work-email rejects non-object request bodies", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  const app = await buildApp({ writebackDb: db });
  t.after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
    payload: ["not", "a", "writeback", "event"],
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "request body must be an object",
  });
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
    ),
    { count: 0 },
  );
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM contact_point").get(),
    ),
    { count: 0 },
  );
});

test("POST /writeback-events/work-email rejects missing request bodies before durable writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  const app = await buildApp({ writebackDb: db });
  t.after(async () => {
    await app.close();
    db.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "request body must be an object",
  });
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
    ),
    { count: 0 },
  );
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM contact_point").get(),
    ),
    { count: 0 },
  );
});

test("POST /writeback-events/work-email rejects unsupported request fields before durable writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  const app = await buildApp({ writebackDb: db });
  t.after(async () => {
    await app.close();
  });
  t.after(() => {
    db.close();
  });

  db.exec(`
    INSERT INTO person (id, display_name, created_at)
    VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
  `);

  const response = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
    payload: {
      ...createSyntheticWorkEmailWritebackFixture(),
      unexpectedProviderHint: "ignore-me",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "request body contains unsupported fields: unexpectedProviderHint",
  });
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
    ),
    { count: 0 },
  );
  assert.deepEqual(
    normalizeRow(
      db.prepare("SELECT count(*) AS count FROM contact_point").get(),
    ),
    { count: 0 },
  );
});
