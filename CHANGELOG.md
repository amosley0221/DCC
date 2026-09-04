# Changelog

Every release on the [releases page](https://github.com/amosley0221/DCC/releases)
carries the notes for its own version, taken from this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.3.0] - 2026-09-04

### Added

- **Save section in the Windows app** — the first step towards reading a real
  dynasty. Point it at your `DYNASTY-*.sav` and it reports the container format,
  a SHA-256, an entropy profile across the file, any embedded deflate streams it
  can decode, and the readable strings inside them. It is read-only; the only
  files it writes are a backup copy and an exportable Markdown report.

  The report is the point: it carries the structure of the format without
  carrying the save itself, so the file never has to leave your machine.

## [0.2.0] - 2026-09-04

### Changed

- **Both apps now start empty.** They previously opened straight into a bundled
  sample dynasty, which looked like real data and was not. Every section shows a
  "no dynasty loaded" state until a save actually reaches the app, and the
  sample is an explicit, clearly-labelled choice in Settings.
- **Night Wire is black, white and red.** It was a warm near-black with cream
  text and a brick accent, with amber on stars and ratings — which read as
  brown and orange. Amber is now reserved for caution and held status; stars,
  titles and first-round picks are red, and highlighted ratings are white.
  Field Office keeps its warm palette.
- Status indicators tell the truth. The desktop sidebar no longer reports
  "save verified" and "relay · phone" in green when no agent, save or relay
  exists, and the queue header no longer claims a PC is holding the save.

### Added

- A Relay card in Settings on both apps for the home-server address and pairing
  token, with the state persisted. The relay service itself is not built yet and
  the card says so.

## [0.1.1] - 2026-09-04

### Fixed

- **The Android app crashed on launch.** The bundled typefaces were not fonts:
  Google Fonts serves a format chosen from the request's user agent, and the one
  used to fetch them was old enough to be served EOT — an Internet Explorer
  format — under a `.ttf` name. Android cannot load EOT, so the app died drawing
  its first frame. All twelve font files are now real TrueType.

### Added

- `scripts/check-fonts.mjs` validates every bundled font's header and table
  directory, and CI runs it, so a wrong-format download fails the build.
- CI now installs the release APK on an emulator and opens it, failing on a
  crash or an app that is not running after launch. A startup crash cannot
  reach a release again.

## [0.1.0] - 2026-09-04

First installable build of both apps.

### Added

- **Windows app** — an Electron workspace covering every section in the design:
  Wire with approvable story effects and the heat meter, National, Recruit
  (3,200-prospect pool, the interest-cutoff rule, and a full prospect editor),
  Team (schedule with write-recap, roster editor, depth chart, and a trade
  builder that makes an over-85 trade unsubmittable), Tamper (gated to week 11,
  with a live offer-scored conversation), Coach, Queue with an agent log,
  Export, and Devices with the save lease.
- **Android app** — the same workspace on a left nav rail, with heat pinned at
  the rail bottom: Wire, National, Recruit, Team, Tamper, Coach, Queue and
  Settings, all editing the same shared queue.
- Both themes ship in both apps — Night Wire is the default, Field Office is a
  setting — with the design's five typefaces bundled so nothing needs network
  access to render.
- A deterministic seed dynasty: 24 fictional programs, 2,040 players, 3,200
  prospects and a full schedule, generated once and read identically by both
  apps. No licensed marks or real likenesses anywhere.

### Install and updates

- Windows ships an NSIS installer that upgrades over the existing install, and
  the app checks GitHub Releases on launch and can install the next version
  itself. Settings, queue and board live outside the install directory, so an
  upgrade keeps them.
- Android ships a signed APK. Every release is signed with the same key, so a
  new APK installs over the old one without uninstalling and keeps app data.
  Settings → Updates checks for and installs the next release in place.
