# Changelog

Every release on the [releases page](https://github.com/amosley0221/DCC/releases)
carries the notes for its own version, taken from this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.52.0] - 2026-09-06

### Added

- **School crests on every recruit row**, on both apps, in the place the hidden
  overall was sitting on its own.

  A committed or signed recruit shows one crest — the school that got him. The
  race is over, and the interest numbers behind a settled recruit are last
  week's news. Everyone else shows the three schools still in it.

  A soft commit counts as still in it and keeps all three, because that is
  exactly the recruit worth a second look.

  The overall keeps its slot beside them, so rows do not shift as you scout.

## [0.51.0] - 2026-09-06

### Added

- **A recruit's ten schools, with the interest each has built.** The thing the
  game shows on its own board, on both apps. It reads against the leader rather
  than as a bare number, because 244 means nothing until you can see that
  somebody else is on 976.

  This was decoded a while ago and never wired up — the interest table says
  which schools without ever saying which recruit. The recruit's own record
  supplies the rank, which is the join, so the list finally has a name on it.

- **Editing a recruitment.** Stage, commitment and any school's interest can be
  written back to the save, the same way a player's ratings can.

  The record shares its twenty-four bytes with fields DCC has not named, so the
  writer refuses rather than trusting itself: no byte outside the edited bits may
  differ, the rebuilt save must inflate back byte for byte, and every field must
  read back as the value asked for — including the three ranks and the offer
  count, which are never edits, and whose moving would mean the write went
  somewhere it should not have. A copy of the save is kept first.

  On a real save, changing one recruit's stage, commitment and one school's
  interest moves five bytes in thirty megabytes: three in his record, two in the
  interest table, and nothing at all for the other 4,099 recruits.

  A school can be moved up or down the list but not added to it. The game
  decides who is on a recruit's list, and writing an eleventh would mean pushing
  one off.

### Changed

- The stage names and the record's bit positions now live in one place instead
  of being written out again in the reader, the writer and the screen.

## [0.50.0] - 2026-09-06

### Added

- **The recruiting board, read out of the save.** National rank, position rank,
  state rank, commit score, total offers and stage — the game's own numbers, for
  all 4,100 prospects, on both apps. Recruiting now opens in the order the game
  puts them in rather than by stars, each row shows its rank and how far along
  the recruitment is, and opening one shows the rest.

  Checked against the game's own class export on three saves — two a week apart,
  one from a different session. Every field, every recruit, exact. (One save
  disagrees on the offer count for two prospects; that save and its export were
  not taken at the same moment.)

  Worth saying how, because three searches failed first and failed the same way.
  Sweeping for a rank-ordered array holding the commit score found nothing.
  Sweeping for one keyed on which recruits changed between two saves a week
  apart found nothing either — and that one settles it, because the exports show
  688 stage changes to find. The records are not in rank order, which also
  disposes of the assumption that the ten-schools blocks being in rank order
  implied it. What worked was to stop hunting the fields and hunt the link: the
  Heisman table writes a player as a tag and a row, so every player reference in
  the save can be listed. There are 25,266; exactly 4,100 point at prospects,
  they sit together, and they are 24 bytes apart.

  This also finishes school interest. A recruit's ten schools were already known
  to sit at row `(rank - 1) * 10 + 1`, but nothing said whose ten they were.
  Their own record gives the rank, so the two join up.

## [0.49.2] - 2026-09-06

### Fixed

- **Leaving the Save screen and coming back froze the app for a minute.** The
  window went *Not Responding* because the poll search runs on the process that
  draws it, and it was running on the way in — rediscovering polls that were
  already found and kept.

  Two faults, both fixed. It should not have been searching at all: with CFP,
  Coaches and Media all named there is nothing left to find, so it now only
  looks when one is missing, and it remembers the last search so returning shows
  it instantly.

  And the search should never have been slow. Every read of a field starts by
  locating the store header, and locating it walks the whole save. Once is
  nothing; the sweep reads a field at every bit position and width, so it did it
  sixteen thousand times — seventeen seconds on a thirty-megabyte save, and
  longer on a real one. The header is found once per save now. The same sweep
  that took 16.9 seconds takes under a tenth of one, and every other reader in
  the app got faster with it.

  check-save fails on the old code: it asserts the directory is found once, and
  puts a five-second ceiling on a sweep that used to take seventeen.

## [0.49.1] - 2026-09-06

### Fixed

- **A ranking you chose was gone by the next screen.** Not lost on restart —
  lost on the next keystroke anywhere in the app. The renderer saves its whole
  state to the settings file whenever anything changes, and it wrote *over* the
  file rather than into it, so the keys the main process keeps there — the polls
  found in your save above all — were wiped by an unrelated click.

  Settings are merged now, and the smoke test writes one key from each side and
  fails if either disappears. It fails on the old code, which is the only way to
  know a test for this is worth having.

- **"Read the roster again" asked for a button that does not exist.** Once the
  roster is read there is nothing to press. Choosing a poll now applies it on
  the spot: the save is re-read and it is in League immediately.

- **The finder started over every time you left the screen.** The ranks you
  typed are remembered, and the search runs itself when you come back, rather
  than showing an empty box beside polls that are already kept.

## [0.49.0] - 2026-09-06

### Added

- **The game's own type schema is in the repository.** 3,526 types with member
  names, declared ranges and full enum tables, matching the version the saves
  themselves announce. It should have been here all along; it was read once in
  an earlier session and never committed, and everything since has been done
  without it.

  Click any table on the Save screen and it now says what the game calls the
  thing it holds, member by member, with each one's range and enum values. A
  store that reported "four members" is now `CurrentRank (0..5)`,
  `LastWeekRank (-1..5)`, `Player`, `Team`.

- **The poll finder knows what it is looking for.** The schema says a team
  carries nine rank fields — a CFP, media and coaches rank, each with a
  last-week twin, plus two hidden copies and a preseason poll — so a search
  turning up nine orderings is the right answer rather than noise. The screen
  lists them.

### Changed

- **The docs say plainly what the schema does not settle.** It gives no offsets,
  and three orderings were tested against the 38 rating positions already known
  — index order, declaration order, and declaration order with byte alignment.
  None reproduces them; declaration order agrees on 6 of 37 gaps, which is
  chance. Fields are still found by their values. What the schema changes is
  that the search now has an answer key.

## [0.48.1] - 2026-09-06

### Added

- **The art folder will tell you what is in it.** Searching for "stadium" comes
  back empty, which means the stadium art is called something else, not that it
  is missing. The art screen now lists the folders it indexed with a few real
  filenames from each — the question "what are these called" is answerable from
  the index DCC already built, rather than from Explorer.

## [0.48.0] - 2026-09-06

### Added

- **All three polls, named, the way the game keeps them.** Your save holds the
  CFP, media and coaches rankings and they disagree with each other — which is
  why the game's own screen switches between them. So DCC keeps all three rather
  than making you choose one: find them once, say which is which, and League
  switches between them by name.

### Changed

- **The finder stopped showing the same ranking a dozen times.** Each poll is
  stored twice over and alongside last week's version of itself, and a field
  reads the same at several widths, so one search turned up twelve rows holding
  perhaps five real orderings. It now offers each distinct order once.

  Which offset a given order was read at is not decidable from the data — a
  field reads identically wherever the bits in front of it are zero — and does
  not matter, because only values that land between one and the number of teams
  are ever used.

## [0.47.0] - 2026-09-06

### Added

- **Find the poll by pointing at a rank you can read.** Sweeping the team table
  for the shape of a ranking came back empty on a real save, and that is a
  finding rather than a failure: a poll does not leave the unranked teams on one
  tidy value, it leaves them holding whatever they held last week, so it is not
  the clean permutation the shape test wanted.

  One number settles it. Open the game, read where it ranks you, and put that in
  on the Save screen. DCC keeps the fields where your team holds exactly that
  place, at least ten programs hold ten different places, and no team holds its
  own row number — which is a counter, not a ranking. Name a second school and
  it is beyond argument.

  The field is remembered by its bit offset and width, so every later read uses
  it without being asked again, and it travels to the phone in the snapshot.

### Fixed

- **The rankings card no longer implies the save has nothing.** It said "nothing
  in this save reads as a ranking", which was the shape test's opinion rather
  than the truth. It now says what it means: nothing was found by shape alone,
  so point at a rank instead.

## [0.46.0] - 2026-09-06

### Fixed

- **The Heisman table was found and then rejected for having a spare row.** The
  game shows four names; `HeismanRankingStore` holds five rows. The check
  insisted every row resolve to a player, so the fifth — unused — failed it and
  the whole table was thrown away. Three rows agreeing is the test now, and the
  rows that do not resolve are the end of the list rather than a failure.

  Two things were added while the answer key was to hand. A candidate is only
  accepted if every player it names is **on a roster** — which alone would have
  caught the receiver on no team that topped the first attempt — and the game's
  own player id is tried alongside the save row, since a reference could be
  either.

### Changed

- **A ranking no longer has to be exactly twenty-five deep.** A poll that has
  not filled out, or a top ten, has the same shape: places one to N once each
  with everyone else on one shared value. The search accepts any N from ten up,
  and reports at most a dozen candidates so a relaxed test cannot bury the real
  one in noise.

- **Each candidate ranking shows where your own team sits in it.** You already
  know whether you are No. 1, so that is the fastest way to recognise your
  poll among several.

## [0.45.0] - 2026-09-05

### Fixed

- **The Heisman watch named five players it had no business naming.** A
  sixty-eight overall receiver on no team at all, then the next names
  alphabetically. The check was worthless: it asked only that the value be a
  valid roster row, and a save holds sixteen thousand of those — so a column
  counting 0, 1, 2, 3, 4 sailed through and the "shortlist" was the first five
  rows of the player table.

  A reference in this format is a two-byte type tag and a two-byte index, so the
  tag is the thing worth insisting on: it must be the same across all five rows
  and large enough to be a type id rather than a small number that happens to
  sit there, the five indices must be five different players, and they must not
  be the first five in the table. When nothing passes, DCC now prints the five
  rows as raw numbers and says the column is not placed, rather than naming
  people it cannot vouch for.

- **No ranking was found because the search was reading bytes.** This save is
  bit-packed everywhere else — the entire player record is — so a rank that
  needs eight bits sits wherever the field before it ended, not on a byte
  boundary. The search now runs over every bit position at every width from five
  to twelve, which is where a ranking of 143 programs can actually live.

### Changed

- **The bracket is a bracket.** Four columns, a stub out of every game and a
  spine joining the two that feed the next — first round through to the title.
  The geometry needs no measuring, so it holds at any window size: a pair of
  cells puts its two midpoints at a quarter and three quarters of its height,
  and a line between those two points meets both by construction.

## [0.44.0] - 2026-09-05

### Added

- **The game's own rankings, out of your save.** There is no poll table in the
  file — 88 tables and not one of them is a ranking — so a team's rank is one of
  `TeamStore`'s 424 members and nothing says which. DCC finds them by the one
  shape a ranking has: over 143 programs, every place filled exactly once, or
  twenty-five ranked with the rest level.

  A plain counter is a perfect ordering by accident, and this project has been
  fooled by exactly that before, so a column whose value is its own row number
  is rejected. What survives is a ranking of something.

  Your save may keep more than one, because the sport has more than one poll.
  Nothing in the file says which is the AP and which is the coaches', so the
  Save screen shows the top ten of each and League → Rankings lets you pick the
  one that matches your game. It is remembered, and it travels to the phone.

- **The real Heisman watch.** `HeismanRankingStore` holds exactly the five-name
  shortlist the game shows. Which of its four members is the player is not
  written down either, so DCC takes the column that resolves to a real roster
  row in every single one of the five. Home shows it on the PC and the League
  screen shows it on the phone, both under the game's own trophy.

  What the save still does not give up is the case for each of them: the season
  statistics are not decoded, and the panel says so rather than implying a stat
  line.

### Changed

- **Standings, the bracket and the Top 25 toggle all follow the real ranking**
  where the save has one, on both apps. Teams it does not rank fall in behind by
  record, and only that part is DCC's opinion.

## [0.43.0] - 2026-09-05

### Fixed

- **"No pack is open."** Building the pack for everyone could spend several
  minutes reading eight thousand faces and then report that, with nothing to
  show for it. Three things were wrong at once and all three are fixed.

  The main process held every image in memory until the last one arrived and
  then concatenated the lot into one more buffer — a few hundred megabytes
  twice over. It now appends each batch to a file as it goes, so the largest
  thing alive at any moment is one batch. That is the same fix the phone got in
  0.39.2, left standing on this side.

  The result of each batch was thrown away, so a pack that had been lost partway
  went unnoticed until the very end. Each batch is now checked, and a build that
  has lost its pack stops immediately and says what happened rather than
  finishing for nothing.

  A build that failed left the screen stuck on *Building…* with no message. It
  now always comes back, with the real reason.

- **A player with no portrait gets his school's crest, not a monogram.** The
  game draws some players generically, and an empty frame with two letters and a
  jersey with no shoulders in it read as a broken card. The crest fills it
  instead — the one image that is certainly right for him. On both apps.

### Changed

- **The relay streams the art pack** rather than reading it into memory to
  answer one request.

## [0.42.0] - 2026-09-05

### Fixed

- **The jersey did not line up with the player.** The portrait was drawn at 92%
  of the card's width from the top; the jersey at 118% from the bottom. Two
  different scales in two different places, so the collar could never land on
  the neck — what showed was a triangle of shoulder in each bottom corner.

  Both are now drawn into the same box with the same crop, so whatever their own
  canvases turn out to be they stay registered to each other. The portrait fills
  the card as a result, which is the other half of what was wrong with it.

- **The jersey is on everywhere a player is, on both apps.** One composite —
  the school's colour, the school's jersey over the portrait's generic grey
  shirt, the portrait on top — now draws every card, list row, depth-chart slot,
  tampering row and player sheet. It used to be the card and nothing else.

### Added

- **Line up the jersey once.** On the Roster's card view, two sliders: jersey
  size and height. The game's portraits and its jerseys are two sets of art on
  canvases nobody here has measured, so where one's collar meets the other's
  neck has to be looked at rather than derived — and looking at it once should
  be enough.

  The setting rides in the art pack, so the phone draws a player exactly as the
  PC does. Rebuild the pack after adjusting it.

## [0.41.1] - 2026-09-05

### Added

- **The tables inside your save, and a way to read one.** The Save screen now
  lists every store the file declares — 88 of them — with its row and member
  counts, searchable, and writes any one's first sixty rows to a file as hex
  plus the obvious readings of it.

  This is the instrument the real rankings need. The save's own directory says
  what tables exist and how wide a row is; it never says which column is which,
  and every field DCC has decoded was found by putting rows beside a value
  already known. Doing that used to need a hex editor.

- **The art folder can be searched by name.** Type "bowl" or "trophy" and see
  what the files are actually called. That is how the trophy, bowl, playoff and
  conference-championship naming in 0.41.0 was found rather than guessed at —
  the same mistake that once shipped a 208-byte art pack.

## [0.41.0] - 2026-09-05

### Added

- **The game's own trophies, bowl crests and playoff marks.** The art folder
  carries them under their own names — `trophies_Heisman`, `bowl_RoseBowl`,
  `playoff_Qtr_Final`, `confchamp__BIG10Championship` — so they are matched the
  same way logos and helmets are and travel to the phone in the art pack. The
  Heisman panel now sits on the real trophy, each conference's table carries its
  own championship mark, and the bracket's rounds carry the CFP marks.

  Rebuild the art pack once to send them to the phone.

- **A twelve-team playoff bracket.** First round, quarterfinals and the path to
  the title, on both apps. The five highest-ranked conference leaders are in on
  their titles, the best seven of everyone else fill the field, and all twelve
  seed by the ranking. December's games appear underneath as they are played.

  It is labelled a projection, because that is what it is until the save has one.

### Changed

- **Bigger.** Logos, helmets, faces and the type beside them were all a size or
  two below what they should have been — a 16px crest in a table of a hundred
  and forty-three programs. Tables, score rails, feature rows and roster rows
  all move up a step on both apps, and the phone's Saturday cards widened to
  match.

- **The League screen picks a conference instead of searching for one.** There
  are eleven of them and you already know which you want, so the search box is
  gone: it opens on yours and changes with a dropdown on the PC, a row of chips
  on the phone.

- **The scores rail names your league.** The tab says BIG TEN rather than MINE,
  and the kicker that repeated it beside them is gone.

## [0.40.0] - 2026-09-05

### Added

- **The League tab is the league.** Standings for every conference, a ranking of
  the whole country, the week's scores, team scoring, and any other school's
  season week by week. Click a name anywhere and its schedule opens; click your
  own conference record on Home and you land here.

  The ranking is DCC's own and says so. There is no poll in the save — no AP
  number, no coaches' number — so it is record first, with scoring margin as the
  tie-break and a cap on it, so a 98-0 win over nobody cannot outrank a second
  win. A record is also credited against four imaginary games at .500, which is
  what keeps a 1-0 team in September out of the top spot.

  The same arithmetic runs on both apps, out of one module each side, so the
  phone and the PC cannot disagree about who is 7-2.

- **Home's feature turns over.** Your game, then the country's biggest results,
  then the Heisman watch, then your class — each over the school's own mark,
  blurred, on the colour DCC read out of that mark. Tap a dot to hold one.

  There is no stadium photograph and no trophy in the art, so neither is
  invented: the ground is the right colour with the right shape in it. And no
  season statistics are decoded yet, so the Heisman panel is the field by
  rating, by the positions the award goes to, and by whose team is winning — it
  says as much rather than implying a stat line.

- **Saturday's scores, filtered the way you would look for them.** The rail on
  the PC and the scroller on the phone both open on your conference and toggle
  to the top 25, with a rank beside every ranked team. The phone's scroller
  moves on its own, slowly, so a glance gets more than the first two cards.

### Fixed

- **The League tab showed your roster.** It said SCORES at the top and listed
  your players underneath. The tab and The Program were the same component in
  the same slot of one conditional chain, so React kept the instance alive and
  League opened on whichever tab Program had been left on. It is its own screen
  now, and the smoke test walks Program → League and reads what is actually
  there.

- **Logos and helmets never appeared on the phone.** The art pack installed 143
  schools and drew none of them: the composable that read a school's mark was
  written and then never called from anywhere. Every screen that names a school
  goes through one badge, so teaching that badge to look in the pack put logos
  on all of them at once — standings, scores, the board, the transfer list, the
  schedule. The dead composable is gone.

- **Results you have not reached could leak into a table.** The game sims the
  rest of the country before your own Saturday, so a save on week 11 already
  holds week 11's scores. Standings, rankings and the Heisman watch are all
  built from the weeks you have played, with the same held line the schedule
  already used, and the League screen carries the toggle if you want to see
  past it.

- **Home's top of the roster did nothing.** No faces, and clicking a name did
  not open the player — the one list on the page that did neither. Both now do,
  and the card it opens knows the difference between a prospect and someone on
  your roster.

## [0.39.2] - 2026-09-05

### Fixed

- **The phone was killed by a big art pack.** "Dynasty Command Center keeps
  stopping" — it held the whole download in memory, and the buffer it grew into
  doubles as it fills, so a hundred-megabyte pack wanted two or three hundred
  megabytes at once. Android does not allow that.

  It streams to a file now, at both ends: the download is copied straight
  through, and the unpacking reads from that file. The largest thing alive at
  any moment is an eight-kilobyte buffer, so the size of the pack no longer
  matters and **Everyone** is a real choice rather than one that kills the app.

  A download that dies partway no longer leaves the file behind, and an unpack
  that fails no longer leaves half a pack on the phone reporting itself as
  nothing installed.

## [0.39.1] - 2026-09-05

### Fixed

- **The art pack's face choices said the wrong thing.** "Every roster" left the
  recruiting board out, and "my roster and the board" quietly packed the whole
  country. They nest properly now — each is the one above it plus more — and the
  widest is called **Everyone**, because that is what it is. Each choice also
  shows how many faces it comes to before you build, so the decision is made on
  the real number rather than on how big a word sounds.

## [0.39.0] - 2026-09-05

### Fixed

- **The art pack came out 208 bytes: a manifest and nothing else.** Every file
  was skipped, because I wrote a PNG reader for it and the game's art is
  **WebP**. Chromium has been decoding those files all along — it is what draws
  them on every desktop screen — so the reading and resizing now happen there,
  on a canvas, and the main process only ever sees images it can put straight
  into the archive. Whatever format the art is in, if the desktop can show it,
  it packs.

  Same mistake, same fix, for **team colours**: they were read with the same PNG
  reader, so every school came back with none and the cards fell back to the
  theme. They are read off the logo on the canvas now, in the same pass, and go
  up with the snapshot.

  If a file still will not open, the build says how many and what extension they
  were — an empty pack should name its own cause rather than leave you counting
  bytes.

- **The build shows its progress.** Reading twelve thousand faces is not
  instant, and a button that says "Building…" for two minutes is
  indistinguishable from one that has hung.

## [0.38.0] - 2026-09-05

### Added

- **Every picture the desktop shows, on the phone.** Logos, helmets, jerseys,
  the gold mark and player faces — not a subset of those, all of them.

  The game's art folder is gigabytes and the phone has never seen any of it, so
  the desktop builds an **art pack**: the slice your dynasty actually uses,
  shrunk to the size a phone draws it at. Every school's four marks always,
  since 138 of those is a couple of megabytes; faces are the expensive half, so
  you choose — your roster, your roster and the board, or every roster — and it
  tells you what it came to.

  Devices → **Build the art pack**. It saves to a file, goes up to GitHub beside
  the snapshot, and is served over Wi-Fi with it, so it reaches the phone the
  same three ways the dynasty does. On the phone: Dynasty file → **Pictures**.

  Without a pack the phone looks exactly as it did — initials and monograms —
  rather than looking broken.

## [0.37.0] - 2026-09-05

### Added

- **The snapshot publishes itself on launch.** The app already re-reads your
  save when it opens; now it sends the snapshot up with it, so the phone is
  current without anybody pressing a button. Once per run — the roster is
  re-read after every write, and republishing on each of those would be an
  upload per edit. It needs a repository and a token, and there is a switch
  beside the Publish button on Devices to turn it off.

## [0.36.0] - 2026-09-05

### Added

- **Who won each season, read out of the save.** The game table carries the
  bowls but not the playoff, and the champion is in none of those 37 rows —
  it is in the year summary, two team references a row, winner first. Your own
  dynasty reads Oklahoma over Texas A&M in season 1 and Penn State over BYU in
  season 2, and season 3 is blank because it has not been played. So the gold
  mark now appears by itself: no marking a champion by hand unless you want one
  the save cannot know about. **Yes, it will name this season's champion once
  the title game is played.**
- **The team's own jersey on the card.** The extracted art has a transparent
  shoulders-and-collar image per school, and it goes over the portrait rather
  than under it — the game's portraits come with a generic grey shirt, and the
  jersey covers exactly that, leaving the head above the collar in your kit.

### Fixed

- **Helmets on the scoreboard.** The big game at the top of the Schedule had two
  empty boxes where the helmets belong. It was handing the image a file path
  where every other screen builds a `dccart://` URL, so the browser had nothing
  to fetch. They are helmets now rather than logos, which is what a scoreboard
  wants.
- **The two apps agree on the week.** The desktop's title bar said week 10 while
  the phone said week 11 off the same save: one was reporting the last week
  played and the other the first not played. The first not played is right — it
  is the week the game is sitting on — and there is now one definition both use.

## [0.35.1] - 2026-09-05

### Fixed

- **The phone stopped refusing your dynasty.** It would only open a snapshot
  written by a desktop build of exactly its own version or newer, so every
  version bump broke the phone until you exported again — and if the two apps
  updated minutes apart, a snapshot published seconds earlier came back as
  "export it again from the desktop app". Every field added since the format
  settled carries a default, so an older snapshot opens perfectly well with the
  newer lists empty. It now does, and the Dynasty file screen says when one was
  written by an older build rather than turning it away.

## [0.35.0] - 2026-09-05

### Fixed

- **Class year was right after all, and I removed it in 0.34.0. It is back.**
  The field is Freshman / Sophomore / Junior / Senior; only the labels were
  wrong. The schema names its values `HighSchool`,
  `JuniorCollege_Sophomore`, `JuniorCollege_Junior` and has no name at all for
  the fourth, which is why rosters read as junior college and every senior read
  as blank. Verified against the game's own screen twice over: Penn State's 85
  come out 54 Freshman, 13 Sophomore, 12 Junior, 6 Senior, exactly as the game
  has it, and ten players named on that screen all agree. It is back on the
  roster, the cards, the player sheet and the filters, on both apps — and an
  older snapshot's mislabelled values are mapped to the class they meant.

### Added

- **Player cards worth looking at.** The portrait is the card now: full bleed,
  cropped to the head, on **the school's own colour**. That colour is read out
  of the school's own logo rather than typed into a table — the save carries no
  team colours, and a hand-written list of 138 would be wrong the day a dynasty
  renamed one. The crest sits behind the player the way it sits on a shirt, and
  everything written on the card is over a shade so it reads whatever colour a
  school plays in.
- **The gold mark for a champion.** Mark a school as a national champion on its
  roster and it keeps the game's gold logo on every card, with a gold edge. The
  save cannot say — last season's bracket is not in this season's file — so you
  say it once.
- **Speed on every card**, with the class beside it. It used to show whichever
  rating suited the position, which meant some cards showed nothing at all when
  that rating was one DCC cannot place, and no two cards compared. The text is
  larger throughout.
- **Cards on the phone too**, with the same colour and the same gold mark. No
  portraits there yet — the faces are gigabytes on the PC and the portrait pack
  is not built — so a card shows initials until it is.

## [0.34.0] - 2026-09-05

### Added

- **The Program, and the portal, on the phone.** Android gains a Program tab —
  your roster, depth and schedule off the snapshot — and Portal now has the
  same two halves the desktop does. Transfers and the conversations both ride
  along in the snapshot, because the phone cannot build either: the ledger
  needs two seasons of saves read on the PC, and a reply needs the API key that
  lives there. The conversations are read-only on the phone and it says so.
- **Tampering opens on the whole country.** The screen used to be a search box
  and nothing else, which is no use when you know you want a corner nobody is
  playing but not his name. It now lists every player on every other roster,
  best first, with filters for the unit and for hiding the starters.

### Fixed

- **The roster no longer claims your sophomores went to junior college.** The
  field DCC was labelling "class" is not one. Across an offseason it advanced
  by exactly one for 70% of the 8,412 players on a roster in both saves, which
  an origin does not do, and it puts 54 of Penn State's 85 in a single bucket,
  which no class does. It is gone from the roster, the player sheet and the
  cards, and class year has joined the list of fields DCC says it cannot read
  yet. On a recruit, where it does mean where he is coming in from, it is
  labelled "from".
- **Bigger portraits, on a dark ground.** The game's portraits are transparent
  PNGs, so the tint behind them was a tint on the player — which is what washed
  every card in the theme's accent. Cards are wider and the faces much larger.
- **Positions in football order** — QB through P, and the depth chart the same
  way, with each package's variants beside the position they belong to. The
  save stores both alphabetically, which is how they were identified and is not
  how anybody reads them.

## [0.33.0] - 2026-09-05

### Changed

- **Tampering is a conversation now, not a rating editor.** What was there
  edited other teams' players, which is not what it was ever meant to be. It
  has been rebuilt as the thing you asked for.

  From week 11 you can text a player on any other roster, which the rulebook
  and the game both say you cannot. He answers for himself — Claude writes him
  as a nineteen-year-old answering a coach who should not have his number — and
  how far he moves depends on what he would be giving up.

  That last part is read out of your save, not invented: where he sits on his
  team's depth chart, how their season is going, how their roster grades
  against yours, and how good he is for the room he is in. A starter at a
  ten-win program is close to immovable. A third-stringer at a losing one is
  waiting for the phone to buzz. The screen shows both the number and the
  reasons, so you can see what you are up against.

  Sending a text moves him, and how far it can move him is capped by how hard
  he is — so a hard man cannot be talked round in three messages however good
  the writing. Say the wrong thing and it costs you. Where you end up is where
  you stand if he enters the portal, and when the transfer ledger later shows
  he moved, the thread says where he went.

  Nothing is written into your dynasty file. The portal list and the commit
  score are not decoded yet, so DCC keeps the conversation and where you stand
  and is honest about the rest.

### Fixed

- **Settings explains the API key properly**, now that two screens use it.

## [0.32.0] - 2026-09-05

### Added

- **Transfers, for every school.** A new tab under Portal showing who moved,
  where from, where to and in which season — your program, who came in, who
  left, or all 138 schools. A player who has been at two or more schools gets
  their whole route.
  Your dynasty file records where players *are*, never where they have been, so
  DCC keeps its own ledger: it writes down each roster whenever it reads your
  save, and a transfer is somebody who turns up somewhere else the next season.
  It fills in from the second season you read, and reading a save once a year is
  all it asks. Between the two saves already read that is 1,563 moves.
- **The season number, read out of the save.** Used to stamp each record. There
  is no calendar year anywhere in the file, so the screen counts seasons and
  lets you name the current one once if you would rather see 2027.

### Fixed

- **British spelling.** "Your programme", "all 138 programmes", "analysing" and
  "any colour" are now program, programs, analyzing and color, on both apps.
- **The empty screen no longer flashes on launch.** Opening the app showed
  "no save loaded" for a second before your dynasty replaced it, which read as
  a failure and a recovery. It now says it is opening your save, because it is.

## [0.31.0] - 2026-09-05

### Added

- **The Program's roster, in three shapes.** List for scanning eighty-five
  names, gallery for putting a face to each, cards for looking at one — same
  filters throughout. Four tiles above: the team, offense and defense
  averages, and what the roster costs in NIL.
- **A redshirt mark** on every view.
- **Open a player.** Clicking a name, a row or a card brings up the profile and
  all 52 ratings, grouped the way a player card reads them.
- **Editing from the player sheet**, writing the overall, the ratings, the
  redshirt flag and the NIL figure. Fields DCC cannot yet place in the record
  are named on the profile rather than offered as boxes that do nothing.


## [0.30.3] - 2026-09-05

### Fixed

- **The school-naming card can be closed.** Clicking a school on the Teams tab
  opened a card whose only button was "Skip — just call it team 47", which is
  not a cancel and could quietly make that team yours. It has a Close now, and
  for a team that already has a name the button is Cancel.
- It also stopped asking a question that no longer applies. Every team id has
  had a name for a while, worked out from the schools the recruits themselves
  list, so the card offers to **rename** the school it already knows.


## [0.30.2] - 2026-09-05

### Fixed

- **Offense and defense** are spelled the way American football spells them.
- **The art folder has a home.** Faces are used on the roster, the recruiting
  pool, tampering, the depth chart and the front page — but the only way to
  point at the folder was a rail inside Recruiting, so missing it meant
  initials everywhere with nothing saying why. There is a card on the Dynasty
  file tab now that says whether a folder is set, how many of your players it
  matched, and where it points.

### Added

- **Faces on the front page**, on the board rows and the prospect card. It was
  the one screen still drawing initials with the art indexed a click away.


## [0.30.1] - 2026-09-05

### Fixed

- **The update prompt is legible.** It was see-through — its background was a
  three per cent wash meant for a card on the page, not a panel over it — the
  version was set at page-title size, and the notes were the whole release
  body, headings and all. It is opaque now, sized for itself, and each note is
  reduced to its point. The full notes are still one click away.


## [0.30.0] - 2026-09-05

### Added

- **The depth chart, read out of your save.** Every position in the order the
  game plays them — offense, defense and special teams — with the starter on
  the card and the rest a click away. It used to sort by overall and admit it
  could not read your real ordering.
- **Reorder it and commit.** Open a position, drag or use the arrows, and the
  changes are held until you press commit. What gets written is a reorder of
  the players already in that position, never a change of who is in it, which
  is what makes it safe to write.


## [0.29.6] - 2026-09-05

### Changed

- **The art folder is remembered.** It was held in memory only, so every launch
  asked for it again. The path is stored and re-indexed on launch once the
  roster is in; a folder that has since gone is forgotten rather than reported.


## [0.29.5] - 2026-09-05

### Fixed

- **The phone's Appearance and Dynasty file tabs showed the same thing.** Both
  drew the whole of Settings, so the tabs were labels over one page. The
  snapshot, the dynasty and the relay live under Dynasty file now; the theme,
  the mode, the accent and updates under Appearance.
- **The colour wheel no longer traps you.** It filled the width of the screen
  — an enormous disc on a tablet — and it handles drags, so every swipe meant
  to scroll past it changed the accent instead. It is a fixed size now and
  opens on request: the four presets stay in view, and **Any colour…** opens
  the wheel when that is what you came for.
- **The update prompt stays in its corner.** A shell rule was overriding its
  fixed position, which dropped it out of the bottom right and pushed it half
  off the left edge of the window.
- **The game switcher opens above the page.** It was not see-through — it was
  behind the page content, along with the search results.
- The save report's class-name list shipped useless: capped and sorted
  alphabetically, it filled with the save's own asset ids and never got past
  the letter A. It lists real class names now.


## [0.29.4] - 2026-09-05

### Fixed

- **The analysis report now describes the save.** It carried strings and
  entropy but not the list of tables inside the file — that lived in the
  game-install scan, where nobody looking at a save would find it, and it
  came from the roster pass, so exporting before reading a roster dropped it
  silently. It reads off the analysis now and lands in the save's own report.
- The report also lists **class names in full**. The frequency list is capped
  and sorted by count, and the save declares most of its classes exactly
  once, so the names that say what the file actually holds were the ones
  guaranteed never to appear.


## [0.29.3] - 2026-09-05

### Fixed

- **The phone's dark mode stays black.** The accent was washing the whole
  screen — fine in champagne, a navy page in blue. It is painted as two soft
  glows in opposite corners now, the way the desktop has always done it, so
  the ground stays black and the accent shows at the edges rather than
  becoming the background.


## [0.29.2] - 2026-09-05

### Changed

- **The desktop reads your save on launch.** It already re-opened the file you
  were last looking at, but only far enough to read its header — every screen
  is built out of the roster pass, so the front page came up empty and the
  roster had to be read by hand every single time. Both passes run now, and
  Home and The Program say they are reading while it happens.
- **Choosing a save reads its roster too**, rather than asking for a second
  click before anything appears. The button stays as the fallback it should
  always have been: a save that moved, or a read that failed.

## [0.29.1] - 2026-09-05

### Fixed

- **The ••• control on the phone no longer crashes the app.** Settings brings
  its own scrolling and the panel behind that control was putting it inside
  another one, which Compose refuses to measure. It threw on every tap.

### Added

- **Tap a score, or the feature, to open the game.** The final, the
  quarter-by-quarter line as a table and as bars on a shared scale, and the
  conditions it was played in — kickoff, attendance, temperature, weather,
  wind. Per-player and team statistics are not in the save's game table, so
  the sheet shows the only per-team series it gives up rather than box-score
  rows with nothing behind them.
- The board's rows and its **ALL →** reach the Board tab.

### Changed

- The launch check taps the ••• and fails if the app dies or the settings
  screen does not appear. Launching proves nothing about a screen nobody
  opened, which is how the crash shipped.

## [0.29.0] - 2026-09-05

### Changed

- **Gold Standard has its own shell on the phone.** 0.28.0 shipped the theme's
  colours over the old left rail, which is not the design and read as a
  repaint. The phone now gets the shell the design asks for: a centred
  masthead with the week under it, five tabs within reach of a thumb — Home,
  Board, Portal, League, Legacy — and one control in the masthead for
  everything operational, so a screen meant to read as coverage carries none
  of it. Night Wire and Field Office keep the rail they were built with.
- **Home on the phone** is the feature, Saturday's results as cards you scroll
  across, and your board with avatars, stars and a pill.
- **Numbers are Bodoni on the phone too.** The shared components put numbers in
  the mono slot, which under Gold Standard is Manrope — right for a label,
  wrong for a score. Every number you read as data is Bodoni now, which is a
  large part of why the old screen read as a palette swap.

### Fixed

- The launch check takes a screenshot and reads the words off the screen, so a
  build that opens the wrong screen entirely fails rather than passing.

## [0.28.0] - 2026-09-05

### Added

- **Gold Standard**, a new theme and the default on both apps: warm cream ink
  on near-black, Bodoni Moda for every headline and every number you read as
  data, Manrope for everything else.
- **Dark and light modes**, and an **accent you choose** — four presets plus a
  full colour wheel, on the desktop and on the phone. One colour is stored;
  every border, rule and wash is mixed from it, and the light-mode value is
  that same hue with its luminance dropped.
- **Search** in the desktop top bar, reaching all 138 teams, all 16,448
  players and the recruiting pool.
- A **game switcher** on the wordmark. Madden 27 and FC 27 are listed and
  marked coming soon; nothing reads their saves yet.
- **Home** rebuilt as three columns — your programme and board, the feature,
  the week's scores. Opening a score or a board row swaps the middle column
  rather than navigating away, so you keep your place.

### Changed

- The nav is editorial: Home, The Program, Recruiting, Portal, League, Legacy.
  Everything operational — your dynasty file, devices, the queue, the draft
  export — moves behind a discreet gear, in every theme.
- Night Wire and Field Office are unchanged and remain selectable as the
  working themes, where what has been decoded and which file is open still
  show.
- Android's palette is generated from the shared tokens rather than hand-copied
  into Kotlin, so the two apps cannot drift apart again.

### Fixed

- Opening Legacy with a save loaded but no sample dynasty crashed the desktop
  app, which silently stopped the update prompt from appearing.
- Light mode's hovers were white washes, invisible on a cream ground.

## [0.27.0] - 2026-09-05

### Added

- **A new look, and it is now the default.** Broadcast drops the serif headlines,
  the monospace labels and the two-pixel white rule that made the app read as a
  report. One sans family carries everything at four weights, titles are heavy
  and tightly tracked, cards sit above the background instead of being drawn on
  it, and section rules are hairlines. Night Wire and Field Office are still
  there in Settings.
- **A scoreboard.** The Schedule tab opens on your last result, or your next
  kickoff once the results run out, with the score at the size a score deserves
  and the conditions underneath. Box scores are a proper line-score table.

### Fixed

- **Upcoming games were coloured like losses.** The winner was derived from a
  0-0 scoreline, so every fixture you had not played yet showed in the same
  colour as a defeat.
- **"You played" no longer shouts** on every row it applies to.

### Notes

- Anyone who never picked a theme moves to the new default. Choosing any theme
  fixes that choice and this never touches it again, so Night Wire stays put if
  you asked for it.

## [0.26.0] - 2026-09-05

### Added

- **A recruit's overall is hidden until you scout them**, on both apps. The game
  hides it, so DCC does too rather than handing over the mechanic a recruiting
  class is built on. Each recruit has a Scout button, and one switch reveals the
  whole pool at once. Stars, position, hometown, pipeline and archetype stay on
  show, because those are public in the game.
- **Scouting reveals the full ratings card**, on the phone as well as the
  desktop. Recruits now carry their ratings in the snapshot, so the two apps show
  the same thing off the same save.

### Changed

- **The recruit list no longer sorts by overall while overalls are hidden.**
  Ordering by the hidden number would put the best players at the top and give
  away the column that is hiding them. Hidden, it sorts by stars then name;
  revealed, by overall as before.

### Notes

- Reveals are remembered per recruit by player id, so re-reading the save or
  re-fetching a snapshot keeps them on the right players. Turning the global
  switch off forgets the individual ones, so hidden means hidden.
- Sorting by national ranking is not possible yet. The rank is not derivable
  from anything DCC can read — it follows neither overall nor stars, rank 3 in
  this class being a 74 while rank 5 is an 81 — and the field itself sits in the
  Recruit record that has not been located. That same record holds recruiting
  stage and commit score.
- The snapshot grew from 6.0 MB to 9.1 MB carrying recruit ratings, or 1.43 MB
  compressed, which is what the away-from-home route transfers. The relay still
  serves the whole thing in about half a second.

## [0.25.1] - 2026-09-05

### Fixed

- **Rosters were losing two-thirds of their players to the recruiting pool.**
  The snapshot sent to the phone decided a recruit was any generated player
  carrying the recruit flag, and that flag stays set after signing — 59 of Penn
  State's 85 have it. So the phone showed a 26-man roster and a pool of 10,790.
  A recruit is a player on nobody's roster, which brings the pool to 4,108,
  matching an export of the class, and rosters back to their full 85.
- **Rostered players were labelled with a year they do not have.** The save's
  class field records where someone came in from, high school or a junior
  college, not what year they are now, so the phone was calling fourth-year
  starters "JUCO SO". It is shown on recruits, where it means something, and
  left off rosters.

## [0.25.0] - 2026-09-05

### Added

- **The phone can fetch the dynasty over the network, two ways.** Devices on the
  desktop now offers both. At home, "Start serving" turns this machine into a
  small server your phone reads directly over your own Wi-Fi — nothing leaves the
  house, and the six-megabyte snapshot arrives in about half a second. Type the
  address and code it shows into the Android app's settings.
- **Away from home, publish the snapshot.** Your PC is not reachable from a phone
  on mobile data, so the snapshot is compressed and published to a repository you
  own. Free, private, and nothing running anywhere. Enter the repository as
  `owner/name` and a GitHub token with Contents write access, then publish
  whenever you want the phone to catch up.
- **The Android app fetches by either route**, alongside importing a file, and
  offers whichever one last worked so a refresh is one tap.

### Notes

- The PC stays the only thing that writes to a save on either route. A save is
  one file rebuilt whole, so two writers would lose a dynasty.
- A repository made with GitHub's "new repository" button has no commit and no
  default branch, and a release needs one, so the first publish writes a README
  to start it.
- Android cannot express "allow plain HTTP for private addresses only" — its
  config matches host names, not address ranges. So cleartext is permitted
  generally and every internet host the app reaches is named as TLS-only
  instead, which means nothing it sends outside your network can fall off TLS.

## [0.24.0] - 2026-09-05

### Added

- **The phone shows your real dynasty.** Export a snapshot from the desktop
  (Save → Snapshot for the phone), move the file to your phone, and import it in
  the Android app's settings. Team shows your roster and your schedule with a box
  score behind every game, Recruit shows the real pool, and National's standings
  show the save's own teams, conferences, coaches and records. Without a snapshot
  the app behaves exactly as before.
- **Tampering.** Edit any player on any other programme's roster — overall and
  all 52 placed ratings — and write it to your save. The game gives you no way to
  do this. Tamper section, once the roster has been read.
- **Press coverage.** A preview before a game and a recap after it, written from
  the facts in your save: the teams, their records, the date, kickoff, conditions,
  the score and the quarter line, and each roster's best players. The model is
  told to invent nothing. Add your own Anthropic API key in Settings; it stays on
  your machine.

### Fixed

- **A tampering bug caught before it could reach a save.** The player-record
  constants name the last bit of a field, not the first, so a writer that read
  them as start positions would land in the neighbouring rating — and would pass
  its own verification, because it would read back the same wrong place. Testing
  against the roster reader caught it. The convention is now pinned by a test.

### Notes

- School interest is decoded: each recruit's ten schools and the influence value
  behind each, verified against an export of all 4,100 recruits. Recruiting
  stage and commit score are not; the schema names them but their records are
  not in the player record, not in the store directory, and not in any table
  ordered by rank or player index. `docs/SAVE-FORMAT.md` records what was ruled
  out.

## [0.23.0] - 2026-09-05

### Added

- **DCC can write to your save.** Kickoff time, conditions, temperature and
  wind can be changed on an upcoming game, from the Schedule tab. A timestamped
  backup is taken first, and the write is refused unless the rebuilt save reads
  back with exactly the change asked for and nothing else moved.
- **Only conditions the game can store are offered.** The save's `Weather`
  field has no Fog, so DCC does not offer one.

### Notes

- The container has no checksum, which is what makes writing safe: the only
  field to update alongside the stream is its compressed length.
- Verified against an independent writer. The same edit made in another tool
  changed seven bytes of the game table; DCC changes five, and all five hold
  the same values. The two it does not write are that tool's own bookkeeping,
  one of which lands in a neighbouring game's record.
- Weather set before a week begins is replaced when you advance to it, because
  the game generates that week's weather itself. Kickoff holds whenever set.

## [0.22.0] - 2026-09-05

### Added

- **The schedule, with box scores.** Team gained a working SCHEDULE tab: your
  season with results, and the whole country a week at a time. Opening a game
  shows kickoff, temperature, conditions, wind, attendance, whether you played
  it or simmed it, and the quarter-by-quarter line including overtime.
- **Results you have not reached are held back.** The game simulates the rest
  of the country before you play your own game, and those scores sit in the
  save unseen. DCC hides them for weeks you have not played, with one click to
  show them anyway.

### Notes

- Teams in a game row are references into the save's 143-row team table, not
  the team ids players carry. The table's order is every school by full name,
  with UConn under Connecticut, and it is verified against 44 team appearances
  across 29 games.
- Team and player statistics are only kept by the game for the current week, so
  a box score older than that is the line score and conditions, which is all
  the save still holds.

## [0.21.3] - 2026-09-05

### Fixed

- **"Throw Under Pressure" was showing every player's height.** The rating was
  mapped from one player's card to bit 650, and bit 650 is Height, verified on
  all 16,448 players — that player's throw-under-pressure happened to equal his
  height in inches. The rating is removed rather than guessed at; DCC now shows
  52 ratings and says which one it cannot place.


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
