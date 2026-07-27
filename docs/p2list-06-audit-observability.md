# P2LIST Audit Observability

This note defines the bounded, repository-owned synthetic evidence surface for
CHILD-P2LIST-06. It does not establish production audit immutability, retention,
SIEM custody, an unrestricted audit browser, a production support console, or
production-like readiness.

## Correlation Flow

The WebUI creates one canonical `p2list-ui-<uuid-v4>` correlation ID for an API
action and sends it as `X-HRCore-Correlation-Id`. Reusing the same `RequestInit`
for a retry preserves that ID. Employee-list, lifecycle-list, detail-open, and
bounded-export routes echo the accepted ID in both the response body or export
headers and the persisted `p2list_audit_event`.

Malformed or non-canonical client values are not echoed or persisted. The API
replaces them with a server-generated `p2list-<uuid>` value.

## Event and Retry Contract

Every P2LIST event uses `p2list_audit_v1` and records only the stable fields in
the OpenAPI `P2ListAuditEvidenceEvent` schema. The database enforces one event
per `(correlation_id, event_type)`. A transport retry with the same correlation
ID is therefore idempotent; multi-stage exports retain one requested event and
one completed or denied event. A new user action must use a new correlation ID.
Reusing an ID for a different actor, scope, filter fingerprint, sort, result,
decision, or reason fails with `correlation_reuse_conflict`.

The recorded duration is a bounded, non-negative integer from the process
monotonic clock. It is operational evidence only, not an SLA measurement.

## Evidence Lookup

Endpoint:

`GET /support/p2list/audit-evidence/{correlationId}`

Access requires all of the following:

- a server-resolved actor;
- `support:correlation:read`;
- exact membership of the requested ID in the actor's server-owned
  `dataScope.correlationIds`.

The endpoint returns at most 20 events for exactly one correlation ID. An absent
ID and an out-of-scope ID both return the same `404 data_scope_denied` response,
so the endpoint does not reveal whether an unauthorized resource exists.

Metrics are derived only from the returned events: request count, bounded latency
minimum/maximum/average, stable denial reason counts, and bounded-export
requested/completed/denied counts.

## Redaction Rules

Audit rows, logs, metric responses, tests, and support evidence must not contain:

- display names or other employee field values;
- raw search terms or query values;
- raw cursors or cursor state;
- CSV bodies or downloaded rows;
- raw provider payloads;
- free-form reason text, notes, or sensitive/prohibited field markers.

Filter and data-scope correlation use SHA-256 canonical fingerprints. Actor ID,
actor role, evaluated permission, stable reason code, resource type, row count,
schema version, and bounded timing are allowed. Request logging remains silent
on P2LIST routes.

## Local Verification

Use repository-owned synthetic actors and data only:

```sh
npm run verify:pre-pr
```

The observability tests cover event schema, WebUI/API correlation propagation,
permission and exact-scope behavior, retry idempotency, metric aggregation,
absence/out-of-scope indistinguishability, and forbidden-marker redaction.
