# Chat Automation

Chat Automation is a browser extension built with **WXT, React, and TypeScript**. It detects chat inputs, stores a validated sending strategy per website origin, and runs configurable message sequences while tracking progress and diagnostic events.

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

The WXT build output is written to `.output/`. Firefox is built with Manifest V3. To build all supported targets locally, run:

```bash
npm run build:all
```

## Install a local build

Build the target browser, then load the corresponding unpacked directory from `.output/` using that browser's extension developer mode. For packaged ZIP builds, use the ZIP files published by the GitHub Actions workflow or attached to a versioned GitHub Release.

## Documentation website and release packages

The GitHub Actions workflow builds Chrome, Firefox, and Edge packages on pushes and pull requests. It uploads the ZIPs as workflow artifacts. On pushes to the default branch, it also publishes the built documentation to GitHub Pages. When a `v*` tag is pushed, the workflow creates a GitHub Release and attaches the three browser ZIP packages.

GitHub Packages does not provide a generic registry for arbitrary browser-extension ZIP files. Therefore, distributable ZIPs are published as workflow artifacts and GitHub Release assets rather than represented as an unsupported generic GitHub Package.

## Operational notes

- The active chat tab must remain open during automation; reloading or closing it interrupts the running sequence.
- DOM-based confirmation indicates that a matching message appeared in the page. It does not prove server-side delivery.
- Site markup and browser restrictions affect detection and compatibility. Test each target site and browser before relying on an automation.
- The extension requests broad website access so its content script can work on ordinary web pages. Browser-internal and protected pages remain unavailable.
- History and logs may contain conversation text or diagnostic details. Review exported JSON before sharing it.
- The repository currently does not include a comprehensive automated test suite or a cross-browser integration test matrix.

## License

No license has been declared yet. All rights reserved unless a license is added to this repository.
