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

## The ratings: all 54, by byte

A full set of screenshots of Cooper Barkate's card settled the whole block. He
is **record 72**, a 71-overall WR out of Miami, 6ft1, 195lb, age 23. Every one
of his 54 ratings matches a byte, and they run in order:

| Byte | Rating | Byte | Rating |
| --- | --- | --- | --- |
| 5718 | Acceleration | 5747 | Power Moves |
| 5719 | Agility | 5748 | Press |
| 5720 | Awareness | 5749 | Pursuit |
| 5721 | BC Vision | 5750 | Release |
| 5722 | Block Shedding | 5751 | Deep Route Running |
| 5723 | Break Sack | 5752 | Medium Route Running |
| 5724 | Break Tackle | 5753 | Short Route Running |
| 5725 | Carrying | 5754 | Run Block Finesse |
| 5726 | Catching | 5755 | Run Block Power |
| 5727 | Catch in Traffic | 5756 | Run Blocking |
| 5728 | Change of Direction | 5757 | Long Snap |
| 5729 | Finesse Moves | 5758 | Spectacular Catch |
| 5730 | Hit Power | 5759 | Speed |
| 5731 | Impact Blocking | 5760 | Spin Move |
| 5732 | Injury | 5761 | Stamina |
| 5733 | Juke Move | 5762 | Stiff Arm |
| 5734 | Jumping | 5763 | Strength |
| 5735 | Kicking Accuracy | 5764 | Tackling |
| 5736 | Kicking Power | 5765 | Deep Throw Accuracy |
| 5737 | Kick/Punt Return | 5766 | Medium Throw Accuracy |
| 5738 | Lead Block | 5768 | Short Throw Accuracy |
| 5740 | Man Coverage | 5769 | Throw on the Run |
| 5741 | Pass Block Finesse | 5770 | Throwing Power |
| 5742 | Pass Block Power | 5771 | Throw Under Pressure |
| 5743 | Pass Blocking | 5772 | Toughness |
| 5745 | Play Action | 5773 | Trucking |
| 5746 | Play Recognition | 5774 | Zone Coverage |

**The order is alphabetical by the game's own internal names, not by the labels
on screen.** That is what makes the three odd-looking spots make sense. The
throw ratings sit at the end because they are `ThrowAccuracyDeep` and friends,
not "Deep Throw Accuracy". Route running sits under R, between Release and Run
Block, in deep-medium-short order. Long Snap sits between Run Blocking and
Spectacular Catch, so its internal name begins `Sn`. And each blocking trio runs
finesse, power, plain — `PassBlockFinesse`, `PassBlockPower`, `PassBlocking` —
which is a case-sensitive sort, capitals before lowercase.

Three bytes in the run are **not** ratings: 5739 reads 127 for every player in
the class, and 5744 and 5767 hold values that match nothing on the card.

### Proved against the class, not just one card

One player could be a coincidence. These cannot:

| Rating | Highest groups | Class mean |
| --- | --- | --- |
| Kicking Power (5736) | two groups of five, both **94** | 36 |
| Throwing Power (5770) | one group of 27, **90** | 32 |
| Man Coverage (5740) | groups of 53, 14 and 8 — **64–65** | 38 |
| Run Blocking (5756) | the six heavy groups — **62–68** | 40 |
| Long Snap (5757) | **1** for all 389 | 1 |

A rating only kickers have spiking for exactly two groups of five, and only two
groups of five, is the whole proof.

## The rest of the record

| Byte | Field |
| --- | --- |
| 5706 | Age — class runs 20 to 25 |
| 5707 | Height in inches — class runs 66 to 80 |
| 5708 | Weight, **stored as pounds minus 160** — class runs 160 to 375 lb |
| 5710 | Position |

Overall and jersey number are **not** in the record. Madden shows Barkate at 71
overall and #85, and neither number appears anywhere in his 5876 bytes, so both
are worked out by the game — the overall from the ratings and the archetype, the
number when he is drafted.

## Position, byte 5710

Named by what each group is good at, with its size, average weight and height:

| Value | n | Weight | Height | Reading |
| --- | --- | --- | --- | --- |
| 0 | 27 | 212 | 6ft2 | QB — throwing 90 |
| 1 | 28 | 206 | 5ft10 | HB |
| 2 | 1 | 215 | 5ft11 | FB |
| 3 | 78 | 193 | 6ft0 | WR — Barkate is here |
| 4 | 8 | 247 | 6ft4 | TE — catches 79 and blocks 54 |
| 5, 6, 7, 8, 9, 21 | 55 | 303–320 | 6ft4–6ft6 | the offensive line |
| 10, 11 | 47 | 253–265 | 6ft4 | edge rushers |
| 12 | 24 | 310 | 6ft3 | defensive tackle |
| 13, 14, 15 | 36 | 233–237 | 6ft1–6ft3 | linebackers |
| 16 | 53 | 190 | 6ft0 | CB |
| 17, 18 | 22 | 199–206 | 6ft1 | safeties |
| 19 | 5 | 178 | 5ft11 | K |
| 20 | 5 | 205 | 6ft1 | P |

Which of the six line values is left tackle and which is centre, and which way
round the two kicking groups go, still needs a card from one of them. Everything
else about a player can now be read and written.

## What these files are not

`CAREERBUCS` is a Madden career save — 5.6 MB, zlib from byte 82, inflating to
20 MB, and structured like the dynasty save rather than like a draft class. It
does **not** contain the class in `CAREERDRAFTCFBCLASS1`: Barkate, Mateer and
Uiagalelei are all absent from it. It is a career from before the import.
