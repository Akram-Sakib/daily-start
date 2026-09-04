# Release title

```
Daily Start 1.0.2
```

---

# Release notes (paste the block below into the release body)

Installer change only — the app itself behaves exactly as it did in 1.0.1.

**Download:** `DailyStart-Setup-1.0.2.exe` below. Windows 10 or 11, 64-bit.

## What's changed

**A one-click installer.** Double-click the setup file and Daily Start installs itself and opens — no wizard, no folder-picking, no Next → Next → Finish. This is how Slack, Discord and VS Code install on Windows, and it's the shape the Microsoft Store requires: the previous installer would not complete a fully silent install, so it failed Store certification.

**Silent install works properly.** `DailyStart-Setup-1.0.2.exe /S` now installs with no window and exits cleanly, which is what matters if you deploy this across a few machines or script your setup.

Nothing else moved. Same features, same data file, same behaviour.

## Upgrading from 1.0.0 or 1.0.1

Run the installer over the top of your existing copy. Your history, your routine and your settings are all kept — they live in a file outside the install folder and are untouched.

One note if you installed 1.0.1 to a custom folder: 1.0.2 installs to the standard per-user location (`%LOCALAPPDATA%\Programs\daily-start`). Uninstall the old copy first from **Settings → Apps** if you'd rather not leave a stale one behind. Your data is unaffected either way.

## New here?

Daily Start is a morning checklist for Windows that starts your day instead of waiting to be remembered — then shows you the days you actually turned up.

- Opens itself once a day at a time you pick, and stays shut once you've answered — however many times you restart
- Your routine rebuilds every morning, with yesterday's list underneath so you can see what slipped
- Week, month, and the year as a contribution graph
- Optional evening check-in, to tick off what really happened
- Two themes: warm paper and warm ink

## Your data

Nothing leaves your computer. No account, no server, no telemetry, and no network calls of any kind — the app works fully offline. Everything lives in one file:

```
%APPDATA%\Daily Start\daily-start.json
```

Read it, edit it, back it up, delete it. It's yours.

## First launch

Windows will show *"Windows protected your PC"* because this build isn't code-signed yet. Choose **More info → Run anyway**. Signing is on the list.
