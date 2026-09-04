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

### Tried and rejected: aligning records to names

If the 192-byte records were a parallel array to the 17,470 name slots, a
player's index would give both. Two tests were run.

The name table has 1,020 blank slots, which is a fingerprint: a parallel array
should be blank at the same indices. Scanning every possible start record that
keeps both redshirt records inside the array, the best alignment was start
record 65,890 (`0x00c10980`) at 0.556 — well clear of the 0.13 field behind it,
and it named plausible players for all four edits.

It does not survive the decisive test. 11,804 players carry a team id in their
asset id, so under a correct alignment some field of the record must reproduce
it. Searching **every** bit offset in the record for an 8-, 9- or 10-bit
MSB-first field matching the known team found nothing above 5% — chance. The
blankness peak was coincidence, and the player identifications that came with it
are withdrawn.

So the record layout is solid and the record-to-player link is not.

### Still unmapped, and what would settle it

What breaks the deadlock is knowing **which player** each edit belonged to. A
player's index in the name table is easy to find by name; with two known
indices and their two record numbers, the array base and the index mapping fall
out of two equations, and every field in the 192-byte record becomes
addressable. Without the names, the record numbers are just numbers.

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
