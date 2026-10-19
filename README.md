# Chat Automation

[![Build, package, and publish](https://github.com/breizhidentevil/chat-automation/actions/workflows/build-and-publish.yml/badge.svg?branch=main)](https://github.com/breizhidentevil/chat-automation/actions/workflows/build-and-publish.yml)
[![Latest release](https://img.shields.io/github/v/release/breizhidentevil/chat-automation?include_prereleases)](https://github.com/breizhidentevil/chat-automation/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Chat Automation** is a browser extension built with WXT, React, and TypeScript. It detects chat inputs, stores a validated sending strategy per website origin, and runs configurable message sequences while tracking progress and diagnostic events.

## Quick links

- **[User documentation](https://breizhidentevil.github.io/chat-automation/documentation.html)** — installation, setup, automation, variables, history, logs, and troubleshooting.
- **[Latest release](https://github.com/breizhidentevil/chat-automation/releases/latest)** — download the latest published browser packages.
- **[All releases and prereleases](https://github.com/breizhidentevil/chat-automation/releases)** — choose a stable release or development build.
- **[Builds and CI status](https://github.com/breizhidentevil/chat-automation/actions/workflows/build-and-publish.yml)** — type checking, browser builds, and package publishing.
- **[Report a bug or request a feature](https://github.com/breizhidentevil/chat-automation/issues)**.
- **[Source code](https://github.com/breizhidentevil/chat-automation)**.

## Download and install

1. Open the **[Releases page](https://github.com/breizhidentevil/chat-automation/releases)**.
2. Choose a release and download the ZIP for your browser:
   - `chat-automation-chrome.zip` — Chrome
   - `chat-automation-firefox.zip` — Firefox (Manifest V3)
   - `chat-automation-edge.zip` — Microsoft Edge
3. Extract the ZIP to a folder.
4. Open your browser's extensions page, enable developer mode, and load the extracted folder as an unpacked extension.

For detailed setup and usage instructions, see the **[documentation website](https://breizhidentevil.github.io/chat-automation/documentation.html)**. Development prereleases are published automatically from the default branch; they may include changes that have not yet been fully validated.

## Features

- **Per-site sending strategies**: validate and save the input selector and sending method for each website origin.
- **Message automation**: compose and reorder multi-message sequences, configure an interval, choose a finite number of cycles or repeat indefinitely, and optionally restrict execution to a daily time window.
- **Conversation simulator**: define an ordered, extendable list of sent-message / expected-reply pairs; preview rendered outgoing templates and simulate received replies locally, without contacting an LLM or sending real messages.
- **Generation-aware scheduling**: pause sending when supported page signals indicate that a response is still being generated.
- **Variables**: define reusable static variables and use variable suggestions while editing message templates.
- **LiquidJS message templates**: use filters, default values, conditionals, and loops alongside existing `{{variable}}` and dynamic data-path tokens.
- **Dynamic data paths**: reference runtime, automation, chat, history, logs, strategy, and data context with dotted properties and indexed arrays.
- **History and logs**: inspect captured messages and execution events, with JSON export where available.
- **Appearance**: choose light, dark, or automatic mode (follows the operating system); the preference is saved locally in the browser.
- **Built-in documentation**: open the extension guide from the popup's help icon.

## Architecture

The popup separates presentation, stateful workflows, pure business logic, and browser infrastructure:

- `entrypoints/popup/pages/` contains the five popup pages; `components/TemplateTextarea.tsx` is shared by the editor and variable preview.
- The popup uses [Mantine v8](https://mantine.dev/) as its shared React UI system across all five pages: navigation, form controls, action buttons, alerts, status badges, cards, and result surfaces use Mantine components. The template editor retains its custom variable autocomplete while using Mantine's textarea styling. The popup supports persisted light, dark, and automatic color schemes. A small amount of project CSS remains for the compact browser-popup layout, message drag-and-drop, and specialized timelines. Mantine styles are bundled locally with the extension; no runtime CDN or network dependency is used.
- `entrypoints/popup/hooks/` owns automation settings, variable editing, simulation, automation control, history/log loading, runtime status, and polling lifecycles.
- `lib/` contains pure message-sequence operations, automation configuration validation, LiquidJS preview/resolution, simulation, and existing validation helpers.
- `services/` isolates browser storage, per-site permissions/content-script registration, history/log reads, and JSON file downloads.

The intended dependency direction is UI → hooks → business logic/services. Services return data or errors and do not update React state directly. Pure logic is covered by unit tests so the editor, simulator, and runtime can share rules without duplicating them.

## Message templates

Message fields support [LiquidJS](https://liquidjs.com/) syntax while preserving the existing variable tokens. Examples:

```liquid
Bonjour {{ contact.name | default: "à vous" | capitalize }} !

{% if automation.sequence.iteration > 1 %}
Je reviens vers vous avec un complément.
{% else %}
Voici les informations demandées.
{% endif %}

{% for item in data.items %}
- {{ item.name }} : {{ item.value }}
{% endfor %}
```

Available data includes saved variables, runtime and automation context, and the existing dynamic roots (`chat`, `history`, `logs`, `strategy`, and `data`). Liquid filters such as `default`, `capitalize`, and `upcase`, plus `if`, `unless`, and `for`, can be used directly in message text. Existing templates continue to work unchanged. Template rendering is local to the extension; do not place secrets in messages or expose data you would not want sent to the active chat.

## Automation simulator

Open the **Simulator** tab to preview the configured message sequence before starting a real run. It uses the current sequence, saved variables, interval, and time-window settings, and lets you provide a start date, up to 10 simulated cycles, and a fictitious JSON context for dynamic data.

The simulator renders each template and shows a timestamped timeline with successful output or the specific rendering error. Scheduling is calculated without waiting for the interval to elapse. The simulator does not send messages, call the page script, write automation history/logs, or persist the JSON test context. It is a rendering and schedule preview, not a full browser-site integration test; page-specific input detection and actual delivery still require a separate real-site test.

## Requirements

- Node.js 22 or newer (required by the current build toolchain)
- npm

## Development

```bash
npm install
npm run dev
```

## Type checking and builds

```bash
npm run typecheck
npm run build:chrome
npm run build:firefox
npm run build:edge
```

The WXT build output is written to `.output/`. To build all supported targets locally, run:

```bash
npm run build:all
```

To package builds manually, use the build output for the relevant browser. The CI workflow also creates ZIP packages and attaches them to releases.

## Versioning policy

The extension version follows Semantic Versioning and is kept in sync between `package.json` and `package-lock.json`; WXT uses this package version in the generated browser manifest.

- Current development baseline: `5.4.0`.
- Each patch-level development iteration increments the patch version (for example, `5.3.0` → `5.3.1` → `5.3.2`).
- The minor or major component changes only when the scope of a release justifies it.
- GitHub Actions adds its run number to development prerelease tags (for example, `v5.0.1-dev.201`); that build number does not replace the extension version.

## Release and documentation publishing

The [GitHub Actions workflow](https://github.com/breizhidentevil/chat-automation/actions/workflows/build-and-publish.yml):

- runs type checking and builds Chrome, Firefox (Manifest V3), and Edge packages;
- uploads the ZIP files as workflow artifacts (retained for 30 days);
- deploys the documentation website to [GitHub Pages](https://breizhidentevil.github.io/chat-automation/documentation.html) on pushes to the default branch;
- publishes a development prerelease with browser ZIPs after pushes to the default branch;
- attaches the browser ZIPs to stable releases when a `v*` tag is pushed.

If the documentation link is temporarily unavailable, check the [workflow runs](https://github.com/breizhidentevil/chat-automation/actions/workflows/build-and-publish.yml) to see whether the latest deployment succeeded.

## Operational notes

- The active chat tab must remain open during automation; reloading or closing it interrupts the running sequence.
- DOM-based confirmation indicates that a matching message appeared in the page. It does not prove server-side delivery.
- Site markup and browser restrictions affect detection and compatibility. Test each target site and browser before relying on an automation.
- The extension requests host access for HTTP and HTTPS websites during installation or update so its content script can work across supported sites without per-site activation. Browser-internal and protected pages remain unavailable. The extension does not start sending messages on its own: the user must configure and explicitly start an automation. The broad host-access permission may be shown in the browser's installation/update warning.
- History and logs may contain conversation text or diagnostic details. Review exported JSON before sharing it.
- The repository includes unit tests for selected logic, run by `npm test` and enforced in CI. It does not yet include a comprehensive end-to-end suite or a cross-browser integration test matrix.

## License

This project is licensed under the **MIT License**. See the [`LICENSE`](LICENSE) file for the full license text.


## Définition des variables

Les variables se définissent en bloc dans l’onglet **Variables** au format JSON ou YAML. Le format est détecté automatiquement : un document commençant par `{` est lu comme du JSON ; sinon, il est lu comme un mapping YAML, y compris les objets imbriqués.

JSON :

```json
{
  "prenom": "Alexandre",
  "ville": "Nantes",
  "actif": true
}
```

YAML :

```yaml
prenom: Alexandre
ville: Nantes
actif: true
```

Les clés de premier niveau doivent respecter les règles de nommage des variables utilisées dans les modèles. Les objets imbriqués sont pris en charge ; accédez à leurs propriétés avec la notation pointée, par exemple `{{personne.adresse.ville}}`. Les tableaux JSON sont également pris en charge et peuvent être indexés, par exemple `{{articles[0].titre}}`. Les mappings YAML imbriqués utilisent une indentation par multiples de deux espaces. Lors de l’enregistrement, les variables existantes conservent leur portée ; la portée sélectionnée s’applique aux nouvelles variables. Un objet JSON vide (`{}`) permet de supprimer toutes les variables.
