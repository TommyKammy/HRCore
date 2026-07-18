# P2Z WebUI Visual Evidence

These screenshots are repository-owned evidence for the bounded/non-production
P2Z visual UAT contract.

## Viewports

- `desktop-chromium-*`: 1440 x 900 CSS pixels
- `tablet-chromium-*`: 768 x 1024 CSS pixels
- `mobile-chromium-*`: 390 x 844 CSS pixels

## Screen Set

- Dashboard
- Employee detail
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

The screenshots contain synthetic/non-production fixtures only. They are not
evidence of real employee data access, live provider operation, production
authorization, production-like readiness, or go-live approval.
