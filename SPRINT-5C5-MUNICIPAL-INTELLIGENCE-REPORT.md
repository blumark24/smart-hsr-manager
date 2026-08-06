# Smart HSR — Sprint 5C.5 Municipal Intelligence Layer

## Executive outcome

Sprint 5C.5 adds an isolated, provider-neutral municipal intelligence layer on top of the validated Sprint 5A–5C analysis contract. The layer is advisory-only: it classifies municipal issues, resolves a responsible department, produces an explainable priority recommendation, and records manual multi-issue decisions without writing observations, assigning contractors, changing workflow status, or contacting Firebase/provider services.

Recommendation: **GO** for the next isolated integration-design phase and local UI prototyping. **NO-GO** for Production activation, automatic observation creation, or workflow mutation until a separately reviewed human-approval boundary and persistence authorization are implemented.

## Files created

- `platform/intelligence/municipal-intelligence-contract.js` — canonical departments, response windows, risk indicators, manual multi-issue options, prohibited actions, and output validation.
- `platform/intelligence/municipal-taxonomy.js` — deterministic Arabic municipal taxonomy and treatment metadata.
- `platform/intelligence/explainable-priority-resolver.js` — bounded, deterministic priority score with Arabic reasons.
- `platform/intelligence/municipal-intelligence-engine.js` — validated analysis-to-intelligence mapping, duplicate suppression, issue cap, primary selection, confidence handling, and provenance.
- `platform/intelligence/multi-issue-decision-contract.js` — immutable in-memory manual decision session; explicitly non-persistent and non-executable.
- `test/fixtures/municipal-intelligence-fixtures.js` — 30 synthetic local fixtures.
- `test/sprint5c5-municipal-intelligence.test.js` — 22 deterministic contract and safety tests.
- `SPRINT-5C5-MUNICIPAL-INTELLIGENCE-REPORT.md` — this report.

No existing application file was modified by Sprint 5C.5.

## Contract architecture

### Municipal intelligence input

The engine accepts only a previously validated analysis and explicit tenant/resource context:

```js
{
  analysis,
  organizationId,
  observationId
}
```

It rejects missing context, malformed issue structures, raw prompts, image bytes, provider secrets, and workflow/persistence commands.

### Municipal intelligence output

The output includes:

- stable intelligence, analysis, organization, and observation identifiers;
- detected issues and one explainable primary issue;
- canonical department, service category, subcategory, severity, and response window;
- public-safety, traffic, electrical, fall, structural, environmental, and accessibility indicators where applicable;
- site/power isolation and special-equipment advisory flags;
- taxonomy-owned treatment guidance;
- explainable priority score and Arabic reasons;
- warnings and advisory-only provenance.

Every successful result sets `provenance.advisoryOnly=true` and `provenance.automaticActions=false`.

## Municipal taxonomy

The taxonomy contains 22 unique records, including grouping categories, supported leaf issues, and `UNKNOWN`. The supported operational issue set includes:

- asphalt potholes, road cracking, and ground subsidence;
- leaning/damaged lighting poles and exposed electrical cable;
- fallen palm/tree;
- construction waste and overflowing containers;
- water leakage;
- damaged signs, sidewalks, and traffic barriers;
- visual pollution;
- open manholes;
- abandoned vehicles;
- illegal excavation.

Each record provides an Arabic label, parent category, canonical department, allowed severity range, response window, treatment guidance, risk flags, human-review requirement, and optional power-isolation/special-equipment metadata. Unsupported codes resolve to `UNKNOWN`, `GENERAL_REVIEW`, and manual review rather than being guessed.

## Priority policy

Priority is deterministic and explainable. It starts from severity and applies bounded adjustments for public safety, electrical hazards, traffic impact, critical infrastructure, and multiple interacting issues. Low confidence and poor/unusable evidence reduce certainty and require human review. Unknown severity always returns `UNKNOWN` priority and manual review. The score is clamped to 0–100.

This resolver is a recommendation mechanism, not an SLA enforcement or workflow-transition mechanism.

## Multi-issue policy

- At most five distinct issue codes are retained; excess inputs are truncated with a warning.
- Duplicate issue codes are merged, retaining the highest-confidence representation.
- The primary issue is chosen deterministically from selectable issues by severity, severity score, then confidence.
- Secondary low-confidence issues remain visible with warnings but cannot be selected through the normal selection method.
- Manual options are `CREATE_SINGLE`, `CREATE_MULTIPLE`, `IGNORE_SECONDARY`, and `MANUAL_REVIEW`.
- Selection, ignore, edit, and final-decision operations create immutable in-memory session values.
- Sessions always expose `persisted=false`, `executable=false`, and `automaticObservationCreation=false`.

No observation is created and no user decision is persisted in this sprint.

## Fixture coverage

The local synthetic corpus contains exactly 30 fixtures:

- 17 single-issue cases;
- 6 multi-issue cases;
- 7 edge cases: unclear image, non-municipal input, duplicate issue, low-confidence secondary, department conflict, malformed response, and unsupported category.

The corpus contains no real municipal evidence, image bytes, credentials, remote URLs, or Production data.

## Test results

### Sprint 5C.5 suite

- Tests: 22
- Passed: 22
- Failed: 0
- Skipped/todo: 0

Coverage includes taxonomy uniqueness/Arabic labels, five representative single issues, primary/secondary selection, duplicate suppression, low-confidence handling, department conflict, malformed and unsupported input, priority escalation/reduction, issue cap, immutable manual decisions, prohibited actions, secret/image/prompt rejection, and tenant/resource context.

### Regression suites

Combined Sprint 5A, 5B, 5C, and 5C.5 run:

- Tests: 109
- Passed: 109
- Failed: 0
- Skipped/todo: 0

All seven new JavaScript files passed `node --check`.

## Safety findings

- No Firebase import, Firestore write, Storage write, HTTP transport, provider call, external API call, or image operation exists in the new intelligence modules.
- Tenant and observation identifiers are mandatory inputs and are copied into provenance-bound output.
- Provider-suggested department values cannot override the canonical taxonomy.
- Provider treatment text is not used as the canonical treatment recommendation.
- Workflow and persistence commands are rejected and absent from successful output.
- Raw prompts, image bytes, API/private keys, and bearer material are rejected.
- Results remain human-reviewable and cannot independently create, assign, close, delete, or transition an observation.

## Ambiguities and blockers

1. The taxonomy and response windows are engineering contracts, not yet formally approved municipal policy or SLA definitions.
2. Department routing may vary between municipalities; a future tenant-specific mapping must remain constrained and versioned.
3. Severity ranges do not yet validate every provider severity against the selected taxonomy record; formal policy approval should precede strict enforcement.
4. Multi-issue decisions are intentionally not persisted, so browser refresh/session continuity is out of scope.
5. No application UI integration, authorization integration, or audit-event persistence exists.
6. The 30 fixtures are synthetic contract fixtures, not an accuracy benchmark; they do not establish model precision, recall, or government operational readiness.
7. Human approval and RBAC gates must be designed before any create/update call site can consume these suggestions.

## Recommended next phase

Proceed with **Sprint 5C.6 — Human Review Integration Contract**, still isolated and disabled by default:

1. define a provider-neutral, role-aware approval envelope around intelligence suggestions;
2. define versioned tenant department/SLA mappings without application writes;
3. create local UI adapter contracts for use/edit/ignore/manual decisions;
4. add replay-safe audit-event schemas that exclude image bytes, prompts, and secrets;
5. test that only an explicitly authorized human decision can produce a future persistence request;
6. keep all Firebase/application integration out of scope until the contract and security tests are approved.

### GO criteria

- municipal owner approves taxonomy, Arabic labels, routing, and response windows;
- security approves tenant, RBAC, provenance, and audit schemas;
- every persistence request requires explicit user action and current authorization;
- no AI/provider output can directly execute workflow behavior;
- local and emulator suites remain green.

### NO-GO criteria

- automatic observation creation or workflow mutation is introduced;
- tenant-specific routing can escape organization scope;
- image bytes, prompts, secrets, or provider raw payloads enter audit/persistence records;
- Production Firebase/provider access is required for tests;
- protected application/rules files change without separate authorization and review.

## Final confirmation

Sprint 5C.5 performed no deploy, commit, push, merge, Production connection, external API call, Firebase write, image move/upload/delete/rewrite, or application behavior change. Existing unrelated workspace changes were preserved.
