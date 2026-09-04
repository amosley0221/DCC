# Changelog

Every release on the [releases page](https://github.com/amosley0221/DCC/releases)
carries the notes for its own version, taken from this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The archive tables can be unscrambled.** College Football's tables of
  contents are marked `0x00D1CE01` and XOR-scrambled with a key kept in their
  own header, which is why the first scan found no readable text in them. DCC
  now works out the scheme by trying the shapes the format uses and keeping
  whichever produces readable words — a wrong key yields none, the right one
  yields hundreds. *Read the tables* in the Game art card reports what it
  managed, and the export carries it.

## [0.12.0] - 2026-09-04

### Added

- **A first step towards the game's own art.** Logos, portraits and coach faces
  are not in the save at all — they live in the game install, in Frostbite's
  asset archives, which is a separate format. Save now has a *Game art* card
  that finds your install, describes what is in it, and exports the description.
  It decodes nothing yet and changes nothing: it is the same opening move that
  the save format needed, and the scan is what the decoding gets written
  against.

## [0.11.0] - 2026-09-04

### Added

- **A Teams tab, and any team can be named.** All 138 programmes in one list,
  strongest first, each shown by its best players so you can tell them apart.
  Name any of them from the 143 schools your save carries and it sticks, with a
  count of how many you have done. Naming is manual because the save groups
  rosters but never records which school each one is — eight ways of finding
  that link have now been tried and are written up in `docs/SAVE-FORMAT.md`.

## [0.10.1] - 2026-09-04

### Added

- **Your programme has its name on it.** Pick your roster by a player on it, then
  choose the school from the 143 your save carries — type "Penn" and it is
  there. The header, the roster and the depth chart all use the name from then
  on. The save groups rosters but does not link them to school names anywhere
  DCC can read, so this is one click rather than automatic; it is remembered.

## [0.10.0] - 2026-09-04

### Added

- **Team rosters and a depth chart.** The save's own team field is decoded, so
  Team now shows one programme instead of the whole country: 138 rosters of
  exactly 85 players, the scholarship limit, plus the 4,718 recruits and portal
  players who are on nobody's roster. The depth chart lists every position group
  in overall order.
- **Pick your programme once.** The save groups rosters but does not name them
  anywhere DCC can read yet, so you find yours by typing a player on it. It is
  remembered from then on.

## [0.9.2] - 2026-09-04

### Fixed

- **All 53 ratings are now confirmed.** The five pairs the app warned it could
  not tell apart are settled by a save raising one member of each. Three were
  the other way round: 785 is Medium Throw Accuracy not Short, 906 is Run Block
  Finesse not Power, and 817 is Stiff Arm not Trucking. Power Moves and Change
  of Direction were already right. The caveat about unverified pairs is gone,
  because there are none.
- **Release was reading the wrong field.** Two positions both read 43 for the
  player whose card built the rating map, and the solver picked between them
  arbitrarily. It picked wrong: the one it chose reads about 34 for every
  position in the game, which no receiver rating does. The right one reads 72
  for wide receivers, 69 for tight ends and 43 for linemen.

## [0.9.1] - 2026-09-04

### Changed

- **The roster lives inside Team, where the design puts it.** It shipped as a
  separate nav section, which was not what was asked for: the design has Team
  scoped by a team picker with roster, depth chart, schedule and trade beneath
  it. Team now carries those four tabs and reads your save; the standalone
  Roster section is gone.
- **The player list says whose players these are.** It lists every player in the
  dynasty — all 240 programs — because which school a player belongs to is not
  decoded yet. Headed `16,448 PLAYERS — READ FROM YOUR SAVE`, that read as your
  roster, which is why the best players in it were strangers. It now says
  `EVERY SCHOOL` and opens with a note explaining why there is no team picker.

## [0.9.0] - 2026-09-04

### Added

- **A Roster section.** Every player in your dynasty, sorted best first, filtered
  by position, searchable by name. Click anyone for their full card — all 53
  ratings with bars. The position counts are live: 955 quarterbacks, 2,325 wide
  receivers, 322 kickers.
- **Position and overall are decoded.** Position is a 21-value field, and each
  group profiles exactly as it should — the five offensive line slots average 82
  Strength and 76 Pass Blocking, the two kicker slots average 82 Kicking Power
  and nothing else above 40. Overall tracks whichever ratings its position is
  judged on, plus Awareness throughout.

### Changed

- **Empty sections say what they are actually waiting for.** They used to blame
  a missing save agent, which is no longer true — the app reads the save
  directly. Each one now names the specific piece of the format it still needs:
  Team wants the player→team link, Wire wants the storyline objects, Tamper
  wants writing, which is deliberately not attempted yet.

## [0.8.4] - 2026-09-04

### Fixed

- **The roster has its own panel.** It was rendering inside the compression
  dictionary card, wedged between that card's description and its buttons, which
  made the most useful thing in the section look like a footnote to the least.
  It now sits above the dictionary, where it belongs.
- **The status line stops saying the fields are unmapped.** With a roster read,
  the title bar gives the player count and the sidebar reads `ROSTER READ`. It
  still claimed `FIELDS NOT MAPPED YET` while showing 53 mapped ratings.

## [0.8.3] - 2026-09-04

### Added

- **DCC reads your roster.** Every player in the save — 16,448 of them — with
  name, hometown, redshirt status and all 53 ratings, in about a fifth of a
  second. The Save section has a searchable list; look up any player and see
  their card as the game has it.

### Changed

- **The analysis notes no longer warn about a dictionary you already have.**
  The line about the frames stated that they could not be decompressed without
  the dictionary, which kept reading as a problem after the dictionary was found
  and loaded. It now just says where the dictionary lives; whether DCC has it is
  the dictionary panel's job to report, and it does.

## [0.8.2] - 2026-09-04

### Fixed

- **The save stays loaded when you switch sections.** Choosing a save, visiting
  any other section and coming back showed an empty panel and asked for the file
  again. The analysis lived inside the Save section, so leaving it threw the work
  away. It now lives above the menu and survives navigation.
- **The save reopens on launch.** The app remembers the last save it analysed
  and reads it again on startup, including across an in-place upgrade, instead
  of starting empty every time. If the file has moved, it is quietly forgotten
  rather than reported as an error.

### Changed

- **The status line says what has actually happened.** With a save analysed, the
  title bar named the file and the sidebar reads `SAVE ANALYSED`. It used to say
  `NO DYNASTY LOADED` either way, which read as though opening the save had not
  worked — it had; DCC just cannot turn a save into a dynasty yet, because the
  fields are still being mapped. The title bar now says so explicitly.
- **The dictionary card stops telling you to go hunting once it has been found.**

## [0.8.1] - 2026-09-04

### Fixed

- **"Find it automatically" now actually finds the dictionary.** It reported
  "Checked 6 dictionary file(s); none decoded this save" even when the correct
  dictionary was sitting right there. The search and the verification were both
  fine — the app itself could not decompress zstd. Electron 33 bundles Node 20,
  which has no zstd support at all, so every decode threw before it began and
  each failure was misread as "wrong dictionary". The app now runs on Electron
  37 (Node 22.21), which has it. Loading a dictionary by hand and searching a
  folder for one were broken by the same cause and are fixed with it.
- **A runtime without zstd says so.** Rather than blaming the dictionary, the
  app now reports plainly that the build cannot read compressed frames. The
  startup test fails if the runtime ever loses zstd again, so this cannot ship
  unnoticed a second time.
- **Dictionary verification tolerates coincidence.** A frame's four magic bytes
  turn up by chance inside compressed data, and those false frames never decode.
  Verification previously demanded that every candidate decode and so could
  reject the right dictionary over unlucky bytes; it now asks that the large
  majority decode. A wrong dictionary is still rejected outright — it decodes
  nothing.

## [0.8.0] - 2026-09-04

### Added

- **The save's compressed frames can now be read.** All 15,408 frames in a real
  College Football 27 save decode — 6.8 MB of object data that was previously
  opaque — using the game's zstd dictionary.
- **The dictionary is found automatically.** Opening a save searches the likely
  places for it, verifies each candidate against that save so a wrong one is
  never adopted, and keeps the right one with the app's settings. In testing it
  picked the correct dictionary out of three siblings in 47 ms. There is still a
  manual picker for the case where it is somewhere unusual.
- Comparing two saves now diffs the **decoded** frames as well as the raw
  payload, which is far sharper: one rating edit went from 150 scattered bytes
  to four bytes inside a single frame.

### Fixed

- **The dictionary check accepted the wrong answer.** It treated "decompression
  did not throw" as success, but zstd emits the declared number of bytes with a
  wrong dictionary too — in a controlled test, 192,711 candidate lengths did not
  throw and exactly one was correct. Candidates are now scored on whether the
  frames they decode look like game data at all, across six frames sampled from
  across the save, and the sweep steps a byte at a time near a promising length
  rather than in 256-byte jumps that step over the answer. On a synthetic
  dictionary this picks the exact length as its top candidate in under a second.
- The scan reports its best few candidate lengths with a preview of what they
  decode to, so a near miss is visible rather than silently reported as failure.

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
