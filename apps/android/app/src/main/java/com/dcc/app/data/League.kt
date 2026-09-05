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

    private fun confPct(r: Row): Double {
        val n = r.confWins + r.confLosses
        return if (n == 0) -1.0 else r.confWins.toDouble() / n
    }
}
