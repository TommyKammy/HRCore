# Text-Merge Pass Closeout

Issue: #82
Run mode: `hybrid` (agent drafts; human approval is required before treating the Obsidian edits as accepted)
Obsidian vault path: `<ObsidianVault>/Dev/HRCore`
Repository procedure: [Text-Merge Pass Procedure](text-merge-pass.md)

Required evidence fields recorded below: source note path, decision/source authority used, change summary, unresolved follow-ups, and whether human approval is needed.

## Authority Used

- Executable code/tests for observed behavior: current repo seed, OpenAPI source, and local verification.
- Accepted ADRs: ADR 0000, ADR 0001, ADR 0002, ADR 0003, ADR 0004.
- Repository process docs: `docs/run-modes.md`, `docs/branch-protection.md`, `docs/epic-completion-review.md`, `docs/text-merge-pass.md`.
- Obsidian planning notes: project context and document-body targets.
- Review notes and issue text: locator context only.

## Completed Items

### Concept and scope

| Source note path                       | Decision/source authority used           | Change summary                                                                                                                                                                                                                      | Unresolved follow-ups                                                                                          | Human approval needed |
| -------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------- |
| `01_企画・構想/01_システム化構想書.md` | ADR 0001, ADR 0004, text-merge procedure | Replaced backend stack alternatives with Fastify + Drizzle and folded the old stack-freeze correction into the body as an ADR 0001 reference. Replaced AWS dev-substitution correction with an explicit gate instead of a decision. | Provider mock policy and LocalStack/dev AWS account decision remain in #60/#61-class follow-up scope.          | Yes                   |
| `01_企画・構想/04_スコープ定義.md`     | ADR 0000, ADR 0003, run-mode governance  | Renamed trailing correction blocks into body sections for MVP-A boundary, legal/labor/privacy scope, and Future Extension direction. Added ADR 0000 / ADR 0003 precedence and kept sensitive decisions as gates.                    | Legal/privacy/security and Future Extension schema decisions remain deferred to dedicated ADR/decision issues. | Yes                   |

### Governance and stakeholder

| Source note path                                   | Decision/source authority used                                                        | Change summary                                                                                                                                                                                           | Unresolved follow-ups                                                                                                             | Human approval needed |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `01_企画・構想/05_ステークホルダー・ガバナンス.md` | ADR 0000, ADR 0002, ADR 0003, ADR 0004, run-mode governance, branch-protection policy | Replaced review-note source authority with repository docs and ADR references. Kept responsibility boundaries, run-mode taxonomy, two-key examples, and self-review controls aligned to repo-owned docs. | Security, privacy, audit, data-scope, and branch-protection operator changes still require their own decision or operator action. | Yes                   |

### Architecture and automation

| Source note path                                 | Decision/source authority used           | Change summary                                                                                                            | Unresolved follow-ups                                                                                                     | Human approval needed |
| ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `02_アーキテクチャ/06_概念アーキテクチャ.md`     | ADR 0000, ADR 0003, ADR 0004             | Added ADR 0003 as the core stability source and converted AWS component substitution into a development-environment gate. | LocalStack/dev AWS and provider mock policy remain deferred; no runtime control or external service dependency was added. | Yes                   |
| `02_アーキテクチャ/19_Automation・AI拡張戦略.md` | ADR 0000, ADR 0004, text-merge procedure | Merged job failure-mode content into v1 acceptance criteria and converted AI handling into a normal body section.         | Concrete job locking, replay authority, and AI privacy/ethics rules remain future implementation/ADR work.                | Yes                   |

### ER and data model

| Source note path            | Decision/source authority used | Change summary                                                                                                                                                                            | Unresolved follow-ups                                                                                      | Human approval needed |
| --------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------- |
| `04_データ・API/10_ER案.md` | ADR 0000, ADR 0002, ADR 0003   | Folded DB-constraint and PII/audit/Future Extension correction text into body sections. Replaced migration-number example with ADR 0003 core `0001-0099` and extension `0200+` authority. | Break-glass, data-scope DSL/RLS, audit immutability, and Future Extension table semantics remain deferred. | Yes                   |

### Field catalog

| Source note path                          | Decision/source authority used | Change summary                                                                                            | Unresolved follow-ups                                                                                                                   | Human approval needed |
| ----------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `04_データ・API/13_フィールドカタログ.md` | ADR 0000, ADR 0002, ADR 0003   | Converted PII/legal correction into a field-catalog gate and pointed core stability metadata to ADR 0003. | Legal/privacy field classes, masking, export roles, retention policy, and prohibited payload rules remain deferred to dedicated issues. | Yes                   |

### API and OpenAPI

| Source note path               | Decision/source authority used                          | Change summary                                                                                                                                                     | Unresolved follow-ups                                                                                                          | Human approval needed |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `04_データ・API/16_API一覧.md` | Executable OpenAPI source, ADR 0000, ADR 0002, ADR 0003 | Added OpenAPI/repo-source authority text before the OpenAPI backlog and clarified AI / Assistant APIs are v1.5+ design candidates, not MVP-A implementation scope. | Error-code, filter DSL, read-model shape, break-glass API separation, and raw/CSV/audit permissions remain future design work. | Yes                   |

### DDL and schema

| Source note path                              | Decision/source authority used | Change summary                                                                                                                                                                                          | Unresolved follow-ups                                                                      | Human approval needed |
| --------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------- |
| `04_データ・API/17_PostgreSQL DDLたたき台.md` | ADR 0000, ADR 0002, ADR 0003   | Replaced warning-style DDL correction with body text about migration waves and ADR 0003 numbering. Added explicit non-decision text for data-scope authorization and irreversible migration boundaries. | Durable DDL/schema decisions, RLS/DSL choice, and Future Extension schema remain deferred. | Yes                   |

### Execution planning

| Source note path                                   | Decision/source authority used                                                   | Change summary                                                                                                                 | Unresolved follow-ups                                                                                        | Human approval needed |
| -------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------- |
| `05_実行計画/07_プロジェクト計画・ロードマップ.md` | ADR 0000-0004, run-mode governance, text-merge procedure, epic-completion review | Folded review-gated MVP warning into the body and renamed the Phase 2 correction heading to a normal Review-Gated MVP section. | Legal/security/Future Extension/provider/AWS gate issues remain open until their own ADRs or decisions land. | Yes                   |
| `05_実行計画/15_GitHub Issues案.md`                | Run-mode governance, text-merge procedure, epic-completion review, Accepted ADRs | Converted the review-gated issue-plan warning into body text and added repo-owned governance/ADR authority references.         | Existing issue metadata still has to be kept in sync by future issue-maintenance work.                       | Yes                   |

### Review and governance source notes

| Source note path                                                    | Decision/source authority used            | Change summary                                                                                                                     | Unresolved follow-ups                                                        | Human approval needed |
| ------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------- |
| `06_レビュー・評価/2026-05-16 AI実装統制 最終評価.md`               | ADR 0000-0004 and repository process docs | Reviewed as locator/source context only; not edited because review notes are not durable body truth.                               | None for this pass. Future updates should go into ADRs or repo process docs. | No                    |
| `06_レビュー・評価/2026-05-16 Codex Supervisor 前提レビュー補正.md` | ADR 0000-0004 and repository process docs | Reviewed as locator/source context only; not edited because its validated points were already merged into body notes or repo docs. | None for this pass.                                                          | No                    |
| `06_レビュー・評価/2026-05-16 Claude Opus 4.7 設計レビュー v4.md`   | ADR 0000-0004 and repository process docs | Reviewed as convergence/source context only; not edited because it is historical review evidence.                                  | None for this pass.                                                          | No                    |

### Progress notes

| Source note path                           | Decision/source authority used               | Change summary                                                                            | Unresolved follow-ups                              | Human approval needed |
| ------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------- |
| `07_進行管理/00_進行管理 Home.md`          | GitHub issue #82, text-merge procedure       | Updated to point at the #82 text-merge closeout as the current closeout evidence surface. | PR link is pending until this branch is published. | Yes                   |
| `07_進行管理/01_Phase0_企画・実装準備.md`  | GitHub issue #82, text-merge procedure       | Updated the #82 row from selected/runnable to draft complete pending PR/human approval.   | PR link and final verification result are pending. | Yes                   |
| `07_進行管理/09_GitHub Issues 起票台帳.md` | GitHub issue #82                             | Updated #82 registry status to draft complete pending PR/human approval.                  | PR link is pending.                                | Yes                   |
| `07_進行管理/10_開発履歴.md`               | GitHub issue #82, repository closeout report | Added a concise text-merge-pass history entry pointing to this closeout report.           | PR link and final verification result are pending. | Yes                   |

## Deferred or stopped items

| Target class                                | Source note path                                                                                                                                                                                        | Blocking authority conflict or missing evidence                                                                   | Owner or required decision                                                              | Next action                                                                                                                         | Human approval needed |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Legal/privacy/security                      | `01_企画・構想/04_スコープ定義.md`, `04_データ・API/10_ER案.md`, `04_データ・API/13_フィールドカタログ.md`                                                                                              | ADR 0000 classifies unclear legal/privacy/security changes as fail-closed two-key candidates.                     | Maintainer/legal/privacy/security decision owner through dedicated ADR/decision issues. | Decide My Number/APPI/DSAR/sensitive personal information/masking/export/retention scope in follow-up issues before implementation. | Yes                   |
| Break-glass, data scope, audit immutability | `01_企画・構想/05_ステークホルダー・ガバナンス.md`, `04_データ・API/10_ER案.md`, `04_データ・API/17_PostgreSQL DDLたたき台.md`                                                                          | Security, authorization, auditability, and data-scope boundaries require explicit accepted decisions.             | Maintainer/security/architecture owner through R06-class issues.                        | Decide break-glass, DSL/RLS/hybrid, audit hash/WORM/external transfer, and self-approval enforcement before coding.                 | Yes                   |
| Future Extension architecture/schema        | `01_企画・構想/04_スコープ定義.md`, `02_アーキテクチャ/06_概念アーキテクチャ.md`, `04_データ・API/10_ER案.md`, `04_データ・API/13_フィールドカタログ.md`, `04_データ・API/17_PostgreSQL DDLたたき台.md` | #82 cannot make new Future Extension architecture/schema decisions.                                               | Future Extension ADR owners through #83-#88-class issues.                               | Use ADR 0003 stability contract now; decide concrete extension anchors and payload prohibitions later.                              | Yes                   |
| Provider mocks and LocalStack/dev AWS       | `01_企画・構想/01_システム化構想書.md`, `02_アーキテクチャ/06_概念アーキテクチャ.md`, `05_実行計画/07_プロジェクト計画・ロードマップ.md`                                                                | #82 cannot decide provider mocks, LocalStack/dev AWS, external services, production secrets, or runtime controls. | Maintainer/operator/architecture owner through #60/#61-class issues.                    | Keep as execution gate before provider/job/migration implementation issues.                                                         | Yes                   |
| Durable DDL/schema decisions                | `04_データ・API/10_ER案.md`, `04_データ・API/17_PostgreSQL DDLたたき台.md`                                                                                                                              | New irreversible schema shape is outside #82.                                                                     | Architecture/data owner through schema/ADR/migration issues.                            | Use ADR 0003 constraints and defer concrete DDL choices to migration wave issues.                                                   | Yes                   |

## Verification Evidence

- Focused reproduction before implementation: `npm test -- --test-name-pattern="text-merge pass closeout"` failed with `ENOENT` for `docs/text-merge-pass-closeout.md`.
- Repository guard coverage updated: `src/repository-guards.test.ts` now requires this closeout report and the target document classes.
- Final local verification command and result: `npm run verify:pre-pr` passed on 2026-05-17. It ran build, tests, Prettier check, audit, and Drizzle check successfully.

## Scope Guard

This pass did not add product code, legal/privacy policy, security controls, Future Extension schema decisions, provider mocks, LocalStack/dev AWS decisions, cost dashboard enforcement, a policy-as-code engine, production secrets, external service dependencies, GitHub branch-protection setting changes, or Phase 1 HR workflows.
