# Continuous improvement log

## Latest confirmed run

- Date: 2026-10-20
- Working branch: `autonomous/continuous-improvement`
- Base branch: `main`
- Baseline version: `5.4.0`
- Pull request: [#19](https://github.com/breizhidentevil/chat-automation/pull/19)

## Repository and CI findings

- PR #19 remains open; the previous CI run was still in progress when last checked. The latest code commits will trigger validation again.
- PR #18's workflow run #348 failed in unit test 119, `parses nested JSON and YAML objects and rejects malformed documents`, at `tests/variable-document.test.mjs:39`. The parser returned one raw YAML string under `personne` rather than parsed nested JSON strings for both `personne` and `articles`. The run's workflow used an earlier SHA than the PR's reported head; the current head must be rechecked before assigning the failure to the latest revision. The PR #18 branch was not modified.
- PR #15 previously had a successful validation/build job; publish and Pages jobs were skipped as expected on a pull request.
- Local npm commands are unavailable in this execution environment. No local test result is claimed.

## Changes made on the autonomous branch

- Reserved dynamic template roots (`system`, `automation`, `chat`, `history`, `logs`, `strategy`, `data`) are now rejected as custom variable names. This prevents custom variables from shadowing runtime data roots and breaking nested dynamic paths.
- Added a regression test asserting reserved roots are invalid and `{{data.items[0].label}}` still resolves to the dynamic value when a legacy/custom `data` definition is supplied.
- Commits: `45bfc8a9ecf1f979785f1e0be7f3e09149ac400d`, `2c17aab0e2c69a49dcfef6be0cf684bff5bb8777`, `eec0ecb44957d6d10f95ca1f9abbca1d6e6b4877`.
- Verification status: changes were committed through the GitHub contents API and the branch files were subsequently re-read. The new unit test has not yet been executed; CI evidence is pending.

## Next task

1. Check CI for the latest head of PR #19 and fix any new failures before considering merge.
2. Recheck PR #18's current head and workflow runs. Report the exact YAML parser failure to its owning PR and only make a fix on the autonomous branch if it can be independently implemented and tested without copying incomplete feature work.
3. Review remaining template parsing and variable validation for compatibility and security regressions; add focused tests for confirmed defects.
4. Update this log with verified CI outcomes and the next priority.

## Safety rules

- Work only on `autonomous/continuous-improvement` for autonomous changes.
- Never force-push, overwrite unrelated work, or commit directly to `main`.
- Never merge when required CI is failing, missing, or unknown.
- Report tests, commits, pushes, and releases only when confirmed by repository evidence.


## Strategy recovery hardening — 2026-10-20

- Confirmed design weakness: a single saved CSS selector was a single point of failure for locating the chat input.
- Extended saved procedures with optional ordered `inputSelectors`, preserving compatibility with existing records that only contain `inputSelector`.
- Strategy validation now saves up to eight selectors that were each verified to uniquely identify the selected input at validation time. The list includes independent identifying attributes where available and retains a structural selector as the final fallback.
- During automation, the extension tries the saved selectors in order, but only when each still matches exactly one element at runtime. It then requires a visible, connected, editable, enabled node that matches a saved semantic fingerprint (tag, contenteditable state and available role/label/name/placeholder attributes). This rejects selectors that became ambiguous or now point to a different field. It never switches the send method as a side effect. If every selector fails, it stops safely rather than guessing.
- Added validation tests for ordered fallback lists, duplicates, missing primary selector, maximum list size and optional input fingerprints.
- Commits: `1f4fb9fff5b26a6f675e2650389117921ce26538`, `b3ae86bcdcea9a5b63fdad1c0df8c834f1cf5957`, `c5eb24e105df1fb317b59943606b4b2354ee1fdf`, `7d060a49f36949b14cefa8ede2832787b78afb97`, `1ce4a64e052fd7ec4ab51e445f6c9674dd8e3dad`, `99e3e859b28bb778e161dfdc912814d9ce2cad56`, `6c2bc1f39b4238258fd58ef7d31e9426c62c614b`, `f6bdf04693381d8f58c4bc88897dfd146d36669b`, `6960a91e6c57ef5ea59a52abfc3a814a6dbbc7ee`, `9745520bd36c80e96f237489e33e3a9126bdf0be`, `cf514ab2deef57928a1479ff77ae9ca5cef68528`.
- CI status must be checked against the latest branch head before merge. Local tests were not run in this environment.
