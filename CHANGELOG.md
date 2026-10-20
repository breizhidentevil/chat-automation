## Unreleased — validation défensive des configurations

- La validation d'une configuration d'automatisation rejette désormais les objets malformés avant normalisation : unité inconnue, types invalides, séquence non-tableau ou variables non-tableau.
- Ajout de tests de non-régression pour vérifier qu'une entrée malformée retourne une erreur contrôlée au lieu de provoquer une exception ou une conversion silencieuse.

## Unreleased — roadmap et suivi des itérations

- Création de `docs/roadmap.md` pour centraliser les dix axes d'amélioration, leur ordre de priorité, les principes de développement continu et les critères de clôture.
- Les prochaines itérations doivent consigner ici les changements livrés, et dans `docs/continuous-improvement-log.md` les détails techniques, décisions, commits et résultats de validation utiles.
- Cette entrée documente l'ajout du processus de suivi ; elle ne signifie pas que les dix axes sont implémentés.

## 5.3.0 — React architecture refactor

- Extracted pure message-sequence operations and centralized automation configuration normalization, validation, and runtime payload creation.
- Replaced manual variable preview substitution with the shared LiquidJS resolver; dynamic runtime paths are shown as placeholders and unknown variables remain visible.
- Extracted storage and infrastructure services for variables, automation settings, history, logs, site permissions/content-script registration, and JSON exports.
- Split the popup into dedicated Automation, Variables, History, Logs, and Simulator pages, with a shared TemplateTextarea component.
- Added hooks for automation settings, variable management, simulation, automation control, history/log loading, runtime status, and page polling.
- Added unit tests for extracted business logic and service boundaries.

## 5.2.0 — Automation simulator

- Added a dedicated simulator tab in the popup.
- Simulates LiquidJS rendering, multiple cycles, message intervals, and daily time windows against a temporary JSON context.
- Displays a timestamped timeline with rendered messages and per-message template errors.
- The simulation engine has no browser, DOM, network, storage, or message-sending dependency.
- Added tests for rendered cycles, per-message errors, daytime and overnight windows, and configuration limits.

## 5.1.0 — LiquidJS message templates

- Integrated LiquidJS into message rendering with support for filters, default values, conditionals, and loops.
- Preserved existing static-variable and dynamic-path tokens and their validation behavior.
- Restricted property access to own properties and configured template parsing, render, and memory limits; pinned a patched LiquidJS release.
- Added regression tests for Liquid syntax, backwards compatibility, malformed templates, unknown variables, and blocked object properties.
- Validation status at the time of the 5.1.0 change: CI was green for unit tests, type checking, and Chrome/Firefox/Edge builds.

## 5.0.0 — Versioning baseline

- Aligned the extension package and lockfile versions with the V5 product milestone.
- Established the versioning policy: increment the patch version on every development iteration that changes the project.
- The generated browser manifest takes its version from the package metadata; development prerelease tags additionally include the GitHub Actions run number.

## Typecheck correction v3

- Set `compilerOptions.jsx` to `react-jsx` for TSX entrypoints.
- Removed the invalid Vite hook typing/mutation that treated the Vite hook argument as `ConfigEnv` and accessed `base` on it.
- Validation status: archive integrity checked; CI build and TypeScript typecheck have not been run in this environment.

## Typecheck follow-up

- Removed the unresolved `wxt/client` type-library entry; WXT's generated tsconfig is the source of generated ambient types.
- Preserved the `wxt prepare` step before TypeScript checks.
- Validation status: ZIP integrity verified; dependencies and typecheck were not run in this environment.

## TypeScript typecheck correction

- Removed the explicit `wxt/client` entry from `compilerOptions.types`; this package path is not resolvable as a standalone type-definition library in the current WXT 0.20.27 setup.
- WXT-generated configuration remains extended via `./.wxt/tsconfig.json`, and the `typecheck` script still runs `wxt prepare` before `tsc --noEmit`.
- Validation status: ZIP integrity checked; `tsc --noEmit` has not been run here.

## CI/typecheck follow-up correction

- `npm run typecheck` now runs `wxt prepare` before `tsc --noEmit`.
- TypeScript target is set to `ES2022` and module resolution to `Bundler`.
- Added the WXT client type declaration to the TypeScript configuration.
- Validation: archive structure checked only; dependencies were not installed and WXT/typecheck were not executed in this environment.

## CI correction — WXT Vite configuration

- Changed `wxt.config.ts` from a plain `vite` object to a callback, matching the WXT configuration API used by WXT 0.20.27.
- The callback retains the relative `base: './'` setting.
- Validation status: the archive was inspected and updated; `npx wxt prepare` and the GitHub Actions workflow have not been run here.

# Changelog

## Unreleased — repository and CI setup

- Added an explicit `wxt prepare` step before TypeScript checking so the generated `.wxt/tsconfig.json` and browser declarations exist in CI. Set the TypeScript target to ES2022 to support iteration over `Set` values. This workflow fix has not yet been validated by a GitHub Actions run.

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


### Correctifs TypeScript — typecheck v4

- Protège le déplacement d’un message contre une valeur `undefined` avec `noUncheckedIndexedAccess`.
- Corrige le chemin de documentation transmis à `browser.runtime.getURL` en utilisant un chemin public absolu (`/documentation.html`).
- Corrige la configuration Vite WXT : le callback renvoie désormais une configuration Vite (`{ base: './' }`) au lieu de renvoyer l’objet d’environnement reçu.
- Validation à effectuer dans l’environnement CI avec `npm run typecheck`; aucune réussite de CI n’est présumée ici.


## Unreleased — GitHub Releases for development builds

- Updated `.github/workflows/build-and-publish.yml` to publish a GitHub prerelease with the browser ZIP packages after successful pushes to `main` or `master`.
- Development tags use `v<package-version>-dev.<run-number>` to keep each workflow run distinct.
- Version tags matching `v*` continue to publish stable releases.
- Pull requests do not publish releases. A successful workflow run is still required; this change has not yet been validated by a completed Actions run.


## CI correction — prerelease version step

- Fixed shell quoting in the GitHub Actions step that reads the package version for development prerelease tags. The version is now captured in `VERSION` before writing to `GITHUB_OUTPUT`.
- Validation status: workflow file updated; a successful GitHub Actions run has not yet been confirmed.


## V5 — French/English localization

- Added a centralized French/English translation catalog with matching key sets.
- Added a popup language selector; the chosen language is persisted in extension local storage and shared with the integrated documentation.
- The initial language follows the browser locale (English for English browser locales, French otherwise) unless a saved preference exists.
- Localized the primary automation controls, variable editor and autocomplete labels, history and logs views, runtime phase labels, and most help/error text in the popup.
- Added an English version of the integrated documentation with a language selector; the French guide remains available.
- Centralized the popup's storage, export, site-access, test, validation, and runtime-status messages in the French/English catalog. The catalog now has regression checks for key parity and the per-message history truncation limit.
- The built-in French and English guides now document the 100,000-character per-message history limit. The guides remain parallel in structure, but are not yet generated from a shared source.
- Some messages returned dynamically by page scripts or websites can still use the source site's language. The repository's CI workflow remains the authoritative source for typecheck and browser-build status.