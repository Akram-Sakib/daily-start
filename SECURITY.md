# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.0.1 and later | Yes — fixes land in the next release |
| 1.0.0 | No — please update |

There is only one release line. "Supported" means the latest release; older
installers are not patched in place.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting instead:
[**Report a vulnerability**](https://github.com/Akram-Sakib/daily-start/security/advisories/new).
That opens a private thread visible only to you and me.

If that form is unavailable to you, email <sayedakramsakib@gmail.com> with
`daily-start security` in the subject.

Useful things to include, as far as you have them: what an attacker can do,
the app version, your Windows version, and the smallest set of steps that
shows the problem.

I maintain this in my spare time, so an honest expectation: I aim to
acknowledge within a week. If a fix is warranted I will credit you in the
release notes unless you would rather stay anonymous.

## Scope

Worth reporting:

- Anything that escapes the renderer sandbox, or reaches Node/the filesystem
  outside the app's own data file. `contextIsolation` is on, `nodeIntegration`
  is off, and the renderer runs under a strict CSP — a way around any of those
  is a real finding.
- A crafted `data.json` that leads to code execution rather than a clean
  failure.
- Anything that makes the app send data off the machine. It is designed to make
  no network calls at all, so any outbound traffic is a bug.
- Tampering with the installer's startup entry or shortcuts to run something
  else.

Probably not a vulnerability, though still fine to raise as a normal issue:

- **The installer is unsigned**, so Windows SmartScreen warns on first run.
  This is a known gap — code-signing certificates cost money. It is on the
  list, not a secret.
- The data file is plain, unencrypted JSON in your user profile. That is by
  design: anything with write access to your own profile can already read it,
  and encrypting it locally would only move the key next to the lock.
- Anyone with physical access to an unlocked machine can read or edit your
  checklist. True, and outside what this app can defend against.
- Findings from an automated scanner with no working path to exploit.

## What this app touches

It helps to know how small the surface is. Daily Start makes no network
requests, has no accounts, no telemetry and no auto-update. It reads and writes
one JSON file under your Windows user profile, registers itself to start with
Windows if you switch that on, and opens links you click in your normal
browser. That is the whole of it.
