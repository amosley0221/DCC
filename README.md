# Dynasty Command Center

Companion apps for an EA College Football 27 dynasty — a Windows workspace and
an Android app with the same feature set, sharing one queue of pending save
writes.

**[Download the latest release →](https://github.com/amosley0221/DCC/releases/latest)**

| | |
| --- | --- |
| **Windows** | `DCC-Setup-<version>.exe` — an installer that upgrades over any previous version |
| **Android** | `DCC-<version>.apk` — sideload it; it installs over any previous version |

Neither update ever asks you to uninstall first, and neither loses your queue,
board, theme or settings. Both apps can check for the next release themselves:
Windows on launch, Android from Settings → Updates.

Two one-time prompts on first install, both expected:

- **Windows** — the installer is not code-signed, so SmartScreen shows
  *Windows protected your PC*. Choose **More info → Run anyway**.
- **Android** — you have to allow your browser or file manager to install apps.
  Grant the same permission to Dynasty Command Center itself so it can install
  its own updates later.

## What it does

Both apps are full workspaces. The only asymmetry is who writes the save file:
the PC does, and every edit from either app enters one shared queue that the PC
agent applies after a backup, once the game closes and the save unlocks.

| Section | |
| --- | --- |
| **Wire** | Generated news feed. Stories carrying a proposed effect can be approved into the queue or dismissed. Program heat and its threshold sit in the header. |
| **National** | Top stories, scores, statistical leaders, standings. |
| **Recruit** | Your board with each recruit's own top-3 school order and the interest-cutoff rule, the full national prospect pool with search and filters, class ranks, and a prospect editor. |
| **Team** | Any program. Schedule with write-recap, roster editor, depth chart, and a trade builder that makes an over-85 trade impossible to submit rather than failing it. |
| **Tamper** | Gated to week 11. Live conversations scored against the player's dealbreaker, your role promise, and whether the NIL number is a real raise. Contact carries heat, and a badly handled exchange burns the line. |
| **Coach** | Career record, titles, players drafted, timeline, honors, and the off-the-books entry point. |
| **Queue** | Everything approved or edited from either app, held or applied, with the agent log. |
| **Export** *(Windows)* | Draft class → Madden and roster → Play Now, with scrubbed export identities. The dynasty save is never modified. |
| **Devices** *(Windows)* | Cloud save, machine list, and the one-writer-at-a-time lease. |

Two themes ship in both apps: **Night Wire** (default) and **Field Office**,
switchable in Settings.

## Current state

**Both apps start empty and stay empty until a save reaches them.** Nothing here
invents a dynasty on your behalf.

Neither of the two pieces that would bring real data in exists yet:

| Piece | What it does | Status |
| --- | --- | --- |
| **PC save agent** | Reads `DYNASTY-*.sav` on the gaming PC, parses it into structured data, and applies queued writes back after a backup | **Not built.** Blocked on the save format — see below |
| **Relay** | Small service on the home server holding the dynasty, the shared queue, media and the save lease; the phone reads from it and the PC pushes to it | **Not built** |

What *is* built is everything above those: the full UI for all sections on both
platforms, the queue and its state machine, the interest and trade rules, the
tampering conversation engine, both themes, and the install/update pipeline.

To see how the screens work, Settings → **Load sample dynasty** loads a
generated 24-program, 3,200-prospect universe. It is invented data, labelled as
such, and never loads on its own.

### The blocker

The EA College Football 27 save is an undocumented binary format. Until there is
a way to read it — reverse engineering, an existing community parser, or an
import path that sidesteps the file entirely — no real dynasty can reach either
app. That decision shapes everything else, so it is the next thing to settle.

## No licensed content

Every school is a fictional monogram, every player is generated, and no real
names, marks or likenesses are bundled. The badge slots are image slots: a
future PC agent can extract logos from your own game install and serve them from
your home server, with the monogram as the fallback.

## Repository layout

```
apps/desktop/          Electron + React + TypeScript (Windows)
apps/android/          Kotlin + Jetpack Compose + Material 3
shared/tokens.json     Design tokens both apps build from
shared/data/           The generated seed dynasty (committed, deterministic)
shared/fonts/          Bundled OFL typefaces
scripts/               Data generation, asset sync, versioning, releases
design/                The original design handoff, for reference
docs/RELEASING.md      How to cut a release
```

## Building it yourself

```bash
# Windows app
npm --prefix apps/desktop ci
npm --prefix apps/desktop run dev     # dev server
npm --prefix apps/desktop run dist    # installer into apps/desktop/release

# Android app
cd apps/android && ./gradlew assembleRelease
# apps/android/app/build/outputs/apk/release/app-release.apk
```

Building the Windows installer requires Windows (or Wine); CI builds it on a
Windows runner.

## What CI checks

Every push runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml), which
builds both apps and then tries to *use* them — building is not the same as
working, and the difference is where the bugs live:

| Check | Catches |
| --- | --- |
| Desktop smoke test | Boots the real Electron app under Xvfb and clicks through all ten sections, asserting each renders. A blank window or a section that throws on mount. |
| Android launch test | Installs the release APK on an emulator and opens it, failing on a crash, an exited process, or an app that never draws a window. A startup crash — the kind where the APK installs perfectly and dies when you tap it. |
| Font check | A bundled font that is not the format its extension claims. Google Fonts serves a format chosen from the user agent, and the wrong one yields EOT named `.ttf`, which Android cannot load. |
| APK signature | A change to the signing key, which would stop new APKs installing over an installed one. |
| Dataset and version sync | A committed dataset that no longer matches its generator, or per-platform versions drifting from the root `package.json`. |

## Releasing

See [docs/RELEASING.md](docs/RELEASING.md). In short: describe the change under
`## [Unreleased]` in `CHANGELOG.md`, run `npm run release -- patch`, and push the
tag. The tag build publishes both artifacts to a GitHub Release with that
version's changelog section as the notes.
