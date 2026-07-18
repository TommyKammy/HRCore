# P2Z WebUI Visual Alignment Contract

Date: 2026-07-18  
Status: Implemented for bounded/non-production visual UAT

## Purpose

P2Z aligns the repository-owned WebUI with the approved v0.3 HR portal
mockup direction without weakening the existing P2Y workflow, persona, masking,
correlation, or production-blocking boundaries.

The contract covers:

- a persistent desktop sidebar and structural mobile drawer;
- a page header with bounded direct lookup and compact environment state;
- Dashboard, Employee detail, Lifecycle procedure, Approval inbox, and Job
  monitor screen families;
- shared tokens and component states;
- desktop and mobile browser smoke evidence.

It does not claim HR practical-use readiness, production-like readiness, or
go-live approval.

## Product Boundary

- Data is repository-owned synthetic/non-production evidence only.
- Persona selection is a local bounded switcher, not production
  authentication.
- Production authorization/RLS remains blocked.
- Live IdP/Okta/provider mutation remains blocked.
- Broad employee search, broad CSV export, and unrestricted raw payload access
  remain blocked.
- Production queue/DLQ custody and production audit immutability remain
  blocked.
- Master update assist, assistant drawer, and workforce forecast remain
  deferred v1.5 extensions.

## Screen Contract

| Screen family       | Primary persona             | Required structure                                                             | Bounded action                                           |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Dashboard           | HR operator                 | KPI summary, seven-day queue, integration health, recent drafts                | Navigate to one explicit workflow                        |
| Employee detail     | HR operator, HR Ops/support | employee header, masked profile, lifecycle timeline, external IDs              | Open one anchored lifecycle procedure                    |
| Lifecycle procedure | HR operator                 | stepper, input, impact preview, validation, request evidence                   | Create or resubmit one synthetic request                 |
| Approval inbox      | Approver                    | priority queue, selected detail, impact evidence, comment, separated decisions | Approve, return, reject, or cancel one submitted request |
| Job monitor         | HR Ops/support              | runtime summary, recent runs, failed items, run detail, reasoned DLQ decision  | Record one bounded DLQ decision                          |
| Audit               | Approver, HR Ops/support    | exact correlation lookup and authoritative evidence timeline                   | Inspect one explicit synthetic correlation               |

## Information Architecture

The application shell uses the following stable order:

1. non-production environment banner;
2. persona-scoped navigation;
3. page heading and direct bounded lookup;
4. API contract status;
5. route workspace.

Persona and provider context live in the sidebar footer. They must remain
visible without displacing the primary work surface. A missing or invalid
persona fails closed before workflow content is rendered.

## Visual Tokens

The implementation source of truth is `web/src/styles.css`.

| Token group    | Contract                                                            |
| -------------- | ------------------------------------------------------------------- |
| Surfaces       | white task surfaces on a cool light-gray workspace                  |
| Accent         | blue for primary action, current navigation, and focused state only |
| Semantic color | green success, amber warning, red failure/destructive               |
| Radius         | 8px maximum for cards and 6-7px for controls                        |
| Typography     | one system sans family with a fixed rem scale                       |
| Spacing        | compact 4/6/8/12/14/18/22px operational rhythm                      |
| Motion         | state-only transitions under 250ms and reduced-motion fallback      |

Every interactive control must provide visible focus and meaningful disabled
state. Loading uses skeletons; empty and blocked states explain the bounded
reason without exposing bypasses.

## Responsive Contract

| Viewport              | Expected behavior                                                  |
| --------------------- | ------------------------------------------------------------------ |
| 1600 x 1000 reference | fixed sidebar and dense two-column work surfaces                   |
| 1440 x 900 automated  | fixed sidebar, four KPI cards, two-column primary layout           |
| 1280 x 800 review     | fixed sidebar and structurally reduced columns                     |
| 768px boundary        | navigation changes to an explicit drawer                           |
| 390 x 844 automated   | one-column content, closed drawer, full-width controls and actions |

Responsive behavior is structural. Typography does not scale with viewport
width, primary actions do not disappear, and desktop content is not rendered as
a miniature fixed-width canvas.

## Shared Component Contract

- navigation item with icon, Japanese task name, and stable English route name;
- page heading with bounded context, title, summary, and direct-ID lookup;
- summary card with semantic icon, value, and supporting detail;
- surface heading, table, detail list, evidence item, and status badge;
- procedure stepper and form/impact layout;
- approval master/detail layout;
- loading, empty, error, blocked, success, and disabled states.

Lucide icons are used for familiar navigation and state affordances. Icon-only
buttons expose an accessible name and tooltip.

## Verification

The canonical checks are:

```sh
npm run build:web
npm run test:web
npm run test:web:e2e
npm run verify:pre-pr
```

`npm run test:web:e2e` runs Chromium at 1600 x 1000, 1440 x 900, 1280 x 800,
768 x 1024, and 390 x 844. It asserts the five primary screen families, checks
horizontal overflow, and verifies that the tablet/mobile drawer is closed
before visual evidence is accepted.

Repository-owned screenshots and their regeneration command are documented in
[`evidence/p2z-webui/README.md`](evidence/p2z-webui/README.md).

## Acceptance Verdict

The implemented WebUI is **Ready for bounded/non-production visual UAT** against
the P2Z screen contract.

This verdict does not promote:

- HR practical-use readiness;
- production-like readiness;
- real employee data use;
- live provider operation;
- production authorization/RLS;
- legal/privacy approval;
- two-key approval;
- go-live approval.
