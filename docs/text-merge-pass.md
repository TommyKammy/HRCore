# Text-Merge Pass Procedure

This procedure defines how HRCore planning and design notes are prepared for
the later text-merge pass. It is a repository-owned procedure only: #82
performs the actual document-body merge work. This issue must not edit Obsidian
planning or design note bodies.

## Authority Order

Use this authority order when planning notes, generated documents, issue text,
repository documents, ADRs, and implementation reality disagree:

1. executable code and tests are authoritative for observed runtime behavior.
2. Accepted ADRs are authoritative for durable decisions and policy.
3. Repository process docs define repository workflow and review procedure.
4. Obsidian planning notes provide project context for future documentation
   edits.
5. issue bodies define scoped work requests and acceptance evidence, but they do
   not override Accepted ADRs or repository process docs.
6. Generated notes, old review comments, and summaries are locator context only.

Accepted ADRs take precedence over conflicting planning text. When an Obsidian
body, generated note, issue body, or trailing review note conflicts with an
Accepted ADR, the #82 pass must repair the conflict or record an explicit
follow-up with the conflicting source, the ADR number, the owner, and the reason
the repair was deferred. Do not leave ADR-conflicting body text as parallel
truth.

When executable behavior and an Accepted ADR disagree, treat the result as
drift. Record the observed behavior, keep the ADR as the policy source until a
newer Accepted ADR supersedes it, and stop if the repair would require a new
legal, privacy, security, Future Extension schema, irreversible schema, or
Phase 1 HR workflow decision.

## Conflict Handling

For each note reviewed during #82, start from the body text and compare it
against Accepted ADRs, repository process docs, current executable behavior, and
the relevant issue or planning evidence. Resolve conflicts by applying the
highest-authority source first.

Required outcomes are:

- repair stale body text when the higher-authority source is clear;
- replace ambiguous or superseded claims with a stable ADR or repository
  document reference;
- record an explicit follow-up when the safe repair cannot be completed in the
  pass;
- stop instead of guessing when the conflict exposes a missing owner, missing
  two-key evidence, or a new decision outside the authorized scope.

Issue bodies and generated notes may explain why a change is requested, but they
must not be used to override ADR 0000, ADR 0004, run-mode governance, the Child
Issue Review Checklist, Epic completion review, branch protection, current-head
Codex review, or unresolved review-thread handling.

## Trailing Corrections

Trailing correction and review sections are temporary reconciliation surfaces,
not independent durable truth. During #82, each trailing correction or review
section must be handled by one of these outcomes:

- merge validated content into the relevant body text;
- replace the trailing block with a stable ADR or repository-document reference;
- defer the item with an explicit follow-up when the safe merge requires a
  missing decision, owner, or approval.

Do not leave stale correction blocks as appendices when their validated content
can be merged into the body or replaced by stable ADR/document references.
After the pass, the remaining tail section, if any, must contain only explicit
deferments with owners and authority references.

## Initial #82 Targets

The initial target document classes for #82 are:

- concept and scope notes;
- ER and data-model notes;
- DDL and schema notes;
- API and OpenAPI notes;
- field catalog notes;
- automation and supervisor strategy notes;
- governance and review notes;
- Future Extension architecture notes.

The pass may defer individual notes when the required owner, ADR, or approval is
missing. Deferment must be recorded as evidence, not hidden by a summary saying
the class is complete.

## Closeout Evidence

For each updated note in #82, record closeout evidence with:

- source note path;
- decision/source authority used;
- change summary;
- unresolved follow-ups;
- whether human approval is needed.

When an item is deferred, include the owner or required decision, the source
note path, the blocking authority conflict or missing evidence, and the next
issue or review action needed before it can be merged safely.

Progress reporting for #82 should group completed, deferred, and stopped items
by target document class. It must call out ADR conflicts, trailing correction
outcomes, and any document class that was intentionally not touched in the pass.

## Stop Conditions

Stop the text-merge pass instead of editing a note when the work would require:

- a new legal, privacy, or security decision;
- a new Future Extension architecture or Future Extension schema decision;
- a new DDL/schema decision that changes durable data shape;
- an unresolved ADR conflict;
- a missing owner or evidence for a two-key decision;
- any change that would implement Phase 1 HR workflow scope;
- provider mocks, LocalStack or development AWS decisions, cost dashboard
  enforcement, a policy-as-code engine, production secrets, external services,
  GitHub branch-protection setting changes, or runtime controls outside the
  issue scope.

ADR 0000 controls two-key handling. When the need for two-key handling is
unclear, fail closed, record the blocker, and leave the content unchanged until
the required owner and evidence exist.

ADR 0004 controls cost-cap and automatic stop conditions. Repeated failed
verification, repeated same blockers, review-thread stalls, unexpected external
service dependencies, credential requirements, or suspicious scope expansion
must be recorded as blockers instead of being worked around by broadening the
merge.

Run-mode governance controls who may execute or approve the work. A
`run-mode/*` label does not weaken ADR 0000, ADR 0004, branch protection,
current-head Codex review, unresolved review-thread handling, or local
verification.

The Child Issue Review Checklist is the per-PR closeout surface for child
issues. It must confirm acceptance coverage, local verification, closeout
evidence, unresolved follow-ups, scope creep checks, run-mode consistency, ADR
0000 two-key handling, and Epic completion review separation.

Epic completion review consumes child closeout evidence after child issues
finish. Child closure is evidence, not automatic Epic acceptance.
