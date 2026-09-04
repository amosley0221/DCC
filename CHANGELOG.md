# Changelog

Every release on the [releases page](https://github.com/amosley0221/DCC/releases)
carries the notes for its own version, taken from this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.21.2] - 2026-09-04

### Added

- **The scan export lists every table in the save** — all 88 stores with their
  row and member counts. The save declares them itself, and the counts agree
  with the game's published schema, so this is the index for everything still
  to be read: the season's games, the interest table, player stats by game,
  season and career, and 38,400 history entries.


## [0.21.1] - 2026-09-04

### Fixed

- **0.21.0 did not build.** Importing the team-name table from the save reader
  pulled `node:zlib` into the browser bundle with it, and the renderer build
  failed. The table now lives in its own module with no imports at all, which
  is what a shared constant should have been from the start.


## [0.21.0] - 2026-09-04

### Added

- **Every team is named.** All 138 rosters now carry their school, so Team opens
  on *Penn State*, *Ohio State*, *Alabama* rather than *Team 74 — name it*.
  Renaming still works and still wins, for a dynasty that has moved things
  around.

  The names come out of the save. Every recruit carries a top-ten list of
  schools stored as team id and interest, and the game's own class export names
  those schools — so matching 4,037 of 4,100 lists names every id by majority
  vote, no id agreeing below 88% and no school claimed twice. Team 74 comes out
  as Penn State, matching the id its players already carried.


## [0.20.0] - 2026-09-04

### Added

- **Conference, division and head coach for all 138 teams.** The save keeps
  them in a table of its own, keyed by the same team id the players carry, and
  Team now shows them beside every roster — so an unnamed team reads as *SEC,
  coached by J. Simon* rather than just *Team 47*.

  Naming a team shows its conference and coach in the prompt, which narrows 143
  schools to a handful.

  Confirmed by the only pairing available: Penn State's players all carry team
  id 74, and row 74 of the table is their coach with the Big Ten. The
  conference sizes are the game's own — Big Ten 18, ACC 17, SEC and Big 12 16,
  Sun Belt and American 14, MAC 13, MW and CUSA 10, Pac-12 8, Independent 2.


## [0.19.1] - 2026-09-04

### Fixed

- **A team was missing.** DCC listed 142 schools where the save holds 143. The
  team records sit in one contiguous run and the reader required each to follow
  503 bytes after the previous one, which silently discarded the first record of
  the run. That was Air Force.


## [0.19.0] - 2026-09-04

### Added

- **Teams carry their real names.** The 503-byte team record holds a full name,
  an abbreviation, a nickname, a short nickname and an alternate abbreviation
  at fixed offsets, and DCC was reading only the short display name. The school
  picker now shows the full name and nickname — *Appalachian State
  Mountaineers* rather than *App St.* — and searching finds a team by any of
  them, so typing `BAMA`, `Tide` or `Crimson` all land on Alabama.

  Logo matching uses them too. The art is named from the full name, so trying
  the full name before the alias list means fewer schools depend on an alias
  being right.


## [0.18.2] - 2026-09-04

### Fixed

- **Portraits render.** They were matching correctly — 15,798 of 16,448 players
  — and then being refused by the app's own content security policy, which
  listed no custom scheme under `img-src`, so every face arrived and was thrown
  away as a broken image.

  The smoke test now writes a real PNG into a folder, indexes it, and loads it
  through the same scheme the app uses, failing if the image does not decode.
  Checked against the broken policy first: it reports exactly this failure, so
  it cannot pass by accident.


## [0.18.1] - 2026-09-04

### Added

- **Portraits on the Team roster.** They were being matched all along — 7,668
  distinct faces for the 11,730 players on rosters — but only Recruit displayed
  them. Choosing the art folder once now shows faces everywhere.

- **The game's own player id is readable** (bit 191, 14 bits), exact against all
  4,026 unambiguous recruits in the class export. This is the key that tables
  outside the player record use to name a player, so it is the way in to
  recruiting stage, commit score, offers and school interest — none of which are
  in the player record. Earlier searches for those tables failed because they
  traced the record index, which nothing outside the record refers to.


## [0.18.0] - 2026-09-04

### Added

- **Recruits carry their real details now:** star rating, archetype, class
  year, development trait, height, weight, home state, pipeline, NIL demand,
  dealbreaker and ideal pitch. Filter by stars, search by town, state, pipeline
  or archetype, and open a recruit for the rest.

  Each of these was solved against a 4,100-row export of the game's own class
  for the same save, and each agrees with it on all 4,026 recruits whose names
  are unambiguous — exactly, not approximately.

  The same export confirmed two things from outside this project. Bit 658, which
  0.17.3 shipped as provisional, keeps all 4,100 of the class and admits 8 that
  are not: 99.82%. And the rating map is right — overall, position, hometown and
  every rating the export carries agree on 4,068 of 4,100, the 32 exceptions
  being duplicate names paired to the wrong record.

  Recruiting stage, gem/bust, commit score and total offers are still absent.
  They are not in the player record at all.


## [0.17.3] - 2026-09-04

### Fixed

- **Carter Landry and Dorian Exum are gone from the recruiting list**, along
  with 418 others who were in the pool without being prospects. What is left is
  4,108 recruits where the game itself counts 4,100, and the eight best are the
  same eight the game lists at the same ratings.

  This rests on a bit that is provisional and is labelled as such. It is not an
  "is a recruit" flag — no such field exists in the player record, which was
  checked exhaustively — so it only does this job once a player is already known
  to be off every roster and generated by the game.


## [0.17.2] - 2026-09-04

### Fixed

- **Recruit shows recruits.** The tab is `RECRUITS` again, and it is now backed
  by evidence rather than by a guess: checked against a class list from the same
  save, 28 confirmed recruits all carry a generated face and 10 confirmed
  departed players all carry an authored one, with no errors either way. The
  0.17.1 wording hedged this on the strength of two outliers, which
  under-reported what the split actually does.


## [0.17.1] - 2026-09-04

### Fixed

- **Recruit no longer calls anything a prospect.** Splitting the unrostered
  pool by authored versus generated faces removed the real players — Toney,
  Baugh — but not generated players who have left, and those rate above every
  real recruit: 89 and 86 in one save against a best prospect of 83. The tabs
  now say what is actually being read, `GENERATED` and `REAL PLAYERS`, and the
  screen states plainly that the second group still contains players who are
  gone.

  A field marking a live recruit was searched for across every 1-, 2- and
  3-bit position in the player record. Fifty-six fitted the known outliers and
  every one failed on data it was not fitted to — the best, bit 1306, is also
  set on 6,682 of 11,730 rostered players. Recorded in `docs/SAVE-FORMAT.md`
  as a negative result rather than shipped as a guess.


## [0.17.0] - 2026-09-04

### Added

- **Team art: logos, helmets, jerseys, coach polos.** All 143 schools in a Penn
  State save match, abbreviations included — the save says `California`,
  `MTSU`, `Miami (OH)`, `Hawai'i`, and the art says `CAL`, `MidTennState`,
  `MiamiUniversity`, `Hawaii`. Names are matched on the school after stripping
  punctuation, with an explicit list for the abbreviations, which cannot be
  derived. Anything unmatched is reported rather than guessed at: a logo on the
  wrong team is worse than no logo.

### Fixed

- **Recruit was listing players who are not recruits.** Everyone off a roster
  lands in one pool, and that pool also holds real players who left — which is
  why Malachi Toney at 99 and Jadan Baugh at 95 were sitting on top of a
  recruiting list. They are now separated: 4,527 generated players (the
  recruits) from 180 real ones in a Penn State save, told apart by the face the
  save names for each, since generated players carry a `Generic_` face and real
  players an authored `Unique_` one. Prospects show by default, with tabs for
  the others.

  This is an inference from the asset id, not a class field — the save's own
  class and recruiting stage are still unmapped, and the screen says so.


## [0.16.1] - 2026-09-04

### Added

- **The scan export now describes your art folder.** Every folder inside it,
  with file counts, sizes and a handful of real filenames from each, plus any
  asset ids in your save that have no image. That is what makes a category of
  art usable — helmets, logos, awards and bowls each name their files
  differently — and it travels as a few kilobytes of text instead of as the
  images, which stay on your machine where they belong.


## [0.16.0] - 2026-09-04

### Added

- **Recruit faces.** Point DCC at a folder of extracted art and every recruit
  gets their face, because the save already names it. The portraits are dumped
  as `nilpp_Generic_0877_P_T0042_H_6_3` and the save calls the same face
  `Generic_0877_P_T0042_H_6_3`, so the id is matched inside the filename rather
  than against the whole of it — an exact-name match would find none of them.

  The folder is indexed by name only. Portraits alone run to 786 MB, so nothing
  is copied and no image is read until something displays it. Rows without a
  match show initials rather than a stand-in face, and the card reports how many
  of your players matched so a folder that does not fit is obvious immediately.

  Art is read from your own machine and never leaves it — none of it is copied
  into DCC or its repository.


## [0.15.1] - 2026-09-04

### Added

- **_Find the art_ now searches for the names the save actually uses.** Every
  player record carries the name of its own art: real players as
  `Unique_AdamsAmare_1`, generated players — every recruit — as
  `Generic_0877_P_T0042_H_6_3`, which is a head index, the team the face was
  generated for, a skin tone of D/H/T/M, and two more variants. The scan looks
  for those exact strings and reports them apart from the keyword guesses,
  because a name in the save's own scheme is what joins a recruit to a face.


## [0.15.0] - 2026-09-04

### Added

- **Recruit reads your save.** Every player the save does not put on a roster
  sits in one pool — the 138 schools hold exactly 85 each, and the rest are
  recruits and the portal. In a 2027 Penn State save that is 4,718 players,
  with names, positions, hometowns, overalls and all 53 ratings already
  readable. Searchable, filterable by position group, sorted on the save's own
  overall, and a row opens to its full rating card.

  These are the same recruits other dynasty trackers show. Checked against a
  live 2028 dynasty: Ty Merritt, MLB, Burton; Matt Ambrose, RE, Gainesville;
  J.D. Kaesviharn, QB, Logansport — name, position and hometown all matching.

  Star rating, class, archetype, recruiting stage, commit score and school
  interest are not readable from the save yet, so they are left out rather than
  invented.


## [0.14.2] - 2026-09-04

### Fixed

- **The tables decode correctly now.** 0.14.1 read the key out of the file
  header, which was the right idea and still gave the wrong answer: the key is
  stored masked by a constant, and using the wrong constant produces output
  that keeps every run and repetition of the real thing while being wrong in
  every byte. Runs of `{{{y{` were always runs of zeros; `HIJHHNLCCLIO` was
  always `321335788724`. The reader now recovers that constant from the data
  instead of assuming one — padding decodes to zero when the key is right, so
  the most common byte in the output *is* the constant.

- **A key read from the header no longer wins just for being in the right
  place.** On `layout.toc` the header does not hold the key, but the decode it
  produced still cleared the old acceptance bar with 240 long printable runs of
  pure noise, and because 0.14.1 stopped as soon as the header path answered,
  the search that reads that file correctly never ran. Both paths are now
  scored on the same scale — how much of the output is padding, and whether
  known words appear — and the better one wins.


## [0.14.1] - 2026-09-04

### Fixed

- **_Find the art_ no longer freezes the window.** It ran for about thirteen
  minutes on a full install, all of it on the thread that draws the app, so
  Windows greyed the window out and reported it as not responding. It now
  finishes in seconds and lets the window repaint between files, so the app
  stays usable while it works.

- **The key is read from the file instead of being guessed at.** Frostbite
  stores it in the obfuscation header — 257 bytes at `0x128`, with the payload
  starting at `0x22C` — and reading it takes about four milliseconds and is
  exact. The old code went straight to cryptanalysis, which is what made it
  slow, and worse, a search can fit a wrong key to the data: the same
  `layout.toc` was reported as a 17-byte key one run and a 13-byte key the
  next, and at most one of those could have been true. The search is still
  there for files that do not carry a usable key, and the scan now says which
  of the two produced the answer, so a guess is never presented as a reading.

## [0.14.0] - 2026-09-04

### Added

- **The bundle tables can be read, and they name the art.** *Find the art* in
  the Game art card unscrambles every table in the install and reports what the
  assets are called — logos, uniforms, portraits, coach heads, cranium faces.
  Names are what make a particular logo findable later, so this is the step that
  turns the archives from opaque into addressable.

### Fixed

- **Key recovery is now exact.** Two things were wrong. The test for "this
  decoded" counted four-character runs, which noise produces by the hundred
  while real text produces fewer and much longer ones — a table of 1,840 asset
  names scored below the noise floor and was rejected. And picking the
  best-scoring key length always chose a multiple of the true one, because a
  longer key has more free bytes to fit noise into looking like text. Judging on
  long runs, and taking the shortest key within a margin of the best rather than
  the best outright, fixes both: across key lengths of 17, 128, 257, 260, 512
  and 1024 every decode is now byte-exact, and eight of eight random files are
  refused.

## [0.13.1] - 2026-09-04

### Fixed

- **The table unscrambler was reporting success on noise.** v0.13.0 said it had
  solved both of the game's tables. It had not: the readable-text threshold it
  judged by was forty runs, and random bytes produce about eight hundred. Both
  "solutions" were the noise floor. The strings it printed were visibly
  gibberish, which is what gave it away.
- **It now recovers the key from the file instead of guessing offsets.** A
  repeating XOR key leaves two fingerprints, and both are in the data: bytes one
  key-length apart agree far more often than chance, which gives the length, and
  the right byte for each key position is the one turning its column into the
  NULs and ASCII these tables are made of. Nothing is assumed about where the
  key is kept.
- **The bar is now set above noise, not below it.** A solve needs several times
  the printable runs noise gives, plus runs long enough that noise essentially
  never makes them. Across six trials of random data with the right magic
  bytes, it now reports nothing — where the old check passed every time.
- **It says how confident it is.** The report gives samples per key byte;
  below about forty the key can be imperfect, and it says so rather than
  presenting a shaky result as a clean one.

## [0.13.0] - 2026-09-04

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
