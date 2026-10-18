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
