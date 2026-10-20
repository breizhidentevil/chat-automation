# Continuous improvement log

## Latest confirmed run

- Date: 2026-10-20
- Working branch: `autonomous/continuous-improvement`
- Base branch: `main`
- Baseline version: `5.4.0`
- Main baseline: `7e7d6b0ae253c69e1bfe54d6a5f34bd462ea7f27`
- PR #19 is merged. Its full validation run [#39346725806](https://github.com/breizhidentevil/chat-automation/actions/runs/39346725806) completed successfully, including type-check, unit tests, Chromium smoke test, and Chrome/Firefox/Edge builds.

## Repository and CI findings

- PR #20, `ci: bound validation job runtime`, remains open against `main`. Run [#39347745580](https://github.com/breizhidentevil/chat-automation/actions/runs/39347745580) completed successfully on exact head `2a0fba6f522269c6554ba479403f8954ccfc0ffb`. All 16 validation/build steps passed, including npm high-severity audit, type-check, unit tests, Chromium smoke test, Chrome/Firefox/Edge builds, and artifact uploads. This validates that SHA only; subsequent commits require fresh CI.
- PR #18, `feat/variables-yaml-json-editor`, remains open on its own branch. Its latest observed failed run [#39343508885](https://github.com/breizhidentevil/chat-automation/actions/runs/39343508885) used workflow merge SHA `e2f588460d3a622f3f17f013c876ddda1fa03099`, not PR head `4fd7bec8c6823c15c884d1a371fce6e3afb78183`. Do not treat it as proof that the current PR head fails or passes.
- PR #18's parser appears to detect duplicate YAML child keys using indentation rather than parent names, potentially colliding for `personne.prenom` and `adresse.prenom`. A reproduction was reported in the PR discussion; that branch was not modified.
- Local npm commands are unavailable in this execution environment. No local test result is claimed.

## Changes on the autonomous branch

- Reserved dynamic template roots (`system`, `automation`, `chat`, `history`, `logs`, `strategy`, `data`) from custom variable names and added a regression test.
- Hardened strategy recovery with up to eight validated input selectors, a semantic fingerprint, runtime uniqueness/visibility/editability checks, and safe stopping when the saved field cannot be found.
- Added a 30-minute timeout to the main validation/build job and a workflow-security regression test. An over-escaped test regex was corrected in commit `6dda96e781196619ca50f4ef026e912574ef9e0d`.
- Added history validation to reject inconsistent completion timestamps: a provided `completedAt` must be finite and lie between `firstSeenAt` and `lastUpdatedAt`. Added regression coverage, including array-shaped records.
- The latest green run before the history-validation change was [#39347745580](https://github.com/breizhidentevil/chat-automation/actions/runs/39347745580) on `2a0fba6f522269c6554ba479403f8954ccfc0ffb`. The history-validation commits have been pushed after that run; their CI is not yet verified.

## Next task

1. Check CI on the exact latest head after the history timestamp validation and regression test changes. Diagnose and fix any failures, then update this log with the exact SHA and result.
2. Keep PR #20 open until all required checks on the exact current head are complete and successful and merge safety is confirmed. Do not merge solely because the prior head passed.
3. PR #18's current-head validation remains unknown and its parser issue remains outstanding on that separate branch. Do not modify that branch; continue only independent work on `autonomous/continuous-improvement`.

## Safety rules

- Work only on `autonomous/continuous-improvement` for autonomous code changes.
- Never force-push, overwrite unrelated work, or commit directly to `main`.
- Never merge when required CI is failing, missing, or unknown.
- Report tests, commits, pushes, and releases only when confirmed by repository evidence.
