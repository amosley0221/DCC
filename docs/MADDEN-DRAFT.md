# The Madden 27 draft class format

A draft class exported from College Football 27 and loaded into Madden 27 is
far easier to read than a dynasty save. This records what it is, from one real
class file, so building an exporter is a matter of filling in a mapping rather
than starting from nothing.

## The container

The same `FBCHUNKS` header the College Football save uses, and the same fields
in the same places — a data offset at byte 10, a payload length at 14, a save
time, and a build string, here `Madden-27-RL1-9081279` rather than
`College-27-RL3-...`.

The difference that matters: **the payload is not compressed**. There is no
zlib stream and no zstd frame anywhere in the file. The records sit in the
open, which means writing one needs no repacking at all.

## Records

Player records are **5,876 bytes** on a fixed stride. In the class examined,
389 of the 455 slots are filled and the rest are zeroed. The first record
begins such that its first name lands at `0x1646`.

Offsets are given relative to the start of a record's first name.

| Offset | Contents |
| --- | --- |
| +0 | First name, null-padded |
| +21 | Last name, null-padded |
| +43 | The literal string `PLACEHOLDER` |
| +78 | Position |
| +85 … +142 | Ratings, **one byte each**, values 0–99 |
| +244 | Appearance, as JSON |

**Positions are a plain enumeration at +78**, and the distribution identifies it
without needing any outside data. Across 389 players: value 3 has 78 players and
16 has 53 — wide receiver and cornerback, the two most common positions in any
draft class — while 2 has exactly one player, which is the lone fullback, and 19
and 20 have five each, which are the kickers and punters. That gives the
familiar Madden ordering: QB 0, HB 1, FB 2, WR 3, TE 4, LT 5, LG 6, C 7, RG 8,
RT 9, LE 10, RE 11, DT 12, LOLB 13, MLB 14, ROLB 15, CB 16, FS 17, SS 18, K 19,
P 20, with 21 for the long snapper. The first record in the file is Jeremiah
Smith, whose position byte reads 3, and who is a wide receiver.

**Ratings are single bytes, not bit-packed.** Roughly fifty-five of them run
from +85 to +142, each holding 0–99 with the spread of values a rating has.
Bytes that looked like obfuscated text in a hex dump — `N`TDN%.KDVUT` and the
like — are simply ratings whose values fall in the printable ASCII range.

**Appearance is JSON**, one object per record starting at +244: a `bodyType`
from Muscular, Standard, Heavy, Freshman or Thin, a `genericHeadName` like
`gen_2_B_S_001`, and a `loadouts` array naming every piece of gear by asset —
face mask, visor, sleeves, socks, shoes, back plate, elbow wear, gloves and
shoulder pads.

## What is still needed

Which rating is which. There are about fifty-five bytes and Madden has about
fifty-five ratings, so the mapping is one screenshot away: the ratings page of a
single player from a class already loaded in Madden pins nearly every byte at
once, because fifty-five numbers matching fifty-five bytes has essentially one
solution.

Name matching against the user's own dynasty does not help. Only nine of the 389
names also appear in their College Football save, and those are coincidences of
common names — the class was pulled from a different roster, and its Jeremiah
Smith is a receiver while theirs is an outside linebacker.

The Madden career save is a different shape: it holds no `PLACEHOLDER` markers
and is compressed, with 308 zlib streams and 2,827 zstd frames. Reading it is a
separate problem from writing a draft class, and writing a class is the part
that matters here.
