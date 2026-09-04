# Changelog

Every release on the [releases page](https://github.com/amosley0221/DCC/releases)
carries the notes for its own version, taken from this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- A new release could take up to six hours to surface in the Windows app, which
  was the check interval. It now checks every 30 minutes, and again whenever the
  window regains focus (throttled to once every 5 minutes).
- The updater could drop its own notification. The main process reports status
  to the window as soon as it has it, but the interface only subscribes once it
  has mounted — an event arriving in between was lost with no replay, and the
  next check was hours away. The last status is now kept and replayed to the
  interface when it subscribes.

## [0.7.0] - 2026-09-04

### Fixed

- The dictionary scan stopped at the first zstd dictionary in each file and
  moved on. The game executable embeds several, so the one the save needs was
  being skipped. It now enumerates every dictionary in every file and reports
  each with its id.

### Added

- Candidate dictionaries are now **verified** rather than guessed at: the scan
  takes a real frame out of the save and tries to decompress it, sweeping
  candidate dictionary lengths, and only reports a match when a frame actually
  decodes. The scan also reports how many dictionaries it saw in total.

## [0.6.0] - 2026-09-04

### Added

- The save report now counts the **zstd frames** inside the payload and names
  the dictionary they were compressed against, and says whether that dictionary
  is present in the save. For a real College Football save it is not: 15,408
  frames all point at dictionary `0x65fc508b`, which ships with the game.
- **Search game folder for it…** walks a chosen install directory looking for
  that dictionary, either as a file starting with the zstd dictionary magic or
  as any file containing the id.

## [0.5.0] - 2026-09-04

### Added

- **Compare two saves** in the Save section. Pick a second save and it lists
  every byte that differs between the two decompressed payloads, with the bit
  that moved. Because the payload turns out to be deterministic, changing one
  thing in-game and comparing reads that field's location straight off — the
  first such test differed by exactly one byte in 31 million.

## [0.4.0] - 2026-09-04

### Added

- **An update prompt in the Windows app.** When a new version is published, a
  small panel appears in the corner with the version and its release notes, a
  **Download** button with live progress, and **Restart and install** once it has
  finished. Dismissing it hides that version until a newer one arrives; the
  titlebar keeps a quiet marker either way, and Settings → Updates does the same
  thing for anyone who dismissed it.

### Changed

- Updates no longer download on their own. The app used to pull ~80 MB in the
  background without saying so; now it asks first and the download is a
  deliberate click.
- The app checks for updates shortly after launch and every six hours, instead
  of only once at startup.

## [0.3.1] - 2026-09-04

### Fixed

- The save analyser reported a real College Football save as an unrecognised
  container. Its `FBCHUNKS` test compared a nine-byte slice against an
  eight-character string, so the one format that matters never matched. It now
  identifies the container and reports the game build, save timestamp, inner
  payload magic and inflated size.

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
