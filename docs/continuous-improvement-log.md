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
- The earlier zero-job pending runs were superseded by that completed run. The new Liquid-variable validation change below is newer than this successful SHA and still requires its own exact-head CI result.
- PR #18, `feat/variables-yaml-json-editor`, remains open on its own branch. Its latest observed failed run [#39343508885](https://github.com/breizhidentevil/chat-automation/actions/runs/39343508885) used workflow merge SHA `e2f588460d3a622f3f17f013c876ddda1fa03099`, not PR head `4fd7bec8c6823c15c884d1a371fce6e3afb78183`. Do not treat it as proof that the current PR head fails or passes.
- PR #18's parser appears to detect duplicate YAML child keys using indentation rather than parent names, potentially colliding for `personne.prenom` and `adresse.prenom`. A reproduction was reported in the PR discussion; that branch was not modified.
- Local npm commands are unavailable in this execution environment. No local test result is claimed.

## Changes on the autonomous branch

- Reserved dynamic template roots (`system`, `automation`, `chat`, `history`, `logs`, `strategy`, `data`) from custom variable names and added a regression test.
- Hardened strategy recovery with up to eight validated input selectors, a semantic fingerprint, runtime uniqueness/visibility/editability checks, and safe stopping when the saved field cannot be found.
- Added a 30-minute timeout to the main validation/build job and a workflow-security regression test. An over-escaped test regex was corrected in commit `6dda96e781196619ca50f4ef026e912574ef9e0d`.
- Hardened history validation: completion timestamps must be finite and between first-seen and last-updated timestamps; additionally, unfinished messages may not carry a completion timestamp. Legacy complete records without `completedAt` remain accepted for compatibility. Regression tests cover invalid ranges, status/timestamp inconsistency, arrays, invalid origins, and oversized fields.
- Improved Liquid template variable validation: output expressions using filters (for example, `{{ name | capitalize }}`) now participate in variable usage tracking and unknown-variable validation. Missing variables remain intentionally allowed when the expression includes Liquid's `default` filter; a separate plain use of the same missing variable is still rejected. Regression coverage was added, but this latest change has not yet been CI-validated. Dynamic paths retain the same fallback behavior: missing dynamic properties are checked strictly unless their expression has a `default` filter. A regression test covers both cases. The first CI attempt exposed an existing unsafe-filter test that relied on an unknown variable reaching the filter engine; the test now supplies a valid variable so it continues to test filter rejection rather than the earlier validation stage.
- Latest history-validation commits: `901415e5d1897af1eb8d71737686abf711bc548a` (validator) and `a1312fabad29d7442a30c6c21e8b6b964420382a` (tests). The current CI result is not yet verified.

## Next task

1. Check CI for the new Liquid-variable validation commit on the exact current head; repair any failing tests on this branch.
2. Keep PR #20 open until all required checks on the exact current head are complete and successful and merge safety is confirmed.
3. PR #18's parser issue remains outstanding on its own branch. Do not modify that branch; continue independent work only on `autonomous/continuous-improvement`.

## Safety rules

- Work only on `autonomous/continuous-improvement` for autonomous code changes.
- Never force-push, overwrite unrelated work, or commit directly to `main`.
- Never merge when required CI is failing, missing, or unknown.
- Report tests, commits, pushes, and releases only when confirmed by repository evidence.
