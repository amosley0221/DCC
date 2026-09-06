# The Madden 27 draft class file

Notes on `CAREERDRAFTCFBCLASS*`, the file a CFB class becomes on its way into
Madden. Written down as it is found, so it is not lost the way the first
Cooper Barkate screenshot was.

Everything here is measured from two real files. Nothing is assumed.

## The container

The same `FBCHUNKS` header as a CFB dynasty save, and then — unlike the dynasty
save — **no compression at all**. No zlib stream, no `SPBF` stores, no
bit-packing. The whole file is plain records.

```
70 bytes   header, title string "Madden-27-RL1-9081279"
then       455 records of 5876 bytes
```

`455 × 5876 = 2,673,580`, and the header's length word at byte 14 reads
`0x28cbac`, which is that number exactly. So the length field is consistent and
a file that keeps the record count keeps it valid. 389 of the 455 records are
filled; the rest are empty slots.

## One record

| Offset | What |
| --- | --- |
| 0 | Gear and appearance, as **plain-text JSON** — helmet, facemask, gloves, cleats, body type |
| 5632 | First name |
| 5653 | Last name |
| 5674 | Portrait id (`PLACEHOLDER` throughout the classes seen) |
| 5710 | **Position** |
| 5711–5789 | The ratings, **one byte each, unpacked** |
| 5834–5842 | A few 16-bit fields, not yet identified |

## Position, byte 5710

22 distinct values across the 389 filled records, and the rating profiles split
by it exactly as football would:

- Six values (5, 6, 7, 8, 9, 21) are high in *both* byte 5712 and byte 5738,
  mean 62–71 and 64–70. Two blocking ratings and the offensive line.
- One value, 0, with 27 players, reads **75** at byte 5766 where every other
  group reads 11–21. A throwing rating, and those 27 are the quarterbacks.
- Value 3 is the largest group, 78 players, fast (byte 5718 mean 92) and no
  blocking at all. Cooper Barkate is in it, and he is a receiver.

Which value is which position still needs one player named on screen.

## The ratings are alphabetical, one byte each, from 5718

A screenshot of Cooper Barkate's card in Madden settled it. Thirteen ratings
were legible, and every one of their values appears in his record — but the
decisive part is that they appear **in strictly increasing offset order**:

| Rating | Value | Byte |
| --- | --- | --- |
| Acceleration | 91 | 5718 |
| Agility | 88 | 5719 |
| Awareness | 69 | 5720 |
| BC Vision | 69 | 5721 |
| Break Tackle | 68 | 5724 |
| Carrying | 67 | 5725 |
| Change of Direction | 88 | 5728 |
| Juke Move | 69 | 5733 |
| Speed | 89 | 5759 |
| Spin Move | 67 | 5760 |
| Stiff Arm | 59 | 5762 |
| Strength | 53 | 5763 |
| Trucking | 61 | 5773 |

That is alphabetical order, and the gaps are the right size for the names that
fall in them: two slots between BC Vision and Break Tackle for Block Shedding
and Break Sack, two between Carrying and Change of Direction for Catch in
Traffic and Catching, and Speed, Spin Move, Stamina, Stiff Arm, Strength
landing on five consecutive bytes.

**Confirmed independently**, without the screenshot, by what the class does with
those bytes. If the order is alphabetical then Tackle and the Throw ratings fill
the gap between Strength (5763) and Trucking (5773), and they do:

| Byte | QB mean | OL mean | Receivers | Reading |
| --- | --- | --- | --- | --- |
| 5764 | 36 | 25 | 33 | Tackle — nobody's specialty |
| 5765 | 72 | 12 | 17 | a throw rating |
| 5766 | 75 | 13 | 17 | a throw rating |
| 5768 | 77 | 13 | 17 | a throw rating |
| 5769 | 74 | 14 | 19 | a throw rating |
| 5770 | 90 | 24 | 30 | Throw Power |
| 5771 | 68 | 21 | 24 | a throw rating |
| 5772 | 90 | 90 | 85 | Toughness — everybody has it |

Six bytes that only quarterbacks have, in the one place alphabetical order says
throwing belongs. That is not a coincidence.

Byte 5739 reads 127 for every player in the class, so it is a cap or a sentinel
rather than a rating.

## What is still needed

**The rest of that same ratings list, scrolled down.** The card cuts off at Juke
Move, which is thirteen of roughly fifty-five. Because the order is alphabetical
and now proven, every further label pins a byte outright. The unresolved parts
are:

- bytes 5729–5732, between Change of Direction and Juke Move: four slots for
  what should be Elusiveness, Finesse Moves, Hit Power and Impact Blocking, so
  one of the names assumed here is wrong or absent
- everything from Jumping to Spectacular Catch — bytes 5734 to 5758, the largest
  unlabelled run, covering kicking, coverage, blocking and route running
- which of 5765–5771 is short, medium and deep accuracy, which is on the run,
  and which is under pressure

**From the Player Info tab:** position, height, weight, age and college. That
pins position value 3 to a real position and probably explains the 16-bit fields
at 5834–5842.

The second thing needed cannot be done here at all: **whether Madden accepts a
file DCC has written**. There is no Madden in this environment, so the loop has
to be write, import, report back. Nothing found so far suggests a checksum, but
absence of evidence is not evidence here.

## What these files are not

`CAREERBUCS` is a Madden career save — 5.6 MB, zlib from byte 82, inflating to
20 MB, and structured like the dynasty save rather than like a draft class. It
does **not** contain the class in `CAREERDRAFTCFBCLASS1`: Barkate, Mateer and
Uiagalelei are all absent from it. It is a career from before the import.
