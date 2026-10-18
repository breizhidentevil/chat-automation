# Changelog

## Unreleased — repository and CI setup

- Pinned npm to 10.8.2 in GitHub Actions and disabled audit/funding requests during dependency installation to make CI installation more predictable. This is a mitigation; successful installation still needs to be confirmed by a workflow run.

- Replaced the project README with an English overview and development guide.
- Added GitHub Actions automation to build Chrome, Firefox, and Edge ZIP packages.
- Added GitHub Pages deployment for the built-in documentation page, using relative asset URLs for project-site paths.
- Added release automation that attaches browser ZIP packages to version-tagged GitHub Releases.
- Build and test outcomes must be taken from the actual workflow run; a configured workflow is not itself proof of a successful build.

## V4.1.3 — variable autocomplete

- Added variable/path suggestions to message fields.
- Continued support for nested dynamic paths and indexed arrays.

## V4.1.2 — documentation access

- Added a help control in the popup header to open the integrated documentation.
- Kept the CA logo non-clickable.
