# Microsoft Store submission — what to put in each field

## Category

| Field | Value |
|---|---|
| Category | **Productivity** (it has no subcategories, so nothing more to pick) |
| Secondary category | **Utilities + tools** |

`Lifestyle` is the alternative secondary if you'd rather be found by people
browsing for daily-routine apps. Don't pick `Health + fitness` — the app tracks
any routine, not health, and a category that doesn't match invites the wrong
reviews.

## Privacy policy

Use **Provide privacy policy URL**, not the text box — a real link looks
legitimate on the listing and you'll only have to update it in one place.

`docs/privacy.html` is ready to publish. In the repo: **Settings → Pages →
Source: Deploy from a branch → main → /docs**. The URL is then:

```
https://<your-username>.github.io/<repo>/privacy.html
```

If Pages isn't up yet, paste the text of that page into the text box and switch
to the URL later.

## Support info

| Field | Value |
|---|---|
| Website | your repo URL, or the Pages site once it exists |
| Support contact info | `https://github.com/<you>/<repo>/issues` |

The Issues URL is better than an email here: it's public, it shows the app is
maintained, and other people's answered questions save you repeat work.

## Contact details

| Field | What to do |
|---|---|
| Email address | `sayedakramsakib@gmail.com` — the same address the privacy policy lists |
| Phone number | leave blank if it lets you |
| Address | leave blank if it lets you; if required, use a business address |

These are **displayed publicly on the Store listing**. Never put a home address
or personal mobile number in a public field for a free app. Whichever address you
use, keep it the same one the privacy policy lists — a mismatch is the kind of
small inconsistency that makes a reviewer look harder at everything else.

## Product declarations

| Declaration | Answer |
|---|---|
| Depends on non-Microsoft drivers or NT services | **No** |
| Tested to meet accessibility guidelines | **No** |
| Supports pen and ink input | **No** |
| Incorporates generative AI features | **No** |

On accessibility: leave it unchecked, and it isn't a formality. Ticking a task
is wired to a click handler on a list row, so the app's main action can't be
reached by keyboard or a screen reader at all. Microsoft's own guidance says not
to declare accessibility unless you engineered and tested for it — the penalty
is bad reviews from the people who most needed it to be true. Worth fixing
later: make each row a real button, add Enter/Space, then you can declare it
honestly.

On generative AI: the app contains no AI of any kind. Leave it unchecked.

## System requirements

**Leave every row "Not specified".**

Anything you list as *minimum hardware* can show users a warning and can stop
them rating the app. Nothing here needs a touch screen, camera, NFC, Bluetooth,
telephony, microphone, a GPU or a particular DirectX level — so declaring any of
it only costs you users. A keyboard and mouse come with every Windows desktop;
you don't need to ask for them.

## Notes for certification

Paste `docs/store-certification-notes.txt`. The first point in it matters more
than all the rest: the app shows its window **once a day by design**, and a
tester who closes it and relaunches will see nothing. Undisclosed, that reads as
"app fails to launch" and gets the submission rejected.
