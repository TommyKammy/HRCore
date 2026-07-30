# P2Z WebUI Visual Evidence

These screenshots are repository-owned evidence for the bounded/non-production
P2Z visual UAT contract.

The repository-owned [`manifest.json`](manifest.json) records every PNG exactly
once with its Playwright project, viewport, reproducible capture command,
`p2z-webui-visual-alignment-v1` contract version, and SHA-256 digest. The P2Z
repository guard fails when a screenshot is missing, extra, renamed, or changed
without a matching manifest update. The manifest also binds the evidence to a
SHA-256 fingerprint of the current runtime WebUI source, capture specification,
Playwright configuration, and locked dependency state so visual-source changes
cannot leave stale screenshots green.

The authoritative project/viewports and seven-screen inventory live in
`src/p2z-webui-visual-evidence-contract.ts`. Playwright configuration, the
capture test, the manifest updater, and the repository guard share that
contract. The updater refuses to bless a missing, unexpected, renamed, or
wrong-sized PNG, including files with uppercase `.PNG` extensions. It also
validates PNG chunk CRCs, the terminal `IEND` chunk, and decompressed image data
before recording any digest.

Each evidence project also writes a deterministic
`*-capture-provenance.json` sidecar containing the captured viewport, device
pixel ratio, exact screenshot inventory, and source fingerprint. Manifest
regeneration rejects stale sidecars, so a viewport-height, source, dependency,
or visual-contract change requires `npm run capture:web:evidence` before the
manifest can be updated.

## Viewports

- `desktop-chromium-*`: 1440 x 900 CSS pixels
- `tablet-chromium-*`: 768 x 1024 CSS pixels
- `mobile-chromium-*`: 390 x 844 CSS pixels

## Screen Set

- Dashboard
- Employee list
- Employee detail
- Lifecycle procedure list
- Transfer procedure
- Approval inbox
- Job monitor

## Regeneration

Install Chromium once, then regenerate all evidence:

```sh
npx playwright install chromium
npm run capture:web:evidence
```

The capture test fails on missing visual anchors, horizontal overflow, or a
mobile drawer that has not closed after navigation.

## Intentional Regeneration Review

When a visual change is intentional:

1. Run `npm run capture:web:evidence`.
2. Review every changed PNG against the P2Z visual alignment contract and
   confirm that only repository-owned synthetic/non-production data appears.
3. Record any visual-UAT finding in the owning issue; do not treat a matching
   digest as visual acceptance.
4. Run `npm run update:p2z:evidence-manifest` only after the image review.
5. Review the PNG and `manifest.json` diff together, then run the focused P2Z
   guard and `npm run verify:pre-pr`.

The manifest intentionally has no generated timestamp. Identical evidence
therefore produces a stable diff, while every image-content change requires an
explicit digest update.

The screenshots contain synthetic/non-production fixtures only. They are not
evidence of real employee data access, live provider operation, production
authorization, production-like readiness, or go-live approval.
