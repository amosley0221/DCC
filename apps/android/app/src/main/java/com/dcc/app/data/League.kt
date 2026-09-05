package com.dcc.app.data

import kotlin.math.max
import kotlin.math.min

/**
 * The league table, worked out from the games the snapshot carries.
 *
 * The save records results, not standings — no table, no poll, no conference
 * record — so all of it is derived. This is the same arithmetic as the
 * desktop's `league.ts`, deliberately: the two apps read the same dynasty and
 * must not disagree about who is 7-2.
 */
object League {

    data class Result(
        val week: Int,
        val opponent: String,
        val us: Int,
        val them: Int,
        val home: Boolean,
        val won: Boolean,
        val conference: Boolean,
        val postseason: Boolean,
        val row: Int,
    )

    data class Row(
        val name: String,
        val index: Int,
        val conference: String?,
        val division: String?,
        var wins: Int = 0,
        var losses: Int = 0,
        var confWins: Int = 0,
        var confLosses: Int = 0,
        var pointsFor: Int = 0,
        var pointsAgainst: Int = 0,
        val results: MutableList<Result> = mutableListOf(),
    ) {
        val played: Int get() = wins + losses
        val winPct: Double get() = if (played == 0) 0.0 else wins.toDouble() / played
        val margin: Double
            get() = if (played == 0) 0.0 else (pointsFor - pointsAgainst).toDouble() / played
    }

    /**
     * Games a record is credited with before it is believed. Four, so an
     * unbeaten team in September is not immediately the best in the country.
     */
    private const val PRIOR = 4

    private fun settledPct(r: Row) = (r.wins + PRIOR / 2.0) / (r.played + PRIOR)

    /**
     * DCC's own ordering, and every screen that shows it says so.
     *
     * There is no poll in the save, so a ranking has to be computed: record
     * first, with scoring margin only as a tie-break and a cap on it, so a 98-0
     * win over nobody cannot outweigh a second win.
     */
    fun power(r: Row): Double = settledPct(r) * 100 + max(-21.0, min(21.0, r.margin)) * 0.25

    /**
     * The season minus the Saturdays you have not reached.
     *
     * The game sims the rest of the country ahead of your own game, so a save
     * on week 11 already holds week 11's scores for everyone else. Your own
     * games are never held: you played them.
     */
    fun visible(games: List<SnapshotGame>, userIndex: Int?, holdFrom: Int, spoilers: Boolean): List<SnapshotGame> {
        if (spoilers) return games
        return games.filter { g ->
            !(g.played && g.week >= holdFrom && g.homeIndex != userIndex && g.awayIndex != userIndex)
        }
    }

    /**
     * Every program's season so far, keyed by the team-table index the games
     * refer to. Teams are seeded from the table so a program that has not
     * played still stands in its own conference at 0-0.
     *
     * Bowls count in the overall record and never in the conference one.
     */
    fun build(games: List<SnapshotGame>, teams: List<SnapshotTeam>): Map<Int, Row> {
        val table = teams.associate { t ->
            t.index to Row(t.name, t.index, t.conference?.ifBlank { null }, t.division?.ifBlank { null })
        }
        for (g in games) {
            if (!g.played) continue
            val h = table[g.homeIndex] ?: continue
            val a = table[g.awayIndex] ?: continue
            val homeWon = g.homeScore > g.awayScore
            val sameConf = !g.postseason && h.conference != null && h.conference == a.conference

            h.pointsFor += g.homeScore; h.pointsAgainst += g.awayScore
            a.pointsFor += g.awayScore; a.pointsAgainst += g.homeScore
            if (homeWon) { h.wins++; a.losses++ } else { h.losses++; a.wins++ }
            if (sameConf) {
                if (homeWon) { h.confWins++; a.confLosses++ } else { h.confLosses++; a.confWins++ }
            }
            h.results += Result(g.week, a.name, g.homeScore, g.awayScore, true, homeWon, sameConf, g.postseason, g.row)
            a.results += Result(g.week, h.name, g.awayScore, g.homeScore, false, !homeWon, sameConf, g.postseason, g.row)
        }
        for (r in table.values) r.results.sortByDescending { it.week }
        return table
    }

    /**
     * The country in the order the save itself keeps.
     *
     * A poll ranks twenty-five and leaves everyone else level, so the ranked
     * teams come first in their own order and the rest fall in behind them by
     * the same arithmetic that would have ordered all of them. Nothing is
     * invented: only the order among unranked teams is DCC's opinion.
     */
    fun orderByRanks(table: Map<Int, Row>, ranks: Map<String, Int>): List<Row> {
        val fallback = rankings(table)
        val place = fallback.withIndex().associate { (i, r) -> r.name to i }
        return table.values.sortedWith(
            compareBy({ ranks[it.name] ?: Int.MAX_VALUE }, { place[it.name] ?: 0 }),
        )
    }

    /** Programs strongest first. A team with no games sinks rather than tying at the top. */
    fun rankings(table: Map<Int, Row>): List<Row> = table.values.sortedWith(
        compareByDescending<Row> { if (it.played > 0) 1 else 0 }
            .thenByDescending { power(it) }
            .thenByDescending { it.wins - it.losses }
            .thenBy { it.name },
    )

    /**
     * Conference by conference, each in league order then overall. A team the
     * save gives no conference is left out rather than gathered into a bucket
     * of everything DCC failed to read.
     */
    fun conferences(table: Map<Int, Row>): List<Pair<String, List<Row>>> =
        table.values
            .filter { it.conference != null }
            .groupBy { it.conference!! }
            .map { (name, rows) ->
                name to rows.sortedWith(
                    compareByDescending<Row> { confPct(it) }
                        .thenByDescending { it.winPct }
                        .thenByDescending { it.margin }
                        .thenBy { it.name },
                )
            }
            .sortedBy { it.first }

    /* ────────────────────────────────────────────────────────── the playoff */

    const val PLAYOFF_SIZE = 12

    /** Conference champions that qualify on their title alone. */
    const val PLAYOFF_AUTO_BIDS = 5

    data class PlayoffTeam(
        val seed: Int,
        val row: Row,
        /** In on a conference title rather than on the strength of the résumé. */
        val champion: Boolean,
        /** Seeds one to four sit out the first round. */
        val bye: Boolean,
    )

    data class PlayoffField(
        val teams: List<PlayoffTeam>,
        /** Conference name to the program leading it. */
        val leaders: Map<String, String>,
        /** True while this is a projection rather than a bracket the save played. */
        val projected: Boolean = true,
    )

    /**
     * The twelve-team field, projected from the table — the same rule the PC
     * uses, so the two apps show the same bracket.
     *
     * The five highest-ranked conference champions are in on their titles, the
     * remaining seven places go to the best of everyone left, and all twelve are
     * then seeded strictly by the ranking. Seeds one to four sit out the first
     * round.
     *
     * "Champion" is the program leading its conference: no title game has been
     * played in November, and the save cannot be asked who will win one. Every
     * screen showing this says it is a projection.
     */
    fun projectPlayoff(table: Map<Int, Row>): PlayoffField {
        val order = rankings(table)
        val leaders = LinkedHashMap<String, String>()
        for ((conference, rows) in conferences(table)) {
            rows.firstOrNull()?.let { leaders[conference] = it.name }
        }
        val isLeader = leaders.values.toSet()

        val chosen = mutableListOf<Pair<Row, Boolean>>()
        val taken = mutableSetOf<String>()
        for (r in order) {
            if (chosen.size >= PLAYOFF_AUTO_BIDS) break
            if (r.name !in isLeader) continue
            chosen += r to true
            taken += r.name
        }
        for (r in order) {
            if (chosen.size >= PLAYOFF_SIZE) break
            if (r.name in taken) continue
            chosen += r to false
            taken += r.name
        }

        // Seeded by the ranking, not by how they got in: a champion ranked
        // eleventh is the eleventh seed.
        val rank = order.withIndex().associate { (i, r) -> r.name to i }
        val seeded = chosen.sortedBy { rank[it.first.name] ?: 999 }

        return PlayoffField(
            teams = seeded.mapIndexed { i, (row, champion) ->
                PlayoffTeam(i + 1, row, champion, i < 4)
            },
            leaders = leaders,
        )
    }

    /** First-round pairings, higher seed first. Seeds one to four are not here. */
    val FIRST_ROUND: List<Pair<Int, Int>> = listOf(5 to 12, 6 to 11, 7 to 10, 8 to 9)

    /** Quarterfinals: a bye seed against the winner of one first-round game. */
    val QUARTERFINALS: List<Pair<Int, Pair<Int, Int>>> =
        listOf(1 to (8 to 9), 4 to (5 to 12), 3 to (6 to 11), 2 to (7 to 10))

    /**
     * The art keys for a conference's championship mark, best first.
     *
     * The art names a conference the way a broadcast graphic does — BIG10,
     * PAC12, CUSA — while the save names it the way a table does: "Big Ten",
     * "Pac-12", "Conference USA". The PC maps them the same way.
     */
    private val CONFERENCE_ART = mapOf(
        "bigten" to "big10", "big10" to "big10", "b1g" to "big10",
        "big12" to "big12", "bigxii" to "big12",
        "pac12" to "pac12", "pacific12" to "pac12",
        "american" to "american", "americanathletic" to "american", "aac" to "aac",
        "conferenceusa" to "cusa", "cusa" to "cusa",
        "mountainwest" to "mountainwest", "mwc" to "mountainwest",
        "sunbelt" to "sunbelt",
    )

    fun conferenceArtKeys(conference: String?): List<String> {
        if (conference.isNullOrBlank()) return emptyList()
        val norm = conference.lowercase().filter { it.isLetterOrDigit() }
        val mapped = CONFERENCE_ART[norm]
        val names = if (mapped != null && mapped != norm) listOf(mapped, norm) else listOf(norm)
        return names.map { "confchamp:${it}championship" }
    }

    private fun confPct(r: Row): Double {
        val n = r.confWins + r.confLosses
        return if (n == 0) -1.0 else r.confWins.toDouble() / n
    }
}
