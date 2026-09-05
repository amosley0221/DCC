package com.dcc.app.ui.sections

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dcc.app.data.League
import com.dcc.app.data.SnapshotGame
import com.dcc.app.state.SnapshotView
import com.dcc.app.ui.components.DccCard
import com.dcc.app.ui.components.DccChip
import com.dcc.app.ui.components.EmptyState
import com.dcc.app.ui.components.MetaText
import com.dcc.app.ui.components.MonoLabel
import com.dcc.app.ui.components.NumText
import com.dcc.app.ui.components.RowTitle
import com.dcc.app.ui.components.SchoolBadge
import com.dcc.app.ui.components.SectionHeader
import com.dcc.app.ui.gold.GoldScoreRow
import com.dcc.app.ui.theme.Dcc

private val LEAGUE_TABS = listOf("STANDINGS", "RANKINGS", "SCORES", "STATS", "SCHEDULES")

private fun mono(name: String?) = (name ?: "?").take(2).uppercase()

private fun oneDp(v: Double): String = String.format("%.1f", v)
private fun signed(v: Double): String = if (v > 0) "+" + oneDp(v) else oneDp(v)

/**
 * The league: everything in the dynasty that is not about your own program.
 *
 * Standings by conference, a ranking, the week's scores, team scoring and every
 * other school's schedule — all of it worked out in `League.kt` from the
 * season's own game rows, because the save records results and never a table.
 * The same arithmetic runs on the PC, so the two apps cannot disagree about who
 * is 7-2.
 *
 * The ranking says whose it is. There is no poll in the save, so it is DCC's
 * order by record and scoring margin rather than the game's own opinion.
 */
@Composable
fun LeagueSnapshotSection(view: SnapshotView) {
    val c = Dcc.colors
    var tab by rememberSaveable { mutableStateOf(LEAGUE_TABS[0]) }
    var spoilers by rememberSaveable { mutableStateOf(false) }
    var pick by rememberSaveable { mutableStateOf(view.userTeam?.index ?: -1) }
    var week by rememberSaveable {
        mutableStateOf(view.weeks.lastOrNull { w -> w < view.holdFrom } ?: view.weeks.lastOrNull() ?: 0)
    }

    val userIndex = view.userTeam?.index
    val games = remember(view, spoilers) {
        League.visible(view.snapshot.games, userIndex, view.holdFrom, spoilers)
    }
    val table = remember(games) { League.build(games, view.snapshot.teams) }
    val order = remember(table) { League.rankings(table) }
    val rankOf = remember(order) { order.withIndex().associate { (i, r) -> r.index to i + 1 } }
    val groups = remember(table) { League.conferences(table) }

    Column(Modifier.fillMaxSize()) {
        SectionHeader(
            title = "The league",
            sub = {
                MetaText(
                    listOf(
                        "${table.size} PROGRAMS",
                        "${groups.size} CONFERENCES",
                        if (week > 0) "THROUGH WEEK $week" else "NOTHING PLAYED",
                    ).joinToString(" · "),
                )
            },
        )

        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            LEAGUE_TABS.forEach { t -> DccChip(t, tab == t, accent = true) { tab = t } }
        }

        // The game sims the country before your own Saturday, so a save sitting
        // on week 11 already knows week 11. A table built from those would hand
        // you results you have not played.
        if (view.holdFrom != Int.MAX_VALUE) {
            DccChip(
                if (spoilers) "SHOWING ALL RESULTS" else "RESULTS HELD FROM WEEK ${view.holdFrom}",
                spoilers, accent = true,
            ) { spoilers = !spoilers }
            Spacer(Modifier.height(10.dp))
        }

        when (tab) {
            "STANDINGS" -> LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (groups.isEmpty()) item { DccCard { EmptyState("the snapshot carries no conferences") } }
                items(groups, key = { it.first }) { (conference, rows) ->
                    DccCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            MonoLabel(conference.uppercase(), c.accent, 10)
                            Spacer(Modifier.weight(1f))
                            MetaText("${rows.size} TEAMS", c.ink4, 9)
                        }
                        Spacer(Modifier.height(9.dp))
                        rows.forEach { r ->
                            StandingRow(r, rankOf[r.index], r.index == userIndex)
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }

            "RANKINGS" -> LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                item {
                    DccCard {
                        MonoLabel("DCC'S OWN ORDER", c.accent, 10)
                        Spacer(Modifier.height(6.dp))
                        MetaText(
                            "There is no poll in the save — no AP number, no coaches' number — so this " +
                                "is record first, with scoring margin as the tie-break and a cap on it, " +
                                "so a 98-0 win over nobody cannot outrank a second win.",
                            c.ink3, 10, maxLines = 4,
                        )
                    }
                }
                items(order.take(40), key = { it.index }) { r ->
                    DccCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            NumText(
                                "${rankOf[r.index]}", if ((rankOf[r.index] ?: 99) <= 25) c.accent else c.ink3,
                                13, FontWeight.SemiBold, Modifier.width(26.dp),
                            )
                            SchoolBadge(mono(r.name), r.name, r.index == userIndex, 22.dp, "logo")
                            Spacer(Modifier.width(9.dp))
                            Column(Modifier.weight(1f)) {
                                RowTitle(r.name, if (r.index == userIndex) c.accent else c.ink, 14)
                                MetaText(r.conference ?: "", c.ink4, 9, maxLines = 1)
                            }
                            NumText("${r.wins}-${r.losses}", c.ink, 13, FontWeight.SemiBold)
                            Spacer(Modifier.width(10.dp))
                            NumText(
                                if (r.played > 0) signed(r.margin) else "—",
                                if (r.margin >= 0) c.good else c.ink3, 12,
                            )
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }

            "SCORES" -> Column(Modifier.fillMaxSize()) {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    view.weeks.forEach { w -> DccChip("$w", week == w) { week = w } }
                }
                val shown = games.filter { it.week == week && it.played }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (shown.isEmpty()) item { DccCard { EmptyState("nothing you have reached that week") } }
                    items(shown, key = { it.row }) { g ->
                        GoldScoreRow(
                            away = g.away ?: "", awayScore = g.awayScore,
                            home = g.home ?: "", homeScore = g.homeScore,
                            awayRank = rankOf[g.awayIndex], homeRank = rankOf[g.homeIndex],
                        )
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }

            "STATS" -> LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                item {
                    DccCard {
                        MonoLabel("TEAM SCORING", c.accent, 10)
                        Spacer(Modifier.height(6.dp))
                        MetaText(
                            "Points scored and allowed are what the save writes for a game. Yardage, " +
                                "turnovers and the rest of a stat sheet are not in the rows DCC reads, " +
                                "so they are not printed here as blanks.",
                            c.ink3, 10, maxLines = 4,
                        )
                    }
                }
                items(order, key = { it.index }) { r ->
                    DccCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            SchoolBadge(mono(r.name), r.name, r.index == userIndex, 22.dp, "logo")
                            Spacer(Modifier.width(9.dp))
                            Column(Modifier.weight(1f)) {
                                RowTitle(r.name, if (r.index == userIndex) c.accent else c.ink, 14)
                                MetaText("${r.played} GAMES · ${r.wins}-${r.losses}", c.ink4, 9, maxLines = 1)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                NumText(
                                    if (r.played > 0) oneDp(r.pointsFor.toDouble() / r.played) else "—",
                                    c.ink, 13, FontWeight.SemiBold,
                                )
                                MetaText(
                                    if (r.played > 0) oneDp(r.pointsAgainst.toDouble() / r.played) + " allowed" else "",
                                    c.ink4, 9, maxLines = 1,
                                )
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }

            else -> Column(Modifier.fillMaxSize()) {
                val picked = table[pick]
                if (picked != null) {
                    DccCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            SchoolBadge(mono(picked.name), picked.name, pick == userIndex, 30.dp, "helmet")
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                RowTitle(picked.name, c.ink, 16)
                                MetaText(
                                    listOfNotNull(
                                        "${picked.wins}-${picked.losses}",
                                        "${picked.confWins}-${picked.confLosses} IN LEAGUE",
                                        picked.conference?.uppercase(),
                                    ).joinToString(" · "),
                                    c.ink4, 9, maxLines = 1,
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    val season = view.snapshot.games
                        .filter { it.homeIndex == pick || it.awayIndex == pick }
                        .sortedWith(compareBy({ it.postseason }, { it.week }))
                    if (picked != null) {
                        items(season, key = { it.row }) { g -> SeasonRow(g, pick, view, spoilers) }
                        item { Spacer(Modifier.height(14.dp)) }
                    }
                    item { MonoLabel("EVERY SCHOOL", c.ink3, 10) }
                    items(order, key = { "pick-" + it.index }) { r ->
                        Row(
                            Modifier.fillMaxWidth().clickable { pick = r.index },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            SchoolBadge(mono(r.name), r.name, r.index == userIndex, 20.dp, "logo")
                            Spacer(Modifier.width(9.dp))
                            RowTitle(
                                r.name,
                                if (r.index == pick) c.accent else c.ink, 13,
                                Modifier.weight(1f),
                            )
                            NumText("${r.wins}-${r.losses}", c.ink3, 12)
                        }
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

/** One line of a conference table. */
@Composable
private fun StandingRow(r: League.Row, rank: Int?, isUser: Boolean) {
    val c = Dcc.colors
    Row(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NumText(
            if (rank != null && rank <= 25) "$rank" else "",
            c.ink4, 10, FontWeight.Normal, Modifier.width(20.dp),
        )
        SchoolBadge(mono(r.name), r.name, isUser, 20.dp, "logo")
        Spacer(Modifier.width(8.dp))
        RowTitle(r.name, if (isUser) c.accent else c.ink, 13, Modifier.weight(1f))
        NumText("${r.confWins}-${r.confLosses}", c.ink, 12, FontWeight.SemiBold)
        Spacer(Modifier.width(10.dp))
        NumText("${r.wins}-${r.losses}", c.ink3, 12)
    }
}

/** One game in a school's own season, told from that school's side. */
@Composable
private fun SeasonRow(g: SnapshotGame, index: Int, view: SnapshotView, spoilers: Boolean) {
    val c = Dcc.colors
    val home = g.homeIndex == index
    val other = if (home) g.away else g.home
    val us = if (home) g.homeScore else g.awayScore
    val them = if (home) g.awayScore else g.homeScore
    val held = view.holds(g, spoilers)
    val won = us > them
    Row(
        Modifier.fillMaxWidth().padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NumText("${g.week}", c.ink4, 11, FontWeight.Normal, Modifier.width(24.dp))
        MetaText(if (home) "VS" else "AT", c.ink4, 9, Modifier.width(22.dp))
        SchoolBadge(mono(other), other ?: "", false, 20.dp, "logo")
        Spacer(Modifier.width(8.dp))
        RowTitle(other ?: "TBD", c.ink, 13, Modifier.weight(1f))
        when {
            !g.played -> MetaText("—", c.ink4, 10)
            held -> MetaText("HELD", c.ink4, 9)
            else -> {
                NumText(if (won) "W" else "L", if (won) c.good else c.accent, 12, FontWeight.SemiBold)
                Spacer(Modifier.width(8.dp))
                NumText("$us-$them", c.ink3, 12)
            }
        }
    }
}
