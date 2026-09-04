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

**Five pairs are placed but not distinguished.** Within each, the two ratings
behave so alike across the league that nothing in the file separates them, so
the labels inside a pair could be swapped: Short/Medium Throw Accuracy, Run
Block Power/Finesse, Trucking/Stiff Arm, Finesse/Power Moves, and
Speed/Change of Direction. Reading a player is unaffected — both numbers are
right, only which name goes on which is open. One more single-rating edit to
either member of a pair settles it.

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

### Tried and rejected: a team field on the player

A 9-bit field ending at bit **235** looks like the team and is not good enough
to use. It scores 85.8% precision and 77.1% recall against the team in the
asset id, its big buckets are unmistakably rosters — bucket 4 is 99% one team,
bucket 51 is 98% — and it is not an index artefact: its buckets span the whole
array (median span 16,004 of 17,470 slots) and correlate with the array index
at r=0.096.

But only 84 of its 512 buckets hold 60 or more players, where 240 teams need
240 rosters, and widening the window in either direction does not improve
either score. Something team-shaped is in there; a usable team id is not.

A first attempt scored it at 86.8% "purity" and looked much better than it is.
That metric counted, for each bucket, the share belonging to its majority team —
which a field that shatters every team into singletons passes perfectly.
Measuring recall as well, and checking bucket sizes against roster sizes, is
what exposed it.

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
