# Continuous improvement log

## Latest confirmed run

- Date: 2026-10-20
- Working branch: `autonomous/continuous-improvement`
- Base branch: `main`
- Baseline version: `5.4.0`
- Main baseline: `7e7d6b0ae253c69e1bfe54d6a5f34bd462ea7f27`
- Previous PR #19 is merged. Its full validation run [#39346725806](https://github.com/breizhidentevil/chat-automation/actions/runs/39346725806) completed successfully, including type-check, unit tests, Chromium smoke test, and Chrome/Firefox/Edge builds.

## Repository and CI findings

- The main branch workflow run [#39346853059](https://github.com/breizhidentevil/chat-automation/actions/runs/39346853059) also completed successfully.
- PR #18, `feat/variables-yaml-json-editor`, remains open and belongs to its own branch. Its latest observed failed run is [#39343508885](https://github.com/breizhidentevil/chat-automation/actions/runs/39343508885); it used workflow merge SHA `e2f588460d3a622f3f17f013c876ddda1fa03099` while the PR reports head `4fd7bec8c6823c15c884d1a371fce6e3afb78183`. Do not treat that run as proof that the current PR head fails or passes; re-check status checks for the exact current head before any merge.
- Review of the PR #18 parser code identified a YAML duplicate-detection defect: the duplicate path key is constructed from indentation levels rather than parent key names, so equal child names under separate objects collide. I reported the exact reproduction (`personne.prenom` and `adresse.prenom`) in a comment on PR #18; that branch was not modified and the test has not been executed locally.
- Local npm commands are unavailable in this execution environment. No local test result is claimed.

## Changes on the autonomous branch

- Earlier work reserved dynamic template roots (`system`, `automation`, `chat`, `history`, `logs`, `strategy`, `data`) from custom variable names and added a regression test.
- Strategy recovery hardening added up to eight validated input selectors plus a semantic fingerprint, with runtime uniqueness/visibility/editability checks and safe stopping if the saved field cannot be found.
- Current reliability improvement: the main validation/build job now has a 30-minute timeout, bounding a stuck browser setup/build/test run rather than letting CI consume runner time indefinitely. Added a workflow-security regression test for the timeout policy.
- The workflow and regression test are on `autonomous/continuous-improvement`. The initial test run exposed an over-escaped regex; it was corrected in commit `6dda96e781196619ca50f4ef026e912574ef9e0d`.
- Full CI run [#39347471579](https://github.com/breizhidentevil/chat-automation/actions/runs/39347471579) completed successfully on exact head `d347c2a5d8e730dfe17276cab11bfae3176aa2ef`, including unit tests, Chromium smoke test, and Chrome/Firefox/Edge builds. A subsequent documentation-only commit updates the log; its own CI must still be checked.

## Next task

1. PR #20 is open against `main`; its latest confirmed CI run is green on SHA `d347c2a5d8e730dfe17276cab11bfae3176aa2ef`. Recheck the exact head and required checks after any further commit; do not merge merely because this run passed if the head changes or mandatory checks are absent.
2. PR #18 head `4fd7bec8c6823c15c884d1a371fce6e3afb78183` currently reports zero check runs and zero commit statuses (combined state `pending`), so its validation is missing/unknown. Do not merge it. The parser code still contains the YAML duplicate-detection collision: the key is based on indentation levels, not parent names. The report is in the PR discussion; do not modify that separate branch.
3. Continue with the highest-priority independently actionable improvement on `autonomous/continuous-improvement`, adding focused regression tests and recording exact verification evidence.

## Safety rules

- Work only on `autonomous/continuous-improvement` for autonomous code changes.
- Never force-push, overwrite unrelated work, or commit directly to `main`.
- Never merge when required CI is failing, missing, or unknown.
- Report tests, commits, pushes, and releases only when confirmed by repository evidence.
