# Dynasty save format

Notes from taking apart a real College Football 27 dynasty save
(`DYNASTYPSU2`, 9,646,981 bytes, build `College-27-RL3_5-9171310`).

**The headline: the save is compressed, not encrypted.** Its contents are
readable, and a parser is a matter of mapping fields rather than breaking
anything.

## Container

```
0x00  char[8]   "FBCHUNKS"          Frostbite chunked container
0x08  u16       1                   version
0x0A  u32       0x40                offset of the chunk record
0x0E  u32       9,646,899           payload length (file size − 82)
0x12  u32       9,646,963
0x16  u16[6]    2026-08-30 13:09:27 save timestamp (y, m, d, h, m, s)
0x22  char[24]  "College-27-RL3_5-9171310"   game build
0x40  ...       chunk record; u32 at 0x4A is the compressed length
0x52  ...       one zlib stream, 6,543,865 bytes
```

The stream inflates to **31,131,540 bytes** beginning with `FrTk` — Frostbite's
own container, big-endian. Everything after the stream is zero padding, which is
why the file is 9.6 MB for 6.5 MB of data.

## Inside the payload

Readable content confirmed present:

- **Player names** — one contiguous table of 138-byte records. Its exact
  bounds and field layout are in *The name table* below: 17,470 slots at
  `0x00f44e68`, 16,450 of them filled.

- **Coach records** — a separate table using `Unique_C_<Name>_<id>` assets.
- **Generated storylines** — null-terminated prose, e.g. *"The Gamecocks prepare
  for their home playoff matchup against the Nittany Lions in Columbia."*
- **Team identities** — "Nittany Lions", "Beaver Stadium", school names.
- **Slider descriptions** — the CPU tuning text shown in-game.

## Type registry

The payload carries its own schema. Scattered through it are **715** paired
`ASTO` / `CMPC` records, each declaring one class:

```
11 04 1c 65 24 8d          type id (0x1104) and name hash
"ASTO" ...                 asset/type object
00 00 00 06                member count
00 00 00 3c                instance size (60 bytes)
1c 65 24 8d "CMPC"         compound class, same hash
00 00 00 3c 00 00 00 3c    size, size
"AcceptOutstandingOfferReaction"
```

The class names read like the game's own model, and they name most of what the
apps need:

`DepthChart` · `Conference[]` · `DraftPick[]` · `GameStats[]` · `CoachGoal[]` ·
`BowlInfo[]` · `ComebackPlayer[]` · `HistoryEntry[]` · `Injury_PlayerInjuredRequest` ·
`ManageRedshirtsRequest` · `TeamHistoricalData` · `Transition[]` · `Player[]`

**Member names are not stored.** Searching the payload finds no field-name table
— "Overall" appears seven times in 31 MB, far too few. Frostbite identifies
members by hash, so the registry gives the class list and each class's size and
member count, but not which offset holds which rating. That is what the diff
method below is for.

## Not yet mapped

Names and hometowns come out cleanly; the numbers do not yet. Still unknown:

- Ratings (overall, speed, awareness…) and their scale
- Position, class year
- The authoritative player→team link
- Schedule, recruiting board, coach career records

## How to map the numeric fields

Since member names are hashed rather than stored, diffing is the way in, and it
needs no guesswork:

1. Save the dynasty, copy the file somewhere.
2. In-game, change exactly one known value — one player's redshirt, one rating.
3. Save again, and diff the two inflated payloads.

Every differing byte is that field. Combined with the registry's class sizes,
a handful of these pins the record layout down quickly.

Two saves taken days apart also help, by showing which regions carry
week-to-week state — but they change too much at once to isolate a single
field, so the controlled single-change pair is worth more.

### Result of the first controlled diff

Two saves 42 seconds apart, with one player's redshirt removed in between:

```
TEST1  sha b20ff5aa  saved 2026-09-04 08:52:04  inflated 31,153,900
TEST2  sha 3566432e  saved 2026-09-04 08:52:46  inflated 31,153,900

differing bytes: 1 of 31,153,900
  0x00f31dc8   0x80 -> 0x00     bit 7
```

**One byte.** Two things follow, and both matter:

1. **The payload is deterministic.** No timestamps, counters or checksums moved
   inside it — only the edit. So every controlled diff isolates exactly one
   field, with no noise to filter.
2. **Redshirt is bit 7** of the byte at that offset for that player.

The byte is not in the 138-byte name table — the nearest portrait record is
78 KB away. Player strings and player state live in separate tables.

The state region does not resolve to a byte-aligned stride: neighbouring bytes
are all multiples of `0x20` (`c0 00 00 20 c0 40 80 …`), which is the signature
of **bit-packed** fields that do not start on byte boundaries. A single diff
cannot recover the pitch. Two more will:

| Edit | What it establishes |
| --- | --- |
| Same field, a **different** player | The per-player pitch — the delta between the two offsets |
| One player's **rating** ±1 | Where ratings live and how wide they are |
| The **same** player's rating | Ties the ratings block to the flags block for one record |

### Five controlled saves

| Pair | Change | Bytes differing |
| --- | --- | --- |
| T1 → T2 | redshirt removed, player A | **1** — `0x00f31dc8`, bit 7 |
| T2 → T3 | redshirt removed, player B | **1** — `0x00d112c8`, bit 7 |
| T3 → T4 | a rating | 150, in 4 runs |
| T4 → T5 | a rating | 149, in 3 runs |

Redshirt is settled: **bit 7 of a flag byte**, confirmed on two independent
players. Player B's byte was `0x92 → 0x12`, so the other bits in that byte are
further per-player booleans. The two players' bytes are 2,231,040 bytes apart,
which is not a whole number of any small record size — they are in separate
blocks rather than adjacent rows.

The rating edits are not one clean byte, and the reason turns out to matter
more than the edits do.

## Solved: the dictionary

The dictionary is **`madden-franchise/data/zstd-dicts/c27/dict.bin`**, 13,300
bytes, id `0x65fc508b`. It ships with the `madden-franchise` npm package — a
library for EA franchise saves that has been extended to College Football, hence
`c27` alongside the Madden `26` and `27`. Only `c27` matches this save; the
Madden dictionaries do not.

With it, **all 15,408 frames decode, zero failures — 6,846,220 bytes of object
data** out of the 31 MB payload. Frames run 10–1,228 bytes, mean 444.

It is not in the game install at all, which is why scanning there kept coming up
empty.

### Where the data actually sits

Measuring each frame's true compressed extent (the shortest slice that still
decodes to its declared content size — a truncated slice decodes to fewer bytes
without complaining, so length has to be the test) gives the split:

| Region | Bytes | |
| --- | --- | --- |
| zstd frames | 1,544,946 compressed | 5% of the payload, expanding to 6,846,220 |
| plain | 29,608,954 | the remaining 95% |

**Every edit observed so far lands in the plain region, not inside a frame** —
both redshirt toggles and both rating changes. So the player attributes this
project needs are readable without the dictionary at all; the dictionary opens
the other 6.8 MB, which holds events, storylines and sorted collections.

That reframes what the dictionary was for. It is still needed — a rating edit
reorders a sorted collection inside a frame, and without decoding that frame the
diff is buried in recompression noise — but the attribute bytes themselves were
always in the clear.

### The name table

Every player's strings live in **one contiguous array** at `0x00f44e68`:
**17,470 slots of 138 bytes**, of which 16,450 are filled and 1,020 blank. The
array ends at `0x011917d4`. Each slot is five fixed-width string fields:

| Offset | Width | Field | Example |
| --- | --- | --- | --- |
| +0 | 17 | first name | `Carlton` |
| +17 | 33 | asset id | `Unique_SmithCarlton_24796` |
| +50 | 21 | last name | `Smith` |
| +71 | 41 | short asset id | `SmithCarlton_24796` |
| +112 | 26 | hometown | `Norfolk` |

The asset id carries more than a name. Generated players use
`Generic_<asset>_P_T<team>_<build>_<n>_<n>` — all 11,317 of them match that
shape exactly, and the `T` field yields **240 distinct teams**. The remaining
4,496 are `Unique_<Last><First>_<id>`, which carries no team, so roughly 72% of
the roster can be assigned to a team from the name table alone.

The array is not sorted by team: team ids change 11,760 times across the 17,470
slots, so it is insertion or hash order, not a per-team roster block.

### The record size: 192 bytes

The numeric region is strongly periodic at **192 bytes**. Byte-populated-ness
agrees at that lag 89.7% of the time against a 60.0% baseline — nearly +30
points — and the next-strongest lags (384, 576, 768, 960) are all its multiples,
so 192 is the fundamental, not a harmonic. Every region carrying the period
begins on a multiple of 192, so the grid is phase-locked to the payload start.

The two redshirt bytes settle it. On that grid they are **the same column**:

| Edit | Offset | Record | Column |
| --- | --- | --- | --- |
| Redshirt A (T1 → T2) | `0x00f31dc8` | 82,983 | **136** |
| Redshirt B (T2 → T3) | `0x00d112c8` | 71,363 | **136** |
| Flag (T3 → T4) | `0x00f000ff` | 81,921 | 63 |
| Value (T4 → T5) | `0x00f00126` | 81,921 | 102 |

Their gap of 2,231,040 bytes is **exactly 11,620 records** of 192. Two
independent players, edited in separate sessions, landing on the same column an
exact whole number of records apart is not something a wrong stride produces.

**Redshirt is bit 7 of byte +136 of a 192-byte record.**

The last two edits share record 81,921 — one action changed a flag at +63 and a
value at +102 of the same record.

### What a record looks like

Laying the two redshirt records side by side (record start = flag offset − 136):

```
        record A @0x00f31d40              record B @0x00d11240
  +  0  00 23 fe 79 00 23 fe a2 …   |   00 0b 86 91 00 0b 86 ba …
  + 48  00 04 00 00 ff 4a 00 00     |   00 0f 00 00 ff 4a 00 00
  +144  0a aa aa a0 00 02 41 a0     |   0a aa aa a0 41 10 03 a0
  +152  00 00 01 23                 |   00 00 01 21
  +168  80 b7 c0 f2 80 65 4b ec     |   80 b7 c1 06 80 65 4c 3c
```

Constants line up at +52 (`ff 4a`), +58 (`ff 00`) and +144 (`0a aa aa a0`), and
+152/+168/+172 differ only in their low bytes. Same field skeleton, different
values: these are two instances of one record type.

A record opens with **five 32-bit ids** at +0…+19, each appearing exactly once
in the whole 31 MB payload — object identity, not references to anything else.
Record A's are `0x0023fe32`–`0x0023fea2`, record B's `0x000b864a`–`0x000b86ba`:
five ids drawn from a span of 112 in both cases.

### Field encoding

All four plain-region edits are anchored on **bit 7 of a byte**, and the
multi-byte ones changed by exactly `+0x80` and `+0x180`:

| Edit | Change | Reads as |
| --- | --- | --- |
| Redshirt A | `80` → `00` | 1-bit flag, cleared |
| Redshirt B | `92` → `12` | same bit; the rest of the byte is other flags |
| Flag (T3 → T4) | `03` → `83` | 1-bit flag, set |
| Value (T4 → T5) | `20 9d` → `21 1d` | field +1 |
| Value (T3 → T4) | `13 82` → `15 02` | field +3 |

A field whose least-significant bit is bit 7 of the second byte, changing by +1
and +3, is a **bit-packed field read most-significant-bit first** — not a
little-endian integer. That is why no byte-aligned interpretation of the region
has ever made sense.

The fifth edit is the odd one out: `0x014b17d7` sits outside every 192-periodic
region, in sparse 32-bit-aligned data padded with `ff ff ff ff` sentinels. One
user action can touch two unrelated structures.

### Records line up with names

Player index `i` has

- its **strings** at `0x00f44e68 + i × 138`, and
- its **numbers** at `(65890 + i) × 192`.

The base was found from the name table's 1,020 blank slots — a parallel array
should be blank at the same indices, and scanning every start record that keeps
both redshirt edits inside the array peaked sharply at record 65,890.

It was briefly rejected on a bad test. Under a correct alignment, some field of
the record ought to reproduce the team id already known from the asset id;
searching every bit offset for an 8-, 9- or 10-bit field matching it found
nothing, so the alignment was withdrawn. The test was wrong, not the alignment —
the team is evidently not stored as a plain integer in this record. Naming the
four edited players and having all four confirmed settles it:

| Edit | Record | Player index | Player |
| --- | --- | --- | --- |
| Redshirt (T1 → T2) | 82,983 | 17,093 | Damien Priester |
| Redshirt (T2 → T3) | 71,363 | 5,473 | Jabari Scroggins |
| Acceleration (T3 → T4) | 81,921 | 16,031 | Peyton Falzone |
| Strength (T4 → T5) | 81,921 | 16,031 | Peyton Falzone |

### Ratings are 7-bit fields

Bits are packed most-significant-first, so a field of width `w` ending at record
bit `e` covers bits `[e−w+1, e]`. The two confirmed edits give two of them:

| Field | End bit | Byte | Falzone T3 → T4 → T5 |
| --- | --- | --- | --- |
| **Acceleration** | 504 | 63 | 88 → **89** → 89 |
| **Strength** | 824 | 103 | 65 → 65 → **66** |

Read as 7 bits, neither exceeds 99 and neither is 0 for **any** of the 16,448
players; acceleration averages 80.2, strength 66.8. Read as 8 bits, half the
league lands above 99. Seven bits is the width.

That gives a filter chance cannot pass: seven random bits exceed 99 for 22% of
players, so a position where not one of 16,448 players falls outside 1–99 is a
bounded quantity. **69 positions** qualify, and the gaps between consecutive
ones are dominated by 7 — ratings packed back to back. The block runs from
about byte 60 to byte 123 of the record, roughly 59 fields, which is the size of
an EA player rating set.

Sanity check on the extraction: across T3, T4 and T5 the only two fields that
move for Falzone are the two he edited. Every other field holds still.

### Redshirt

Byte 136 changed `0x80 → 0x00`, which most-significant-first is record bit
**1088**:

| Player | T1 | T2 | T3 |
| --- | --- | --- | --- |
| Damien Priester | 1 | 0 | 0 |
| Jabari Scroggins | 1 | 1 | 0 |

Priester's redshirt comes off in the second save and Scroggins's in the third,
matching how the saves were taken.

### The rating map

Peyton Falzone's card, read off the game in TEST5, gave 53 known values against
the record. Positions follow from four constraints, none of them guesswork:

1. The 7-bit value at that position must equal the card value.
2. It must never exceed 99 for any of the 16,448 players.
3. Fields are 7 bits, so no two may sit within 7 bits of each other.
4. Acceleration is 504 and Strength 824, fixed by the controlled edits.

That leaves 37 ratings pinned to exactly one position. The rest were ties
between ratings sharing a value, and the league itself separates those: Spin
Move tracks Juke Move at r=0.91, Pass Block Power tracks Pass Block Finesse at
0.91, Zone Coverage tracks Man Coverage at 0.85, Break Sack tracks Throwing
Power at 0.68 while the other candidates sit near zero.

| Bit | Rating | Bit | Rating |
| --- | --- | --- | --- |
| 294 | Deep Route Running | 746 | Injury |
| 490 | Agility | 753 | Impact Blocking |
| 497 | Play Action | 778 | Deep Throw Accuracy |
| 504 | **Acceleration** | 785 | Short Throw Accuracy |
| 522 | Pass Block Power | 799 | Medium Throw Accuracy |
| 536 | Awareness | 810 | Throw on the Run |
| 543 | Pass Blocking | 817 | Trucking |
| 560 | Release | 824 | **Strength** |
| 568 | Pass Block Finesse | 831 | Tackling |
| 575 | BC Vision | 842 | Catching |
| 586 | Break Tackle | 849 | Speed |
| 593 | Finesse Moves | 856 | Spin Move |
| 600 | Break Sack | 863 | Stamina |
| 607 | Block Shedding | 874 | Toughness |
| 618 | Man Coverage | 888 | Throwing Power |
| 625 | Medium Route Running | 895 | Short Route Running |
| 632 | Change of Direction | 906 | Run Block Power |
| 650 | Throw Under Pressure | 913 | Run Block Finesse |
| 657 | Spectacular Catch | 920 | Run Blocking |
| 671 | Catch in Traffic | 927 | Stiff Arm |
| 682 | Kick/Punt Return | 938 | Power Moves |
| 689 | Hit Power | 945 | Press |
| 696 | Carrying | 952 | Pursuit |
| 703 | Lead Block | 984 | Play Recognition |
| 714 | Juke Move | 991 | Zone Coverage |
| 721 | Jumping | 728 | Kicking Accuracy |
| 735 | Kicking Power | | |

All 53 reproduce the card exactly, none overlap, and between TEST3 and TEST5 the
only two that move are the two that were edited.

Deep Route Running at bit 294 sits well outside the block the rest occupy, which
looked like an artefact until it turned out to track Short Route Running at 0.81
and Medium Route Running at 0.84. It is genuinely the third route stat, stored
apart from its siblings.

Bit 529 also reads 68 for Falzone and would have fitted Trucking or Stiff Arm,
but it correlates with nothing — r≈0.02 against every ball-carrier rating, where
both 817 and 927 track Break Tackle at 0.69 and 0.73. It was never a field.

**The five ambiguous pairs are settled.** A save raising one member of each by
a single point, on Lamar Brown, moved exactly one bit per pair:

| Rating raised | Bit that moved | Was labelled |
| --- | --- | --- |
| Medium Throw Accuracy | 785 | Short Throw Accuracy — **swapped** |
| Run Block Finesse | 906 | Run Block Power — **swapped** |
| Stiff Arm | 817 | Trucking — **swapped** |
| Power Moves | 938 | Power Moves — correct |
| Change of Direction | 632 | Change of Direction — correct |

Three of five were the other way round, which is what fifty-fifty guesses do.
The two that held were the two with independent evidence behind them: defensive
tackles average more Power than Finesse Moves, and Speed correlates with
Acceleration at 0.85 where Change of Direction manages 0.76.

Two of the three swaps also make the league read *more* like football than the
originals did, which is corroboration rather than proof but is worth recording:
quarterbacks now average Short 77 > Medium 75 > Deep 74, in that order, and
fullbacks now average Trucking 70 against Stiff Arm 62 rather than the reverse.

Every rating is now fixed by a controlled edit or a rating card. There are no
undetermined labels left.

### A sixth change that was not an edit

That save showed six changed fields, not five. The sixth was a 7-bit read
ending at bit 560, which had been labelled Release. It is not a field at all:
the overall rating occupies bits 555–561, so a window ending at 560 shares six
of its seven bits and moves whenever overall does. Lamar Brown went 95 → 96, and
that alone accounts for it. Across all 16,448 players the two never move
independently — not once.

The real Release is bit **959**, which averages 72 for wide receivers, 69 for
tight ends and 43 for linemen. Bit 560 averages 34 for every position in the
game, flat, which no receiver rating does. Both read 43 for the player whose
card built the map, so the solver had no basis to choose and picked wrong; a
position profile is what separates them, and is now the check every assignment
has to pass.

### Position, and an overall

Two more fields fell out once the rating block was known.

**Position** is a 5-bit field ending at bit **1010**, with exactly 21 values —
the size of an EA depth chart. Grouping the league by it produces football:

| Code | | Mean of the group |
| --- | --- | --- |
| 0 | QB | Throwing Power 85, everything else ordinary |
| 5–9 | LT LG C RG RT | Strength 82, Pass Blocking 76, Speed 63 |
| 10–12 | LE RE DT | Tackling 76, Block Shedding 71 |
| 16–18 | CB FS SS | Speed 86, Man Coverage 68 |
| 19–20 | K P | Kicking Power 82, and nothing else above 40 |

**Overall** is a 7-bit field ending at bit **561**. What identifies it is that
for *every* position it tracks the ratings that position is judged on —
Catching 0.75 for tight ends, Run Blocking 0.75 for tackles, Tackling 0.81 for
defensive tackles, Kicking Power 0.87 for kickers, Man Coverage 0.79 for
safeties — plus Awareness between 0.77 and 0.89 throughout, which is how EA's
overall behaves. League mean 68.9, range 40–99.

Both are confirmed from outside the file: sorting the league by overall returns
real, correctly-ranked players at their real positions and hometowns — Keelon
Russell QB Duncanville, CJ Carr QB Saline, Bryce Underwood QB Detroit, Malachi
Toney WR. None of that went into deriving either field.

### The team

An **8-bit field ending at bit 431**. It cuts the league into **138 rosters of
exactly 85** — the scholarship limit — plus one bucket of 4,718 players with
value 255, who are on nobody's roster: recruits and the transfer portal.

It was found by taking 41 players named on one programme's in-game roster screen
and asking which field they all share. They share this one, at value 74, and
exactly 85 players in the whole save carry it. Every other team came out at 85
too.

Two independent confirmations, neither used to derive it. Team 74's depth chart
reproduces the roster screen position by position. And both players whose
redshirts were toggled in the very first controlled saves — Damien Priester and
Jabari Scroggins — are on team 74, which is what you would expect of edits made
by the person coaching that programme.

**Why three earlier attempts failed.** All three scored candidates against the
team id in a player's asset name. That id agrees with the real team field
**3.2% of the time**: it records the programme a generated player was created
for, in an entirely different numbering. Any correct answer would have scored
near zero against it, and the field that scored 86% was matching something else.
The ground truth was wrong, so every test built on it was measuring the wrong
thing — which no amount of care with precision, recall or bucket shape could
have rescued. A list of players known to be on one roster settled it in a single
pass.

### Team names: present, but not linked to rosters

The save carries all 143 schools — a table of 503-byte records holding a slug
(`teamdb_psu`), a full name, a nickname, hashtags, chants and a motto. What it
does not carry, anywhere yet found, is the join between those records and the
roster team ids. Eight approaches came up empty:

| Approach | Result |
| --- | --- |
| Table order | Alphabetical. Penn State is entry 95 there, team 74 on rosters |
| A field in the team record | The record is **entirely strings** — not one non-text byte in it |
| The generation id in a player's asset name | Unrelated to where they play: mean 4.7% of a roster, 94 values for 138 teams |
| Rivalry records | Pure strings, nothing numeric within ±160 bytes |
| A name table in roster order | 29,302 base-and-stride windows tested, none |
| The 8-byte abbreviation arrays | 336 entries with repeats, no ids — a reference list, not a table |
| A per-team standings array | Every candidate with 9 at index 74 was an incrementing counter |
| The decoded zstd frames | 6.8 MB of object data containing no school-name strings at all |

The team record being pure text is the decisive one: whatever numbers link teams
to rosters, they are not stored beside the names.

So the app has the user name teams from the save's own list. Their own
programme is one click; the rest can be named as they are browsed, and each
name sticks.

### Still unmapped

Class year, the schedule, standings, the recruiting board and coach records are
all still unread, along with the player→team link above.

### What this buys immediately

Diffing *decoded frames* rather than the compressed payload is dramatically
sharper, because recompressing a frame moves hundreds of bytes that have nothing
to do with the edit:

| | Compressed payload | Decoded frames |
| --- | --- | --- |
| One rating edit (T3 → T4) | 150 bytes across 4 runs | **1 frame, 4 bytes** |

And those four bytes are legible: bytes 424/440 swap `39 ↔ 120` and bytes
431/447 swap `14 ↔ 13`, sixteen apart — two 16-byte entries exchanging places.
That is a sorted collection being re-ordered by the edit, not the rating itself,
which puts the rating value in the plain region rather than the frames.

## The former obstacle: a dictionary that is not in the save

The payload contains **15,408 zstd frames**, mean content 209 bytes. Every one
declares the same dictionary:

```
28 b5 2f fd   zstd magic
63            frame header: single segment, 4-byte dictionary id
8b 50 fc 65   dictionary id 0x65fc508b
a2 00         content size, 162 bytes
```

Decoding one without it returns exactly `Dictionary mismatch`, and the zstd
dictionary magic (`37 a4 30 ec`) appears **nowhere in the save**. So the game
objects — ratings, positions, the player-to-team link — sit inside frames that
cannot be opened without a dictionary that ships with the game rather than the
save.

That also explains the noisy rating diffs: part of what changed was a frame
being recompressed, not the field itself.

**This is the blocker now.** The flags that live outside the frames (redshirt,
and whatever shares that byte) are readable today. Everything inside them waits
on the dictionary.

### Where the dictionary lives

A scan of a real install (71 files, 6 GB) found:

| File | Finding |
| --- | --- |
| `CollegeFB27.fixed.exe` @ `0x78858c6` | a zstd dictionary, id `0x85452274` |
| `Data\Win32\superbundlelayout\…\cas_12.cas` @ `0xd3be103` | contains the id `0x65fc508b`, no dictionary magic |

**The executable embeds formatted zstd dictionaries.** The first scan reported
only one because it stopped at the first magic per file; it now enumerates every
occurrence, so a second pass should surface `0x65fc508b` if it is in there.

The frames declare a non-zero dictionary id, which means the dictionary is
*formatted* — magic, id, entropy tables, content — rather than a raw byte blob.
So it carries the magic and is findable by scanning for it.

### Verifying a candidate

A dictionary's content is the tail of its buffer, so appending bytes changes it
and decompression fails; truncating from the end is tolerated. The exact length
therefore matters, and rather than parse the dictionary format the scanner
sweeps candidate lengths and tests each against a real frame taken from the
save. A frame is a couple of hundred bytes, so thousands of attempts cost
milliseconds. A candidate is only reported as verified when a frame actually
decompressed with it.

Node gained zstd with dictionary support in 22.15, confirmed round-tripping
here, so once the right bytes are found the frames open with no extra
dependency.

### Saves seen so far

| Saved | SHA-256 (first 8) | Inflated |
| --- | --- | --- |
| 2026-08-30 13:09:27 | `860b83d7` | 31,131,540 |
| 2026-09-04 08:35:00 | `2b1c869a` | 31,153,900 |

Both decode identically, five days apart, which says the container is stable
across play sessions rather than something that happened to work once.

## Reproducing this

The Windows app's **Save** section runs this analysis on your own machine and
exports the report, so the save itself never has to be sent anywhere.

**Compare with another save…** in that section does the diff above: pick two
saves and it lists every byte that changed, with the bit that moved. Since the
payload is deterministic, the workflow is: save, change one thing in-game, save
again, compare — and read the field straight off.

## The unrostered pool is not the recruiting class

Every player the save leaves off a roster — the 138 schools hold exactly 85
each — lands in one pool of about 4,700. It contains three kinds of people:
recruits, players in the portal, and players who have left.

The asset id separates them. Real players carry an authored `Unique_` face and
generated players a `Generic_` one, which in one Penn State save is 180 against
4,528. That is what put Malachi Toney at 99 and Jadan Baugh at 95 on top of a
list of supposed recruits.

Validated against a class list from the same save, on 38 labelled players:

| | Labelled | Asset id |
| --- | --- | --- |
| In the recruiting class | 28 | all `Generic_` |
| Flagged as not a recruit | 10 | all `Unique_` |

No errors in either direction. Examples: `Unique_PiercePayton_5831` and
`Unique_PruittCam_22469` against `Generic_4202_P_T0198_M_8_1` (Moses Beckner,
the top recruit).

A residual remains. Two generated players in that save rate 89 and 86 against a
best real recruit of 83, and the generated pool is 4,528 where the class list
counts 4,100.

### Bit 658, provisional

Once a player is known to be unrostered and generated, bit 658 separates the
recruits from the rest. Against a class list for the same save:

| | |
| --- | --- |
| Selected | 4,108 (the game counts 4,100 prospects) |
| Dropped | 420, including Carter Landry 89 and Dorian Exum 86 |
| Best eight kept | the same eight the game lists, at the same ratings |
| Known recruits kept | 28 of 28 |

It is **not** an "is a recruit" flag on its own: it is also set on 6,682 of
11,730 rostered players, so it means something broader and only does this job
in combination with the other two conditions. It was found from 28 positive and
2 negative examples, which is thin, so the corroboration above matters more
than the fit — and it stays labelled provisional until a full class export
confirms it.

### A standalone prospect flag: looked for, not found

No field in the record is set for recruits and clear for rostered players.
Every 1- to 4-bit position was tested against that condition directly and
**none** passed, which is why bit 658 has to be combined with the roster and
asset-id tests rather than used alone.

Earlier attempts fitted the outliers and failed on data they were not fitted
to — bit 1306 among them, also set on 6,682 rostered players.

Searching for the recruiting table itself, by looking for a prospect's record
index repeated at a constant stride, found nothing at 16- or 32-bit alignment.
It is probably bit-packed, like everything else in this record, which that
scan would not see.

The search was worthless by construction — two outliers is not enough
constraint to distinguish a real field from thousands of coincidences. Ten
fields shaped like a star rating (five consecutive values, monotone in overall)
turned up the same way, and none matched the known distribution of a real
recruiting class.

What this needs is ground truth from a single save: the list of who is actually
a prospect, with stars and class, alongside the save itself. That is how the 53
ratings were solved, and guessing has been worse than useless everywhere it has
been tried here.

## Recruiting fields

Solved against a 4,100-row export of the game's own recruiting class for the
same save. Every field had to agree with all 4,026 unambiguously named players
— names occurring twice were dropped, because a single bad pairing rejects a
correct field — so these are readings rather than fits.

| Field | Bit | Width | Note |
| --- | --- | --- | --- |
| Height | 650 | 7 | inches |
| Weight | 365 | 8 | plus 160 |
| Stars | 1241 | 3 | plus 1 |
| NIL demand | 171 | 9 | $K, minus 255 |
| Class year | 1189 | 2 | HighSchool, JuniorCollege_Sophomore, JuniorCollege_Junior |
| Development trait | 322 | 2 | Normal, Impact, Star, Elite |
| Home state | 998 | 6 | 48 values |
| Pipeline | 1037 | 6 | 42 values |
| Dealbreaker | 867 | 4 | 8 values |
| Ideal pitch | 1109 | 5 | 20 values |
| Archetype | 511 | 3 | read against the position — the names are reused |

The same export settled bit 658: of 4,528 unrostered generated players it keeps
all 4,100 in the class, misses none, and admits 8 that are not, which is 99.82%
against a source that had no part in finding it.

It also confirmed the rating map from outside this project for the first time.
Overall, position, hometown and every rating the export carries — Speed,
Acceleration, Agility, Strength, Awareness, Jumping — agree on 4,068 of 4,100,
the 32 exceptions being duplicate names paired to the wrong record.

### Still missing, and how to get it

Recruiting **stage**, **gem/bust**, **commit score**, **total offers** and
**school interest** are not in the player record. They change while recruiting
happens and belong to a table elsewhere in the save.

Two things now point at it.

**The join key is known.** Bit 191, 14 bits, is the game's own player id — the
same id the class export prints, exact on all 4,026 unambiguous recruits.
Earlier searches failed because they traced the *record index*, which nothing
outside the record uses.

**Two candidate regions.** Scanning the payload for 16-bit values that are
valid prospect ids, against a 6.3% chance rate:

| Offset | Density | Row stride |
| --- | --- | --- |
| `0x0186a000` big-endian | 47.3% | 4 bytes, 1,830 consecutive |
| `0x01580000` little-endian | 37.4% | 4 bytes, 1,529 consecutive |

A run of 1,830 entries at a fixed stride is a table, not a coincidence.

### What a week-advance diff ruled out

Two saves a week apart, each with the game's own class export, gave 688 stage
changes and 787 offer changes — 1,275 prospects moved in total. Four things
follow, all negative:

- **Not in the player record.** A field would have to give the same mapping in
  both saves; across 2,718 prospects paired by player id in each, every 1- to
  6-bit position fails for stage, offers, gem/bust and commit score.
- **The id index at `0x1869000` is static.** All 4,098 prospects have a 4-byte
  row there and **not one changed**, including the 1,275 whose state moved. It
  is a sorted key list, not the state.
- **No parallel array.** Nothing byte- or nibble-aligned, in prospect-id order,
  maps to stage or offers anywhere in the payload.
- **Commit score does not change week to week** — 0 of 4,100 — so it is a fixed
  property of the recruit rather than a running total, which is worth knowing
  before hunting for it as a counter.

The payloads also differ in length by 540 bytes, so raw byte diffing shifts out
of alignment partway through and cannot be trusted on its own.

### One scholarship: 52 bytes

Two saves differing only by one scholarship offer differ by **52 bytes in 12
clusters**, and the payloads are the same length, so every offset lines up.
That one experiment says more than the week-advance did.

**No player record changed at all.** Not by search this time, by experiment: an
offer touches nothing in the 192-byte record.

**The save addresses rows by handle, not by offset.** Every structure that
moved is built from 4-byte handles — a 16-bit table tag and a 16-bit row index.
Tags seen in the changed clusters alone: `0x209a`, `0x213e`, `0x2160`, `0x2172`,
`0x219c`, `0x2d5c`, `0x2dc4`, `0x2dce`. This is why every earlier search failed.
There is no flat array in prospect order to find; there are tables joined by
handles, and a prospect's recruiting state is reached by following one.

**The offer itself is an append.** At `0x14bb110` a counter goes 37 → 38, and
immediately after it a list of 4-byte handles runs `0x21600005` … `0x2160002a`,
with `0x2160002a` newly written at the end. One offer, one appended handle into
table `0x2160`.

A second list, of `0x209a` handles at `0x18e2087`, was **reordered** — one
element moved to the end — which looks like a board or priority ordering rather
than a value.

### The recruiting row, found

The export for the *after* save named the change: a swap, not an addition.

| Prospect | Record | On My Board | Total Offers |
| --- | --- | --- | --- |
| Dee Dawsey | 3542 | No → Yes | 1 → 2 |
| J.P. Putzier | 16245 | Yes → No | 2 → 1 |

Both changed bytes sit exactly **12 bytes after that prospect's record index**,
stored as a big-endian 16-bit value:

```
0x122b56a  0d d6 ...  Dawsey  (3542)   byte at +12: 06 -> 0a
0x122ef42  3f 75 ...  Putzier (16245)  byte at +12: 09 -> 05
```

**Board state is bits 2-3 of that byte**: `1` off the board, `2` on it. Dawsey
goes `01` → `10` and Putzier `10` → `01`, in opposite directions, which is what
makes this a reading rather than a coincidence.

Note the prospect is named by **record index**, not by the 14-bit player id —
neither player id appears anywhere near any of the twelve changed clusters.

The rows sit on a **24-byte stride** (the only divisor of the 14,808-byte gap
between the two confirmed rows that holds up), spanning roughly `0x12271ea` to
`0x123f7ea`, where 47% of slots hold a prospect record index against a 4%
chance rate. 2,002 of 2,718 resolvable prospects are found there.

### Recruiting hours

A second pair of saves — one scholarship offer, then hours spent on one recruit
— moved 28 bytes, and one of them is a counter that reads the same way the game
does:

| Save | Counter at `0x11c190a` | Change |
| --- | --- | --- |
| before | 65 | |
| after a scholarship offer | 70 | +5 |
| after spending hours on a recruit | 120 | +50 |

Five hours for an offer and fifty for a recruiting session are the game's own
costs, which is what confirms the reading. The counter sits inside a record
tagged `2d ce 00 4a`.

The rest of that diff is an action log rather than prospect state. Spending
hours appends a handle to a `0x209a` list and writes a record built from
`0x2172` and `0x2d5c` handles in the region around `0x1da400`. **No prospect's
row changed at all.**

That is worth taking seriously as a structural hint. Spending hours on a
recruit changes nothing about the recruit until the week advances, and commit
score did not move for a single one of 4,100 prospects across a week either.
Both are consistent with stage and commit score being **derived** at read time
from the action log and the prospect's static attributes, rather than stored
per prospect — which would explain why no column for them exists to be found.
That is a hypothesis, not a reading, and it is not settled.

### What is still open

No column solved yet — stage, offers, gem/bust and commit score all fail the
exact-match test at every position in the 24-byte row. The likely reason is
that row identification still admits false positives: at 47% density, some
slots match a prospect index by chance, and one bad pair rejects a correct
column.

What fixes it is more confirmed anchors. Each single-change diff pins one row
exactly, the way these two did. A handful more — different prospects, different
actions — would let the row layout be settled by agreement between known rows
rather than by searching against noisy ones.

## The save describes itself

This should have been the first thing looked for, and it was not.

The payload carries a **type registry**: 20,562 distinct names, 243 of them
array stores. The structures that have cost the most effort are all in it, named
plainly:

| Name | What it almost certainly is |
| --- | --- |
| `SchoolOffer` | offers, per recruit per school |
| `SchoolPipelineInfluence` | school interest |
| `RecruitTarget`, `UserRecruitTarget` | the recruiting board |
| `RecruitingBoardRecruitListStore` | the board's list store |
| `Prospect`, `Committed`, `ProspectInteraction` | commitment state |
| `ScheduleKnownGame`, `ScheduleStructureEntry` | schedules |
| `SeasonCoachStats`, `CareerCoachStats`, `CoachAward` | coach history |
| `TeamStats`, `SeasonInfo`, `TeamValueTrackingTable` | team records |

The schedule stores are named per conference and per season —
`ScheduleStructureEntryArrayStoreBig100` through `Big105`, `SEC01`, `ACC27`,
`Pac12`, and `ScheduleNeutralStadiumArrayStore2026` through `2054`. Individual
fixtures are named outright: `Air_Force_Army_Game`, `Air_Force_Navy_Game`.

This does not hand over the field layouts. It does say what exists, what it is
called, and roughly where each store sits, which is the difference between
searching a 31 MB file and reading an index. Every remaining unknown —
recruiting stage, commit score, interest, schedules, standings, coach history —
has a named home.

### What this means for the method

The bit-hunting that solved the ratings, the recruiting fields and the coach
table worked, but it was the hard way round. The order should be: find the
structure by name, then read its rows, then use a controlled diff only to
confirm which column is which.

## The game's own schema

The game ships a type schema — 3,526 types with member names, types, bit widths
and full enum tables — and it settles by inspection what months of searching had
to infer. It is the game's data, dumped, the same category as the zstd
dictionary this project already uses. Nobody's implementation was read.

It also explains the one thing that kept failing. Recruiting state is not in the
player record and never was:

```
Recruit                                RecruitTarget
  Class            RecruitingClass 4b    CommitScore is here?  no:
  CommitScore      int 0..1023           ProspectInfluenceTotal, hours,
  NationalRank     int 0..4500           NIL offer, scholarship status
  Player           Player  <-- a link    Recruit  <-- a link
  PositionRank     int 0..4000
  QualityModifier  GemBust 3b          SchoolOffer
  RecruitStage     RecruitStage 4b       HasOffer, InterestLevel,
  StateRank        int 0..4000           OfferInterestLevel, Team
  TopSchoolsList   ProspectTargetSchool[]
  TotalScholarshipOffers int 0..63     ProspectTargetSchool
                                         TeamId        int 0..2047
RecruitStage: Top10 Top5 Top3 Battle     TeamInfluence int 0..65535
  SoftCommitted HardCommitted Signed
```

The schema confirms work done without it, which is the useful check: the
`Pipeline` enum is 6 bits with `0=Alabama 1=Arizona 2=Arkansas 3=BigApple
4=BigSky 5=CentralFlorida`, exactly the width and table derived earlier from a
class export.

## Team id to school, without being told

`ProspectTargetSchool` is a `{ TeamId, TeamInfluence }` pair, stored as two
16-bit values, and every recruit has ten of them. Finding one recruit's ten
influences in the payload — 485, 357, 144, 69, 59, 56, 56, 55, 55, 55 — located
the array at a 4-byte stride, and the ids beside them are the same team ids the
player records carry.

Matching 4,037 of 4,100 top-ten lists against the class export names every id by
majority vote. No id agrees below 88%, no school is claimed twice, and all 138
are covered.

The order is EA's, and old: **0-113 are the FBS schools alphabetically**, and
**114-137 are the ones added since**, appended rather than merged in. Air Force
is 0, Sac State is 137, Penn State is 74 — which independently matches the team
id its players carry.

This closes the oldest gap in the project. The save still never writes a school
against a roster, but it no longer has to: DCC names all 138 itself.

## What else the schema answers

It is a dictionary, not a map. It names every field and gives its exact width
and enum values, but it does **not** give byte offsets, so each structure still
has to be located in the payload. Everything still outstanding is described in
it:

| Structure | Members | What it covers |
| --- | --- | --- |
| `ScheduleKnownGame` | 9 | `HomeTeam`, `AwayTeam`, `SeasonWeek`, `Stadium`, `DayOfWeek`, `IsKickoffGame` |
| `TeamStats` | 58 | `HOMEWINS`, `BOWLSMADE`, `BOWLSWON`, `CFPSWON`, `CONFCHAMPSWON`, `DEFPASSYARDS`, `FIRSTDOWNS` |
| `CareerCoachStats` | 26 | `Wins`, `Losses`, `NCWins`, `BowlWins`, `RivalWinStreak`, `TimesFired`, `DraftPicks` |
| `SeasonCoachStats` | 2 | `Wins`, `Losses` per season |
| `SeasonInfo` | 59 | `CurrentWeek`, `CurrentSeasonYear`, and the stage flags that drive the calendar |

### The layout rule is not cracked

Knowing a record's members does not give their offsets. Five orderings were
tested against 34 fields whose bit positions are already known — index order,
alphabetical, reverse alphabetical, widest-first, narrowest-first — and none
reproduces them at a constant offset; the best manages 3 of 34.

There is structure in the failure. Sorted by bit position, the tail of the
player record is nearly alphabetical — `SpeedRating` 849, `SpinMoveRating` 856,
`StaminaRating` 863, `ToughnessRating` 874 — while `StiffArmRating` at 817 and
`StrengthRating` at 824 sit before them and should sort after. So the order is
close to alphabetical over some grouping that has not been identified.

Cracking that would make every remaining field mechanical rather than searched
for. Until then the method is the one that just worked for team ids: take a
value the schema names, find it in the payload by its value, and confirm the
stride.

## The store directory

Every table in the save announces itself, and the announcement is enough to
build an index from:

```
"SPBF"  486  1                schema version — matches the published schema
<len> "ScheduleKnownGameStore"
"BSFT"  ... 960 ... 9         rows, then members
```

`readStores` walks these. 88 stores, and the counts agree with the schema —
`ScheduleKnownGame` has 9 members in the schema and its store reports 9.
The ones that matter:

| Store | Rows | Members | What it is |
| --- | --- | --- | --- |
| `SeasonGameStore` | 983 | 69 | the season's games, with scores by quarter |
| `ScheduleKnownGameStore` | 960 | 9 | fixed fixtures |
| `HighSchoolProspectTopSchoolsStore` | 41,010 | 2 | school interest — the table found by value earlier |
| `HistoryEntryStore` | 38,400 | 9 | history entries |
| `PlayerSeasonStatRecordStore` | 1,305 | 9 | player stats by season |
| `PlayerCareerStatRecordStore` | 1,341 | 9 | player stats by career |

### Schedules: located, not decoded

`SeasonGameStore` is at `0x1abf13b` with 983 rows, and the schema names
`HomeTeam`, `AwayTeam`, `HomeScore`, `AwayScore`, four quarter scores each,
`GameDateDay`, `GameDateMonth` and `GameStatus`. The quarters have to sum to
the total, which is a check that needs no outside data.

Searching for that identity near the header, over strides from 48 to 256
bytes and every bit position, finds nothing — once runs of zeros and constant
bytes are excluded, which both satisfy it trivially. So the score fields are
not adjacent in the row, which is the same finding as for the player record:
**the row layout does not follow the schema's member order**, and the rule it
does follow is not yet known.

`ScheduleKnownGameStore`'s rows were found (base `0x14c8b3f`, 16 bytes, a
counter at +12) and hold no team ids inline. Teams are references, resolved
through some table not yet identified.

Two things would finish this: the layout rule, which would settle every store
at once; or one game's known score, which would anchor `SeasonGame` the way a
recruit's ten influences anchored the interest table.

## The layout rule: what was tried

The goal was a rule that maps a type's members to their bit offsets, so that
every store could be read from the schema alone. It was not found. What was
established, so nobody repeats it:

**Anchors.** 58 fields of the player record with a verified end bit and a
schema width — 47 ratings plus Position, TeamIndex, Height, Weight, PlayerType,
OverallRating, TraitDevelopment, ProspectStarRating, HomePipeline,
RecruitingDealbreaker and IdealRecruitingPitch. The schema's widths agree with
the searched ones in every case, which is a strong check on both.

**One correction.** A type's own attribute list already includes everything it
inherits — `Player` lists 288 members, 120 of them also in `FootballPlayer` —
so flattening base classes on top counts them twice. Every layout test before
that was found was run on 409 members instead of 271.

**Rules tested, on the corrected list, by pairwise order over 1,653 anchor
pairs.** A correct rule scores 100%; random scores 50%.

| Rule | Agreement |
| --- | --- |
| schema index (which is alphabetical for `Player`) | 61.3% |
| name, byte order or lower-cased | 61.3% |
| base class first, then derived; or the reverse | 59.6% / 61.3% |
| width descending, then name | 43.6% |
| FNV-1, FNV-1a, djb2, sdbm, Java, CRC32, MurmurHash3, Adler — as-is, lower-cased, with and without the `Rating` suffix | 40–57% |

So the order is neither a sort of the member list by any of these, nor a hash
of the name.

**What the positions do show.** Ratings sit in runs of 7-bit fields separated
by gaps that are very often exactly 4 bits, with the same 4-bit gap recurring
before `PassBlockPower`, `BreakTackle`, `ManCoverage`, `KickReturn`, `JukeMove`,
`Injury`, `RunBlockFinesse` and `PowerMoves`. Within a run the names are
locally alphabetical more often than chance — `PowerMoves, Press, Pursuit,
Release` — but not reliably. That reads as fields grouped into sub-structures,
each with its own internal order, rather than one sorted list.

**What it caught.** `ThrowUnderPressure` at bit 650 and `Height` at bit 650
cannot both be true. Height is verified on all 16,448 players; the rating was
mapped from one player's card, and that player's throw-under-pressure equalled
his height in inches. DCC now lists 52 ratings and names the 53rd as unplaced.

The working method is unchanged: find a store by name in the directory, find a
field by its value, confirm the stride. It is slower than a rule would be, and
it is what has actually worked.


## The season's games

`SeasonGameStore` holds every game of the season: 983 rows of 100 bytes,
starting after the store's `BSFT` header words and its one word per member.
The rows are the schedule, the results and the conditions.

**A row is references first, then packed scalars.** The first 72 bytes are
four-byte handles — a 16-bit table tag and a 16-bit row — most of which point at
stat caches and are empty for a game that has not been played. The scalars begin
two bits into byte 72 and are bit-packed, most significant bit first.

| Field | Bit | Width | Notes |
| --- | --- | --- | --- |
| Kickoff | 578 | 11 | minutes after midnight; 2047 is the schema's "unset" |
| Attendance | 589 | 19 | |
| Home score | 640 | 8 | includes overtime |
| Away score | 648 | 8 | |
| Temperature | 664 | 8 | °F + 40; the schema's floor is -40 |
| Home OT / Away OT | 676 / 683 | 7 | one total, not per period |
| Away Q1–Q4 | 690, 697, 747, 754 | 7 | |
| Home Q4–Q1 | 708, 715, 722, 729 | 7 | stored in reverse order |
| Wind speed | 736 | 5 | mph |
| Month | 778 | 4 | |
| Weather | 782 | 4 | the game's own `Weather` enum |
| Simulated | 786 | 1 | |
| Season week | 791 | 4 | |
| User played | 789 | 1 | |
| Overtime | 790 | 1 | |
| Day | 795 | 5 | |

**Teams are the two handles at bytes 12 and 40**, away first, then home, both
tagged `0x319e`. They are *not* the team ids players carry. They index the
143-row team table, whose order is every school sorted by full name with UConn
filed under Connecticut — verified against 44 team appearances across 29 games
named from a season schedule and one week's scoreboard.

**How it was found.** Every field above was located by taking a box score,
searching every bit position in the row for that value, and keeping only
positions that reproduced all nine of one team's games. The team fields resisted
that method entirely: no field of any width from 6 to 16 bits is consistent for
a team across the games it plays, because the teams are references rather than
values. The give-away was that a row's own references belong to the *next*
row's game — the record framing is offset by one from the scalar block — so
reading the handles from the preceding row's slot resolved all 28 test games at
once.

**Negatives worth keeping.**

- The TV network is not in the save. `BroadcastNetwork` exists but its enum is
  only National, Streaming, TBD and None, so the FOX/CBS/BTN labels other tools
  show are derived from conference and kickoff slot, not read.
- `TimeOfDayEnum` (a 31-value slot list, `T1100` through `T2300`) belongs to
  `ScheduleKnownGame`, not to a season game. A season game stores plain minutes.
- `ScheduleKnownGameStore` turned out to be 960 rows of 16 bytes holding index
  entries, not team references. It is not the schedule in any useful sense.
- December rows carry week numbers from the regular-season range, so week alone
  does not separate bowls; the month does.


## Writing to a save

The container is a fixed-size file: an 82-byte `FBCHUNKS` header whose chunk
record carries the compressed length at offset 74, one zlib stream, then slack.

**There is no checksum.** Three saves of the same dynasty carry different
amounts of stale data past the end of their streams — bytes left over from an
earlier, longer save — which a verified file could not do. The only field that
has to be updated alongside the stream is the length at offset 74. Node's zlib
at level 9 compresses the payload smaller than the game's own stream, so a
rebuilt save always fits back in its original file length.

**Confirmed against an independent writer.** DynastyOS was used to change one
game — Penn State at USC, kickoff 3:00 PM to 12:00, 71°F to 33, partly cloudy
to overcast, 12 mph to 20 — and the resulting save was diffed against the
original. Sixty bytes changed in the whole 31 MB payload, of which seven were
in the game table. DCC's writer, asked for the same change, produces five
changed bytes, and all five hold the same values DynastyOS wrote. That is
simultaneously a confirmation of the bit positions for kickoff, temperature,
weather and wind, and of the write path itself.

The two bytes DCC does not write are worth recording. One is a single bit
inside the unidentified region at bits 608–639, which reads 1 for every
overcast and partly-cloudy game in the save; DynastyOS set it to 0 while
setting the weather *to* overcast, which disagrees with every other overcast
game. The other lands in byte 3 of the *following* game's record, a different
fixture entirely. Neither is copied.

**What the writer refuses.** The payload is edited in memory and then checked
to differ from the original only at the bytes the edit was allowed to touch; the
rebuilt file is re-read, re-inflated and re-decoded, and each edited field is
confirmed to read back as the value asked for, with the other three confirmed
unchanged. Any failure returns before the save is touched. The original is
copied to a timestamped `.dccbak` first, and the new bytes are written beside
it and renamed, so an interrupted write cannot leave a truncated save.

Validation comes from the schema rather than from guesswork, which matters:
DynastyOS offers Fog as a condition, and the game's `Weather` field has no Fog,
so choosing it fails with *"Argument is not a valid enum value for this field.
You passed in Fog."* DCC only offers values the field can hold.


## Recruiting

### School interest, solved

`HighSchoolProspectTopSchoolsStore` holds 41,010 rows of four bytes each: a
16-bit team id and a 16-bit influence value, matching the schema's
`ProspectTargetSchool` with its `TeamId` and `TeamInfluence`. Rows are grouped
ten to a recruit.

A recruit's block starts at row `(nationalRank - 1) * 10 + 1`. That was verified
against an independent export of the whole 4,100-recruit class: for 4,086 of
them, all ten team-and-influence pairs match in order, and the fourteen that do
not are recruits whose data moved between the export and the save. The team ids
are the same ones players carry, not the team-table rows the schedule uses.

### What is not solved, and what was ruled out

The schema's `Recruit` type carries exactly the fields still missing —
`CommitScore` (0–1023), `RecruitStage` (4 bits), `NationalRank`, `PositionRank`,
`StateRank`, `TotalScholarshipOffers`, `QualityModifier` (gem and bust) — but
its records have not been located. What was tried, so it need not be tried
again:

- **Not in the player record.** All 4,100 recruits were tested against every bit
  position and plausible width in the 192-byte player record, scoring by
  agreement rather than demanding a perfect match. Nothing reached 70%.
- **Not in the store directory.** There is no `RecruitStore`; the 88 stores are
  listed above and none has ~4,101 rows. Like the player records, these live
  outside the directory.
- **Not a table ordered by national rank or by player index.** Searching the
  whole payload for a ten-bit field reproducing six consecutive recruits' commit
  scores, at every byte-aligned stride from 8 to 128, finds nothing.
- **The dense run of `0x2dc0` handles near the top-schools store is not it.**
  It looked like a 40-byte record array, but it is one flat index of all 41,010
  top-schools rows, four bytes each, incrementing by one. Every tenth handle has
  a row ending in 1, which is what made it look strided.
- **Player and top-schools references are not adjacent.** Requiring a recruit's
  player handle and its top-schools block handle within 80 bytes of each other
  finds no consistent geometry across six sampled recruits.

One useful behavioural finding came out of it. Spending recruiting hours on a
prospect changes 28 bytes, none of them in a recruit record: the action lands in
a queue and the tutorial and portal tables, and the effect is applied when the
week advances. Offering a scholarship behaves the same way. So a controlled diff
of two saves taken either side of a recruiting action does not localise the
recruit record, which is what made this harder than the schedule.

### A false positive worth knowing about

Searching for the national rank as a bit-packed field, at every position and
several widths, found a table with a 24-byte stride whose value matched the rank
for 4,041 of 4,100 recruits. It is not the recruit table. It is an array of
consecutive integers — dumping it at record 400 gives `03 23`, `03 24`, `03 25`
and so on, incrementing by one every twelve bytes — and **any** search for a
monotonic field matches a counter by construction, because rank *R* sits at index
*R − 1* in any sequence of consecutive integers.

That is the trap in searching for rank at all, and it invalidates the method
rather than just this hit. Rank, position rank and state rank are all
monotonic-ish over their orderings; only commit score, stage and the offer count
are safe anchors. Any future attempt should either anchor on one of those, or
require a candidate table to satisfy a monotonic field *and* a non-monotonic one
at the same time.

### Further encodings ruled out

Commit score was searched for with anchors verified against the live game — two
recruits' cards, cross-checked against a class export and matching on all nine
values tested. None of the following exists in the save:

- a 10, 11, 12 or 16-bit field in a table ordered by national rank, at any bit
  stride from 32 to 4,096;
- a byte-aligned 16-bit value, big or little endian, in rank order;
- a value co-located within 400 bits of the national rank, position rank and
  state rank at the schema's own widths, cross-checked on two recruits — the
  seven surviving geometries had strides between the two of them ranging from
  thirteen million to minus a hundred and thirty-four million bits, which is
  what chance looks like at this scale.

The last of those is the informative one. The player record scatters its own
fields across all 1,536 bits with no grouping — Speed at 849, Acceleration at
504, Agility at 490 — so expecting a recruit's four numbers to sit near each
other was the wrong assumption to begin with. Whatever finds this record will
have to establish its stride from a single non-monotonic field first.
