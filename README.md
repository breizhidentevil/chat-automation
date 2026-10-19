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
- **Generation-aware scheduling**: pause sending when supported page signals indicate that a response is still being generated.
- **Variables**: define reusable static variables and use variable suggestions while editing message templates.
- **Dynamic data paths**: reference runtime, automation, chat, history, logs, strategy, and data context with dotted properties and indexed arrays.
- **History and logs**: inspect captured messages and execution events, with JSON export where available.
- **Built-in documentation**: open the extension guide from the popup's help icon.

## Requirements

- Node.js 20 or newer
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
- The extension requests broad website access so its content script can work on ordinary web pages. Browser-internal and protected pages remain unavailable.
- History and logs may contain conversation text or diagnostic details. Review exported JSON before sharing it.
- The repository includes unit tests for selected logic, run by `npm test` and enforced in CI. It does not yet include a comprehensive end-to-end suite or a cross-browser integration test matrix.

## License

This project is licensed under the **MIT License**. See the [`LICENSE`](LICENSE) file for the full license text.
