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
