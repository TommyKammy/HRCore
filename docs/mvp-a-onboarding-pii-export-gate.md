# MVP-A Onboarding PII Masking and Export Gate

MVP-A onboarding keeps PII masking, raw payload viewing, CSV/export, download,
My Number, Specific Personal Information, sensitive personal information, and
real-data processing surfaces closed. The executable gate is
`mvp_a_onboarding_pii_export_closed_v1` in
`src/mvp-a-onboarding-pii-export-gate.ts`.

The gate is anchored to the Proposed ADR boundaries in ADR 0005, ADR 0007, ADR
0014, ADR 0015, ADR 0016, and ADR 0020. Those records are dependency anchors,
not permission to process regulated or unmasked data in MVP-A onboarding.

Before any later issue can open raw payload viewing, CSV/export, download, or
production-like PII masking behavior, it must add explicit two-key acceptance
and implementation evidence for:

- legal and privacy approval for the exact raw-view or export exception;
- field classification, redaction, and masking profile design;
- separate export permission and raw-view permission checks;
- export-template allowlists and data-scope filtering;
- watermark or manifest traceability;
- download-log and raw-payload access audit evidence;
- production real-data processing acceptance.

The current onboarding schema, DTO parser, fixture helper, OpenAPI contract, and
audit evidence paths must reject prohibited raw, export, and regulated-data
payload keys instead of storing them in generic payload, metadata, note, log, or
audit surfaces.
