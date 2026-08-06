# Smart HSR — Sprint 5D Inspector Human Review Preview

## Executive result

Sprint 5D introduces a compact, Preview-only human-review surface inside the inspector observation window. It uses deterministic local fixture intelligence, is disabled by default, fails closed outside localhost/approved `.preview.local` hosts, and remains fully separated from observation persistence and workflow behavior.

Recommendation: **GO for isolated local/Preview usability review**. **NO-GO for Production, real-provider activation, or persistence of AI provenance/suggestions**.

## Files created

- `platform/ai/inspector-human-review-state.js` — immutable provider-neutral UI state contract.
- `platform/config/inspector-ai-preview-flag.js` — fail-closed Preview feature flag.
- `platform/ai/inspector-human-review-preview-service.js` — local fixture-to-Municipal Intelligence Engine bridge.
- `preview-only/inspector-human-review-preview.js` — browser controller and deterministic local preview adapter.
- `test/sprint5d-inspector-human-review.test.js` — 16 deterministic tests.
- `test/check-dashboard-module-syntax.js` — in-memory module syntax check.
- `test/browser/sprint5d-inspector-preview-smoke.html` — isolated localhost browser smoke harness.
- `SPRINT-5D-INSPECTOR-HUMAN-REVIEW-REPORT.md` — this report.

## Application file changed

Only `dashboard.html` was changed by Sprint 5D. Existing unrelated changes in `.gitignore` and `manager.html` predated this sprint and were preserved.

Sprint 5D dashboard changes after final line numbering:

- lines 633–641: scoped compact/responsive Preview styles;
- lines 2546–2556: inline description suggestion panel directly below the description textarea;
- lines 2563–2580: primary GPS action plus secondary manual-location drawer;
- lines 2597–2597: single secondary `تحليل ذكي` action near image selection;
- line 2780: Preview-only browser controller load;
- lines 4072–4082: explicit manual-location bridge; it does not write and requires the normal save action later;
- lines 4902–4908: fail-closed controller initialization.

No change was made to `manager.html`, `mobile-map.html`, `owner.html`, `storage-adapter.js`, `spatial-map.js`, Firebase configuration, or Firestore rules during Sprint 5D.

## Existing inspector modal audit

- Modal and step-one entry: `dashboard.html` lines 2533–2611.
- Description input: line 2544.
- Location status, hidden coordinates, GPS action, and recovery controls: lines 2559–2585.
- Image input and selection: lines 2589–2597; handler at lines 4246–4262.
- Existing primary process/save action: lines 2603–2606.
- Modal open/reset path: lines 4468 onward.
- GPS capture and current manual-map recovery: lines 3838–4210; `getLocation` at line 4084 and existing manual-map handler at line 4107.
- Input readiness gate: lines 4215–4244.
- Existing combined “smart input” processing: line 4265 onward.
- Image compression/upload occurs before payload construction in that existing path.
- Existing payload classification and priority are fixed presentation values (`MAINTENANCE`, `High`, `48 hours`); there are no separate category/subcategory/priority controls in step one.
- Firestore write function: line 3477.
- Persistence boundary: `commitPendingSmartInput` at line 4371.

The existing `processSmartInput` path combines upload, fixed generated presentation text, payload creation, and persistence. Sprint 5D does not reuse that function for AI suggestions and does not call it from the Preview controller.

## Human Review state contract

The isolated state includes:

```js
{
  mode,
  analysisStatus,
  suggestion,
  intelligence,
  selectedIssues,
  descriptionDraft,
  categoryDraft,
  subcategoryDraft,
  priorityDraft,
  locationDraft,
  provenance,
  error,
  warnings
}
```

Supported modes are `MANUAL`, `ANALYZING`, `SUGGESTION_READY`, `EDITING_AI_SUGGESTION`, `AI_ACCEPTED`, `AI_IGNORED`, and `ERROR`. Every state remains `persisted=false` and `executable=false`.

## Feature flag

`INSPECTOR_AI_SUGGESTIONS_PREVIEW` behavior:

- disabled when no explicit override exists;
- enabled only with `?inspectorAiPreview=1`;
- allowed only on `localhost`, `127.0.0.1`, `::1`, or an explicit `.preview.local` hostname;
- local/mock mode only;
- no remote config, key, provider, or network transport;
- unknown/Production hostname denied.

Normal page load therefore remains legacy/manual-only. The Preview script may be present but its UI and actions stay hidden and inactive.

## Compact UI behavior

### Description suggestion

- The small AI action remains disabled until a valid selected image exists.
- Local analysis shows the Arabic summary immediately below the description input.
- `استخدام` copies the suggestion into the editable description.
- `تعديل` copies it, marks AI-assisted editing, and focuses the textarea.
- `تجاهل` hides the suggestion and preserves manual text.
- Existing manual text triggers explicit replacement confirmation.
- None of these actions calls save, upload, Firestore, or observation creation.

### Advisory chips

Compact chips show category, subcategory, priority, confidence, image quality, and department. Category/subcategory/priority each provide a small Apply action that changes Preview draft state only. Nothing is automatically applied to the observation payload. Provider and model names are never rendered. Low confidence shows an Arabic manual-review warning.

### Multiple issues

- Maximum three issues are rendered.
- Low-confidence secondary issues are not selected by default.
- Arabic choices map to `CREATE_SINGLE`, `CREATE_MULTIPLE`, `IGNORE_SECONDARY`, and `MANUAL_REVIEW`.
- The decision exists only in local UI provenance.
- No form splitting or observation creation occurs.

### Location

The existing primary GPS behavior remains the primary action. Preview adds one visually secondary `إدخال يدوي` button beside it. Its compact inline drawer supports district, street, nearby landmark, latitude, and longitude. Invalid coordinates fail closed. Existing GPS coordinates cannot be replaced without explicit confirmation. Confirming the local draft only updates the existing form location state; persistence still requires the unchanged normal submit path. No geocoding or map request is introduced.

## Local provenance

The state tracks:

```js
{
  descriptionSource: "MANUAL" | "AI_ASSISTED",
  aiSuggestionUsed,
  aiSuggestionEdited,
  analysisId,
  selectedIssueIds,
  multiIssueDecision
}
```

This provenance is not written to Firestore and introduces no schema field or migration.

## Accessibility and responsive checks

- Existing Arabic RTL hierarchy is preserved.
- Controls use native buttons, labels, inputs, and select elements.
- No hover-only interaction is required.
- Focus remains available through existing `focus-visible` rules; Edit explicitly focuses the textarea.
- Small-screen CSS collapses manual-location fields to one column and allows action wrapping.
- Browser smoke at 390×844 reported `scrollWidth=390`, `clientWidth=390`, and no horizontal overflow.
- No full-screen modal or design-system replacement was introduced.

## Tests and checks

### Sprint 5D

- 16 tests passed, 0 failed, 0 skipped/todo.
- Covers default-off/Production denial/local activation, manual mode, image requirement, Municipal Intelligence Engine bridge, Use/Edit/Ignore, replacement confirmation, advisory draft Apply, low-confidence multi-issue selection, manual location confirmation, application structure, persistence separation, and sensitive-data absence.

### Regression

Combined Sprint 5A, 5B, 5C, 5C.5, and 5D:

- 125 passed;
- 0 failed;
- 0 skipped/todo.

### Browser/local smoke

The isolated localhost harness returned `PASS` with:

- explicit flag enabled;
- Preview root visible;
- analyze action visible;
- manual-location action visible;
- no browser console errors;
- no network call marker;
- no horizontal overflow at mobile width.

### Additional checks

- New JavaScript files passed `node --check`.
- The main `dashboard.html` ES module passed in-memory `vm.SourceTextModule` syntax parsing.
- `git diff --check` passed; only existing line-ending warnings were emitted.
- Credential scan found no credential values in Sprint 5D files; the only matches are negative-test literals.
- Network/mutation scan found no `fetch`, XHR, Axios, Firestore write, assignment, or workflow command in the Preview controller/service.

## Safety confirmation

- Feature disabled by default.
- No real provider enabled or called.
- No external API call.
- No Firebase Production connection was initiated during implementation or testing.
- Analysis triggers no Firestore write, upload, assignment, status transition, save, or observation creation.
- No image bytes, raw prompt, credentials, provider name, or model name enter Preview state.
- No Firebase config or rule changed.
- No deploy, commit, push, merge, reset, or workspace cleanup occurred.

## Rollback

1. Remove the controller initialization at `dashboard.html` lines 4902–4908.
2. Remove the Preview script include at line 2780.
3. Remove the scoped Preview markup/styles and manual-location bridge.
4. Delete the isolated Sprint 5D modules/tests/report.

Because the normal save/persistence function was not integrated with Preview analysis, rollback requires no data migration or Firebase action.

## Remaining blockers

1. The current step-one form has no canonical category/subcategory/priority controls; chips therefore update local Preview drafts only.
2. Browser integration uses deterministic local fixture classification; no model accuracy claim is possible.
3. Tenant-approved Arabic taxonomy, department routing, SLA windows, and priority policy still require municipal-owner sign-off.
4. Persisting provenance requires a separate schema, RBAC, rules, privacy, and audit review.
5. The legacy `processSmartInput` still mixes presentation text, image upload, fixed classification/priority, payload creation, and persistence; it must not become an AI integration boundary without a separately approved refactor.

## GO / NO-GO

**GO** for local/Preview inspector usability testing with synthetic images and explicit query activation.

**NO-GO** for Production deployment, real AI activation, automatic application of suggestions, provenance persistence, or reuse of the existing mixed save flow as an AI action.
