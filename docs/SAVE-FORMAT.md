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

- **Player records** — a fixed **138-byte stride** table. Within a record:

  | Offset | Field |
  | --- | --- |
  | `+0x00` | hometown |
  | `+0x1A` | first name |
  | `+0x2B` | portrait asset id, e.g. `Generic_2584_P_T0122_H_7_4` |
  | `+0x4C` | surname |

  9,112 portrait-asset records appear in total, about the size of a full FBS
  league. Sample: `James Bynum · Keller`, `Bryce Keasey · Williamsport`,
  `DeVonte Jaimes · Catawissa`, `Philip Shembo · Fort Lauderdale`.

  The `T0122` component of the asset id looks like a team reference — worth
  confirming, since it is a candidate player→team link.

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
- Position, class year, redshirt status
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

## The real obstacle: a dictionary that is not in the save

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
