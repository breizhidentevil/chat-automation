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
- Runs for the later history-validation commits have not produced usable checks yet. At the latest inspection, run [#39348163079](https://github.com/breizhidentevil/chat-automation/actions/runs/39348163079) was stuck pending with zero jobs returned by the GitHub Actions API. This is a CI/queue observability blocker, not evidence of a code failure or success. Check the newest run and exact head before any merge.
- PR #18, `feat/variables-yaml-json-editor`, remains open on its own branch. Its latest observed failed run [#39343508885](https://github.com/breizhidentevil/chat-automation/actions/runs/39343508885) used workflow merge SHA `e2f588460d3a622f3f17f013c876ddda1fa03099`, not PR head `4fd7bec8c6823c15c884d1a371fce6e3afb78183`. Do not treat it as proof that the current PR head fails or passes.
- PR #18's parser appears to detect duplicate YAML child keys using indentation rather than parent names, potentially colliding for `personne.prenom` and `adresse.prenom`. A reproduction was reported in the PR discussion; that branch was not modified.
- Local npm commands are unavailable in this execution environment. No local test result is claimed.

## Changes on the autonomous branch

- Reserved dynamic template roots (`system`, `automation`, `chat`, `history`, `logs`, `strategy`, `data`) from custom variable names and added a regression test.
- Hardened strategy recovery with up to eight validated input selectors, a semantic fingerprint, runtime uniqueness/visibility/editability checks, and safe stopping when the saved field cannot be found.
- Added a 30-minute timeout to the main validation/build job and a workflow-security regression test. An over-escaped test regex was corrected in commit `6dda96e781196619ca50f4ef026e912574ef9e0d`.
- Hardened history validation: completion timestamps must be finite and between first-seen and last-updated timestamps; additionally, unfinished messages may not carry a completion timestamp. Legacy complete records without `completedAt` remain accepted for compatibility. Regression tests cover invalid ranges, status/timestamp inconsistency, arrays, invalid origins, and oversized fields.
- Latest history-validation commits: `901415e5d1897af1eb8d71737686abf711bc548a` (validator) and `a1312fabad29d7442a30c6c21e8b6b964420382a` (tests). The current CI result is not yet verified.

## Next task

1. Check workflow status for the exact newest branch/PR head. If Actions remains pending with no jobs, inspect repository Actions/runner availability and avoid treating it as a passing validation.
2. If CI runs, diagnose failures and correct them on this branch; update this log only with verified outcomes.
3. Keep PR #20 open until all required checks on the exact current head are complete and successful and merge safety is confirmed.
4. PR #18's parser issue and current-head validation uncertainty remain outstanding on its own branch. Do not modify that branch; continue independent work only on `autonomous/continuous-improvement`.

## Safety rules

- Work only on `autonomous/continuous-improvement` for autonomous code changes.
- Never force-push, overwrite unrelated work, or commit directly to `main`.
- Never merge when required CI is failing, missing, or unknown.
- Report tests, commits, pushes, and releases only when confirmed by repository evidence.
