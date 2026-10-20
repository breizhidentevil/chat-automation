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
- Review of the PR #18 parser code identified a likely YAML duplicate-detection defect: the duplicate path key is constructed from indentation levels rather than parent key names, so equal child names under separate objects may collide. This feature remains on its owner branch and has not been copied or modified here; verify with a focused test and notify the PR owner if confirmed.
- Local npm commands are unavailable in this execution environment. No local test result is claimed.

## Changes on the autonomous branch

- Earlier work reserved dynamic template roots (`system`, `automation`, `chat`, `history`, `logs`, `strategy`, `data`) from custom variable names and added a regression test.
- Strategy recovery hardening added up to eight validated input selectors plus a semantic fingerprint, with runtime uniqueness/visibility/editability checks and safe stopping if the saved field cannot be found.
- Current reliability improvement: the main validation/build job now has a 30-minute timeout, bounding a stuck browser setup/build/test run rather than letting CI consume runner time indefinitely. Added a workflow-security regression test for the timeout policy.
- The workflow, test, and this log were committed on `autonomous/continuous-improvement` through the GitHub contents API. The new CI policy test has not yet run; the resulting PR CI must confirm it.
- The working branch's most recent confirmed commits from this run: `fd9dab65c89c668554391e3fa1bee1e2331e6a51` (job timeout) and `5427f52ea211804025c465436770470bce1ca939` (regression test). Log update commit pending.

## Next task

1. Finish updating this log, then create/update a PR from `autonomous/continuous-improvement` to `main`.
2. Wait for all required CI jobs to finish on the exact PR head; fix failures before considering merge. Never merge while status is failing, pending, missing, or unknown.
3. Recheck PR #18's current head and status checks. Independently confirm the suspected YAML nested-key collision without changing its branch; report a focused finding to its owner.
4. Continue with the highest-priority independently actionable bug, with focused tests and verified CI evidence.

## Safety rules

- Work only on `autonomous/continuous-improvement` for autonomous code changes.
- Never force-push, overwrite unrelated work, or commit directly to `main`.
- Never merge when required CI is failing, missing, or unknown.
- Report tests, commits, pushes, and releases only when confirmed by repository evidence.
