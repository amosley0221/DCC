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

Both apps run against a deterministic seed dynasty — 24 fictional programs,
2,040 players, 3,200 prospects, a full schedule — bundled with the app. Every
screen, edit and conversation is live against that data, and the queue,
approvals and edits persist across restarts and updates.

The relay service (LLM story generation, the shared cross-device queue, cloud
save, media) is **not built yet**. Story generation and the tamper conversations
run on a local engine instead, so nothing depends on a server being up. That
engine scores the same signals the relay's model is given — the dealbreaker, the
offer, the depth-chart slot — so wiring the relay in later changes where the
prose comes from, not how the screens behave. The PC save agent that reads and
writes `DYNASTY-*.sav` is likewise not built; the Queue and Devices sections
model its states so the flow is complete end to end.

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
Windows runner. Both apps are also built on every push — see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Releasing

See [docs/RELEASING.md](docs/RELEASING.md). In short: describe the change under
`## [Unreleased]` in `CHANGELOG.md`, run `npm run release -- patch`, and push the
tag. The tag build publishes both artifacts to a GitHub Release with that
version's changelog section as the notes.
