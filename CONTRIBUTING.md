# Contributing

Thanks for looking. This is a small app with a deliberately small scope, so the
most useful thing to know up front is what it is *not* trying to become.

## The scope

Daily Start opens once in the morning, pushes you into the day, and gets out of
the way. One local JSON file, no database, no account, no network calls. That
constraint is the product, not a limitation waiting to be fixed.

Changes that fit:

- Bugs. Always welcome, no discussion needed — just open an issue or a PR.
- Accessibility, keyboard handling, contrast, screen-reader labels.
- Windows quirks: startup behaviour, DPI, multi-monitor, tray oddities.
- Making existing screens clearer without adding new ones.

Changes that probably don't fit — ask first, in
[Discussions](https://github.com/Akram-Sakib/daily-start/discussions), before
writing code:

- Sync, accounts, cloud backup, or anything that sends data off the machine.
- A second database, or replacing the JSON store.
- Cross-platform ports. Not opposed in principle, but it is a big commitment
  and I would want to talk through who maintains it.
- New top-level screens or a settings page that grows without limit.

I would rather say "no thanks" to an idea than to your afternoon, so please do
open a discussion first for anything large.

## Getting it running

```bash
pnpm install
pnpm start
```

`npm` works too. You need Node 22+ and Windows to exercise the startup and tray
behaviour — the rest of the UI you can poke at anywhere.

Handy while working on the design: `src/renderer/index.html` opens straight in a
browser and falls back to demo data, so you can iterate on CSS without booting
Electron.

To test the once-a-day logic without waiting for tomorrow, launch with
`pnpm start:autostart` and move your morning time in Settings.

## House style

There is no linter and no build step, on purpose. Match the file you are
editing and you will be fine:

- Two-space indent. Semicolons. `'use strict'` at the top of every script.
- Plain JavaScript, no framework, no bundler. Keep it that way.
- `nodeIntegration` stays off, `contextIsolation` stays on, and the renderer
  keeps its strict CSP. Anything the UI needs from disk goes through IPC in
  `src/preload.js`. A PR that loosens this will not be merged.
- Comments explain *why*, not *what*. The existing files are a fair sample.
- Keep the copyright header at the top of each source file.

## Commits and pull requests

Small and focused beats large and thorough. One concern per PR.

Commit subjects in the imperative mood, lowercase, no trailing period —
`fix tray icon on 150% scaling`, not `Fixed the tray icon.` A `type:` prefix
(`fix:`, `feat:`, `chore:`) is welcome but not required.

Before you open the PR, actually run the app and click the thing you changed.
There is no test suite to catch you, which makes this the whole safety net.

In the PR, say what you changed, why, and how you checked it. The template
asks for exactly that.

## Licensing your contribution

The project is Apache-2.0. By opening a pull request you agree your
contribution is licensed under those terms — that is what Apache-2.0
section 5 says, and there is no separate CLA to sign.

Please do not paste in code you do not have the right to relicense, and say so
in the PR if any of it came from somewhere else.

## Reporting bugs and vulnerabilities

Ordinary bugs: [open an issue](https://github.com/Akram-Sakib/daily-start/issues/new/choose).

Security vulnerabilities: do **not** open a public issue. See
[SECURITY.md](SECURITY.md).
