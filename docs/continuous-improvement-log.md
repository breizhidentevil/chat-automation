# Continuous improvement log

## Latest confirmed run

- Date: 2026-10-20
- Working branch: `autonomous/continuous-improvement`
- Base branch: `main`
- Baseline version: `5.4.0`
- Main baseline: `7e7d6b0ae253c69e1bfe54d6a5f34bd462ea7f27`
- PR #19 is merged. Its full validation run [#39346725806](https://github.com/breizhidentevil/chat-automation/actions/runs/39346725806) completed successfully, including type-check, unit tests, Chromium smoke test, and Chrome/Firefox/Edge builds.

## Repository and CI findings

- PR #20, `ci: bound validation job runtime`, remains open against `main`.
- The last fully successful run, [#39347745580](https://github.com/breizhidentevil/chat-automation/actions/runs/39347745580), passed on exact SHA `2a0fba6f522269c6554ba479403f8954ccfc0ffb`. It predates the history-validation changes and does not validate them.
- Run [#39348311636](https://github.com/breizhidentevil/chat-automation/actions/runs/39348311636) completed successfully on exact SHA `2198d59621c9377006b13336ec04edabea3e288b`. The validation/build job passed dependency audit, type-check, unit tests, Chromium smoke test, and Chrome/Firefox/Edge builds; release and Pages deployment jobs were skipped as expected for a pull-request run.
- The earlier zero-job pending runs were superseded by that completed run. Run [#39348740327](https://github.com/breizhidentevil/chat-automation/actions/runs/39348740327) completed successfully on exact SHA `6db377e40e0b24727e909cf5a0247c93b052ec72`. Dependency audit, type-check, unit tests, Chromium smoke test, and Chrome/Firefox/Edge builds passed; publishing and Pages deployment were skipped for the pull-request event.
- Run [#39348684340](https://github.com/breizhidentevil/chat-automation/actions/runs/39348684340) failed unit tests on earlier SHA `2663439186fde22f66e5311d21c9ac4ababa4b98` because an unsafe-filter test used an unknown variable, so validation stopped before testing the filter. The fixture was corrected to provide a valid variable. The corrected head passed the full CI run above.
- The roadmap for the conversation simulator was stale: PR #17 was already merged, with successful validation run [#39340728444](https://github.com/breizhidentevil/chat-automation/actions/runs/39340728444). Its status is now corrected.
- Run [#39348946822](https://github.com/breizhidentevil/chat-automation/actions/runs/39348946822) remains in progress against older SHA `976b6a84809084ede1a066ecb3cbaa52bddd6e7b`; it does not validate later changes. Its audit, type-check and unit tests passed, and its Chrome build had been in progress at last check.
- Run [#39349734712](https://github.com/breizhidentevil/chat-automation/actions/runs/39349734712) completed successfully on exact head `0f7bbbbdad5ea9c2e7843a4ecd0bcdb0995f0ab9`. Dependency audit, WXT type generation, TypeScript check, unit tests, Chrome build, Chromium extension smoke test, Firefox MV3 build, Edge build, and package/documentation artifact uploads all passed. Publishing and Pages deployment jobs were skipped as expected for a pull-request event. This validates the diagnostic and variable-definition sanitization changes.
- PR #18, `feat/variables-yaml-json-editor`, remains open on its own branch. Its latest observed failed run [#39343508885](https://github.com/breizhidentevil/chat-automation/actions/runs/39343508885) used workflow merge SHA `e2f588460d3a622f3f17f013c876ddda1fa03099`, not PR head `4fd7bec8c6823c15c884d1a371fce6e3afb78183`. Do not treat it as proof that the current PR head fails or passes.
- PR #18's parser appears to detect duplicate YAML child keys using indentation rather than parent names, potentially colliding for `personne.prenom` and `adresse.prenom`. A reproduction was reported in the PR discussion; that branch was not modified.
- Local npm commands are unavailable in this execution environment. No local test result is claimed.

## Changes on the autonomous branch

- Reserved dynamic template roots (`system`, `automation`, `chat`, `history`, `logs`, `strategy`, `data`) from custom variable names and added a regression test.
- Hardened strategy recovery with up to eight validated input selectors, a semantic fingerprint, runtime uniqueness/visibility/editability checks, and safe stopping when the saved field cannot be found.
- Added a 30-minute timeout to the main validation/build job and a workflow-security regression test. An over-escaped test regex was corrected in commit `6dda96e781196619ca50f4ef026e912574ef9e0d`.
- Hardened history validation: completion timestamps must be finite and between first-seen and last-updated timestamps; additionally, unfinished messages may not carry a completion timestamp. Legacy complete records without `completedAt` remain accepted for compatibility. Regression tests cover invalid ranges, status/timestamp inconsistency, arrays, invalid origins, and oversized fields.
- Improved Liquid template variable validation: output expressions using filters (for example, `{{ name | capitalize }}`) now participate in variable usage tracking and unknown-variable validation. Missing variables remain intentionally allowed when the expression includes Liquid's `default` filter; a separate plain use of the same missing variable is still rejected. Regression coverage covers both behaviors. Dynamic paths retain the same fallback behavior: missing dynamic properties are checked strictly unless their expression has a `default` filter. A regression test covers both cases. The first CI attempt exposed an existing unsafe-filter test that relied on an unknown variable reaching the filter engine; the fixture was corrected to test filter rejection directly. The corrected code and tests passed run #39348740327. Dynamic paths retain the same fallback behavior: missing dynamic properties are checked strictly unless their expression has a `default` filter. A regression test covers both cases. The first CI attempt exposed an existing unsafe-filter test that relied on an unknown variable reaching the filter engine; the test now supplies a valid variable so it continues to test filter rejection rather than the earlier validation stage.
- Latest history-validation commits: `901415e5d1897af1eb8d71737686abf711bc548a` (validator) and `a1312fabad29d7442a30c6c21e8b6b964420382a` (tests).
- Hardened diagnostic event validation to reject array containers and whitespace-only `site`/`event` values, which are malformed despite being truthy/non-empty strings. Regression tests cover plain arrays, arrays with event-like properties, and whitespace-only identifiers. Commits: `c3eb7f7fb872472ad04714b8562173516f973999` (validator), `f26317f70d3f78dc98396d6842f1889586495d7a` (tests), `7eedd17e5a56c259abb1b82e276748092805fcef` (fixture correction), `c81fbe4af5c4057221f8e6c87c43018eba5d8e10` (escape correction).
- Optimized `limitDiagnosticEvents` to scan from newest to oldest and stop once the 500-event or aggregate text budget is reached, avoiding a full-array `filter()` and intermediate allocation on oversized histories. Added a regression test asserting that a 2,000-event history requires only 500 indexed reads while retaining the newest 500 entries. Commits: `11ba47551797dafbb7da31aa4f9f18312099b6ae` (optimization), `753390cbad60f8580b7e50a860f3aace15318c56` (test), `6625a8cb6b16a864f486cc634160e38506bc2395` (test fixture correction).
- Hardened diagnostic history persistence against untrusted extra properties: `limitDiagnosticEvents` now reconstructs accepted records from the declared schema before returning them, so arbitrary fields cannot evade the aggregate character estimate or persist into the diagnostic log. Added a regression test with a 2 MB unknown property and verified the output contains only the schema fields. Commits: `a7d25d320adc1d2747d8a6f9c4039faffd11442c` (sanitization), `e3dfcb072fa9a4dfbcf26586672badbc6f3303bb` (regression test). Exact-head CI is pending; no local npm result is claimed.
- Applied schema allowlisting to `filterValidVariableDefinitions`: accepted records are reconstructed from `id`, `name`, `type`, `value`, `scope`, and `updatedAt`; a 2 MB injected property is discarded. Commits: `ff221bcc44c8ecc5f38f6f2a484a8440205f3c28` (sanitization), `e22507b7d3502d8d563f97e5312bc81a398eee9d` (regression test). Exact-head validation succeeded in run #39349734712. A follow-up hardening now rejects arrays masquerading as variable-definition objects and adds regression coverage; awaiting CI on the new head.

## Next task

1. Verify the Actions run for the latest branch head after both diagnostic and variable-definition schema sanitization, including unit tests, Chromium smoke test, and all browser builds. Run #39349701692 was pending with zero visible jobs at last check.
2. Keep PR #20 open until all required checks on the exact current head are complete and successful and merge safety is confirmed.
3. Review variable schema validation for remaining malformed object shapes. Arrays are now explicitly rejected even if JavaScript code attaches definition-like properties; regression test added. This change needs its own exact-head CI run.
4. PR #18's YAML duplicate-key issue remains outstanding on its own branch. Do not modify that branch; continue independent work only on `autonomous/continuous-improvement`.

## Safety rules

- Work only on `autonomous/continuous-improvement` for autonomous code changes.
- Never force-push, overwrite unrelated work, or commit directly to `main`.
- Never merge when required CI is failing, missing, or unknown.
- Report tests, commits, pushes, and releases only when confirmed by repository evidence.

## Roadmap and iteration tracking — 2026-10-20

- Added `docs/roadmap.md` with ten improvement axes, priorities P0–P3, development principles, and iteration completion criteria.
- Updated `CHANGELOG.md` to record the roadmap addition and establish it as the summary of delivered changes per iteration.
- Future iterations must update the changelog and add technical context, decisions, commit references, and exact-head validation outcomes here as appropriate.
- Documentation-only changes in this entry have not been described as tested code; no test or CI result is claimed for them.

## Defensive automation configuration validation — 2026-10-20

- Finding: `validateAutomationConfig` normalized its typed draft before validating its runtime shape. Malformed values from an unexpected caller could throw during `.map()`, or an unknown unit could be silently interpreted as seconds.
- Change: added a shape guard before normalization for message arrays and elements, interval/repeat strings, supported units, boolean time-window flag, clock strings, and variable arrays. Invalid input returns the existing `invalidSettings` diagnostic.
- Regression coverage: tests exercise unknown units, non-boolean flags, null/non-array messages, non-string message entries, sparse arrays, and null variables. An additional review caught that `Array.prototype.every` skips sparse slots; the guard now materializes the array before checking every entry.
- Commits: `5d0c116d97bb42ed83c68e99c886f45f99e025f9` (guard), `08753fc2ad9c837455bb8ff5d5852e16d7d4231e` (tests), `f7865873a6e499c8e96cef0c5baf27157301a3cd` (changelog).
- Validation: changes are committed on `autonomous/continuous-improvement`. Local npm execution is unavailable in this environment; CI status for the latest head must be confirmed before considering the iteration fully validated. No merge to `main` was performed.

## Defensive automation variable validation — 2026-10-20

- Finding: the automation draft shape guard accepted any array as `variables`. Invalid definitions were silently ignored by template validation, while accepted objects could carry unknown, potentially large properties into the runtime payload.
- Change: configuration validation now rejects variable collections whose entries fail the existing schema, uniqueness, count, or aggregate-size filters. Normalization reconstructs accepted variable definitions using the allowlisted fields before creating the runtime payload.
- Regression coverage: invalid definition values, sparse variable arrays, and a valid definition carrying a 2 MB unexpected property. The latter must remain valid while the extra property is absent from normalized configuration and payload.
- Commits: `2c9cfbea6ddd32d92330775e26b5bbed7440fdd4` (validator), `50d53893ddc94002307a408432e888ba18b246cd` (tests), `adbc29d6271bd10b0e1c5e746ee802d3948fa648` (changelog).
- Validation: local npm execution is unavailable in this environment. CI must be checked against the exact latest branch head; no test success or merge is claimed.

- Follow-up hardening: reject variable arrays over `MAX_VARIABLE_DEFINITIONS` before scanning their contents, bounding validation work for oversized untrusted collections. Added a 101-definition regression case. Commits: `db96a10b9d1ae3c95264c5feb7ba0138f027d0e0` (bound), `ba0b1264b9197bc41b898e80d4f7e8372211b7c8` (test).

## Defensive site-procedure validation — 2026-10-20

- Finding: procedure validation accepted array objects with attached properties, including nested send strategies and input profiles. Valid procedure records were also copied to extension storage with arbitrary extra properties intact.
- Change: reject arrays at all three object boundaries and add `sanitizeChatSiteProcedure`, which reconstructs validated records and nested objects from allowlisted fields. Both stored records loaded from storage and new writes now use sanitized copies.
- Regression coverage: root and nested array impostors, plus a 2 MB injected property and extra nested properties that must not survive persistence.
- This follow-up is committed separately from the variable-validation iteration; exact-head CI is required before considering it validated. No merge to `main`.

- Review follow-up: fallback-selector validation used `Array.prototype.every`, which skips sparse slots. It now materializes the bounded selector array before checking each entry; a sparse-selector regression test was added. CI for the resulting head remains required.
