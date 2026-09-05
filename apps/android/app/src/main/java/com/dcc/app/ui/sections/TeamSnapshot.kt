package com.dcc.app.ui.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dcc.app.data.Rules
import com.dcc.app.data.SaveLabels
import com.dcc.app.data.SnapshotGame
import com.dcc.app.data.SnapshotPlayer
import com.dcc.app.data.SnapshotTeam
import com.dcc.app.data.monogram
import com.dcc.app.data.name
import com.dcc.app.state.SnapshotView
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc

private val TABS = listOf("ROSTER", "CARDS", "SCHEDULE", "LEAGUE", "TEAMS")

/** A hex colour from the snapshot, or null when the PC had no logo to read. */
private fun parseHex(hex: String?): Color? {
    val h = hex?.removePrefix("#") ?: return null
    if (h.length != 6) return null
    return runCatching { Color(0xFF000000L.toInt() or h.toInt(16)) }.getOrNull()
}

/** White or black, whichever can be read on top of a school's own colour. */
private fun inkOn(bg: Color): Color =
    if (bg.red * 0.299f + bg.green * 0.587f + bg.blue * 0.114f > 0.62f) Color(0xFF10131A)
    else Color.White

/**
 * Team, driven by the imported snapshot rather than the sample dynasty.
 *
 * It opens on the user's own program because that is the roster the desktop
 * exported ratings for, but every list here is scoped by the team picker in
 * TEAMS, so the rest of the country is one tap away.
 */
@Composable
fun TeamSnapshotSection(view: SnapshotView) {
    val c = Dcc.colors
    var tab by rememberSaveable { mutableStateOf(TABS[0]) }
    var teamIndex by rememberSaveable {
        mutableStateOf(view.userTeam?.index ?: view.teams.firstOrNull()?.index ?: 0)
    }
    var openPlayer by rememberSaveable { mutableStateOf<Int?>(null) }
    var openGame by rememberSaveable { mutableStateOf<Int?>(null) }
    var spoilers by rememberSaveable { mutableStateOf(false) }
    var teamQuery by rememberSaveable { mutableStateOf("") }
    // The league opens on the week the save is sitting on, which is the one the
    // user is about to play.
    var week by rememberSaveable {
        mutableStateOf(view.weeks.firstOrNull { it >= view.holdFrom } ?: view.weeks.lastOrNull() ?: 0)
    }

    val team = view.teamsByIndex[teamIndex]
    val roster = remember(view, teamIndex) { view.rosterOf(teamIndex) }
    val schedule = remember(view, teamIndex) { view.scheduleOf(teamIndex) }
    val nextRow = remember(schedule) { schedule.firstOrNull { !it.played }?.row }
    val teamList = remember(view, teamQuery) {
        val q = teamQuery.trim().lowercase()
        if (q.isEmpty()) view.teams
        else view.teams.filter {
            listOfNotNull(it.name, it.fullName, it.conference).joinToString(" ").lowercase().contains(q)
        }
    }

    Column(Modifier.fillMaxSize()) {
        SectionHeader(
            title = team?.name ?: "Team",
            sub = {
                MetaText(
                    listOfNotNull(
                        team?.let { "${it.wins}–${it.losses}" },
                        team?.conference,
                        team?.coach,
                        "${roster.size} PLAYERS",
                    ).joinToString(" · ").uppercase(),
                )
            },
        )

        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            TABS.forEach { t -> DccChip(t, tab == t, accent = true) { tab = t; openPlayer = null; openGame = null } }
        }

        when (tab) {
            "CARDS" -> {
                val teamName = team?.name
                val color = parseHex(view.snapshot.schoolColors[teamName])
                    ?: Dcc.colors.surfaceStrong
                val champion = teamName != null && view.snapshot.champions.contains(teamName)
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(150.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (roster.isEmpty()) item { DccCard { EmptyState("the snapshot has no roster for this team") } }
                    items(roster, key = { it.index }) { p ->
                        PlayerCard(p, color, champion, team?.monogram ?: "") {
                            openPlayer = p.index
                            tab = "ROSTER"
                        }
                    }
                }
            }

            "ROSTER" -> LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (roster.isEmpty()) item { DccCard { EmptyState("the snapshot has no roster for this team") } }
                items(roster, key = { it.index }) { p ->
                    RosterRow(p, openPlayer == p.index) {
                        openPlayer = if (openPlayer == p.index) null else p.index
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }

            // A team's own season is never held back: these results are either
            // already watched or not played yet.
            "SCHEDULE" -> LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (schedule.isEmpty()) item { DccCard { EmptyState("the snapshot has no games for this team") } }
                items(schedule, key = { it.row }) { g ->
                    TeamGameRow(g, teamIndex, g.row == nextRow, openGame == g.row) {
                        openGame = if (openGame == g.row) null else g.row
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }

            "LEAGUE" -> Column(Modifier.fillMaxSize()) {
                if (view.holdFrom != Int.MAX_VALUE) {
                    DccChip(
                        if (spoilers) "SHOWING ALL RESULTS" else "RESULTS HELD",
                        spoilers, accent = true,
                    ) { spoilers = !spoilers }
                    Spacer(Modifier.height(6.dp))
                    MetaText(
                        "The game keeps the country's scores out of sight until you play your own, " +
                            "so week ${view.holdFrom} onwards stays hidden.",
                        c.ink4, 9, maxLines = 3,
                    )
                    Spacer(Modifier.height(10.dp))
                }
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    view.weeks.forEach { w -> DccChip("WK $w", w == week) { week = w; openGame = null } }
                }
                val league = remember(view, week) { view.gamesIn(week) }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (league.isEmpty()) item { DccCard { EmptyState("no games that week") } }
                    items(league, key = { it.row }) { g ->
                        val held = view.holds(g, spoilers)
                        LeagueGameRow(g, held, view.isUserGame(g), openGame == g.row && !held) {
                            openGame = if (openGame == g.row) null else g.row
                        }
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }

            else -> Column(Modifier.fillMaxSize()) {
                DccField(teamQuery, "SEARCH TEAM OR CONFERENCE") { teamQuery = it }
                Spacer(Modifier.height(8.dp))
                MetaText("${teamList.size} OF ${view.teams.size} PROGRAMS", c.ink4, 9)
                Spacer(Modifier.height(8.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(teamList, key = { it.index }) { t ->
                        SnapshotTeamRow(t, t.index == view.userTeam?.index) {
                            teamIndex = t.index
                            openPlayer = null
                            openGame = null
                            tab = "ROSTER"
                        }
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

/**
 * One program as the save has it. Shared with National's standings, so the
 * teams read the same wherever they appear.
 */
@Composable
fun SnapshotTeamRow(t: SnapshotTeam, isUser: Boolean, onClick: (() -> Unit)? = null) {
    val c = Dcc.colors
    DccCard(borderColor = if (isUser) c.accent else c.surfaceLine, onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SchoolBadge(t.monogram, t.name, isUser, 24.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                RowTitle(t.name, c.ink, 15)
                Spacer(Modifier.height(2.dp))
                MetaText(
                    listOfNotNull(t.conference, t.division, t.coach).joinToString(" · ").ifEmpty { "—" },
                    c.ink3, 9, maxLines = 1,
                )
            }
            if (isUser) {
                MonoLabel("YOU", c.accent, 9)
                Spacer(Modifier.width(8.dp))
            }
            NumText("${t.wins}–${t.losses}", c.ink2, 12)
        }
    }
}

@Composable
private fun RosterRow(p: SnapshotPlayer, open: Boolean, onToggle: () -> Unit) {
    val c = Dcc.colors
    DccCard(onClick = onToggle) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            NumText(
                "${p.overall}",
                if (p.overall >= 90) c.ink else c.ink2, 15, FontWeight.SemiBold,
                Modifier.width(34.dp),
            )
            Portrait(p.name, 30.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                RowTitle(p.name, c.ink, 15)
                Spacer(Modifier.height(2.dp))
                MetaText(
                    listOfNotNull(
                        p.position,
                        SaveLabels.year(p.year),
                        listOfNotNull(p.hometown.ifEmpty { null }, p.state).joinToString(", ").ifEmpty { null },
                    ).joinToString(" · "),
                    c.ink3, 9, maxLines = 1,
                )
            }
            if (p.redshirt) {
                Spacer(Modifier.width(8.dp))
                MonoLabel("RS", c.ink4, 9)
            }
        }

        if (open) {
            Spacer(Modifier.height(11.dp))
            MetaText(
                listOfNotNull(
                    p.dev,
                    p.archetype,
                    SaveLabels.height(p.heightIn).ifEmpty { null },
                    p.weightLb?.let { "$it lb" },
                    p.stars?.takeIf { it in 1..5 }?.let { Rules.stars(it) },
                    p.nilK?.takeIf { it > 0 }?.let { "NIL \$${it}K" },
                ).joinToString(" · "),
                c.ink3, 10, maxLines = 3,
            )

            val ratings = p.ratings
            if (ratings.isNullOrEmpty()) {
                Spacer(Modifier.height(8.dp))
                MetaText("RATINGS COME ONLY WITH YOUR OWN ROSTER", c.ink4, 9)
            } else {
                Spacer(Modifier.height(11.dp))
                MonoLabel("RATINGS", c.ink3, 9)
                Spacer(Modifier.height(6.dp))
                // Strongest first: on a phone the top of the list is the part
                // that actually gets read.
                ratings.entries.sortedByDescending { it.value }.forEach { (label, value) ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        MetaText(label, c.ink3, 9, Modifier.weight(1f), maxLines = 1)
                        Box(Modifier.width(70.dp)) {
                            DccTrack(value, color = if (value >= 85) c.accent else c.ink4)
                        }
                        Spacer(Modifier.width(9.dp))
                        NumText("$value", if (value >= 85) c.ink else c.ink2, 11, modifier = Modifier.width(24.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun TeamGameRow(g: SnapshotGame, teamIndex: Int, next: Boolean, open: Boolean, onToggle: () -> Unit) {
    val c = Dcc.colors
    val home = g.homeIndex == teamIndex
    val opponent = (if (home) g.away else g.home).orEmpty().ifEmpty { "TBD" }
    val forScore = if (home) g.homeScore else g.awayScore
    val against = if (home) g.awayScore else g.homeScore
    val won = forScore > against
    val kickoff = SaveLabels.kickoff(g.kickoff)

    DccCard(borderColor = if (next) c.accent else c.surfaceLine, onClick = onToggle) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.width(52.dp)) {
                MonoLabel(if (g.postseason) "BOWL" else "WK ${g.week}", c.ink3, 9)
                Spacer(Modifier.height(2.dp))
                MetaText(SaveLabels.date(g.month, g.day), c.ink4, 9, maxLines = 1)
            }
            Spacer(Modifier.width(6.dp))
            MonoLabel(if (home) "VS" else "@", c.ink4, 9, Modifier.width(22.dp))
            Column(Modifier.weight(1f)) {
                RowTitle(opponent, c.ink, 15)
                Spacer(Modifier.height(2.dp))
                MetaText(
                    listOfNotNull(if (home) "HOME" else "AWAY", kickoff, if (g.userPlayed) "YOU PLAYED" else null)
                        .joinToString(" · "),
                    c.ink3, 9, maxLines = 1,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                if (g.played) {
                    MonoLabel(if (won) "W" else "L", if (won) c.good else c.accent, 12)
                    Spacer(Modifier.height(2.dp))
                    NumText("$forScore–$against${if (g.overtime) " OT" else ""}", c.ink2, 11)
                } else {
                    MonoLabel(if (next) "NEXT" else "UPCOMING", if (next) c.accent else c.warn, 10)
                }
            }
        }
        if (open) GameDetail(g)
    }
}

@Composable
private fun LeagueGameRow(
    g: SnapshotGame,
    held: Boolean,
    isUser: Boolean,
    open: Boolean,
    onToggle: () -> Unit,
) {
    val c = Dcc.colors
    DccCard(borderColor = if (isUser) c.accent else c.surfaceLine, onClick = onToggle) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                RowTitle(g.away.orEmpty().ifEmpty { "TBD" }, c.ink, 14)
                Spacer(Modifier.height(2.dp))
                RowTitle("at ${g.home.orEmpty().ifEmpty { "TBD" }}", c.ink2, 14)
                Spacer(Modifier.height(3.dp))
                MetaText(
                    listOfNotNull(SaveLabels.date(g.month, g.day).ifEmpty { null }, SaveLabels.kickoff(g.kickoff))
                        .joinToString(" · "),
                    c.ink4, 9, maxLines = 1,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                when {
                    held -> MonoLabel("HELD", c.ink4, 10)
                    !g.played -> MonoLabel("UPCOMING", c.warn, 9)
                    else -> {
                        NumText("${g.awayScore}", c.ink, 14, FontWeight.SemiBold)
                        Spacer(Modifier.height(2.dp))
                        NumText("${g.homeScore}${if (g.overtime) " OT" else ""}", c.ink, 14, FontWeight.SemiBold)
                    }
                }
            }
        }
        if (open) GameDetail(g)
    }
}

/** Conditions and the quarter-by-quarter line, as the save recorded them. */
@Composable
private fun GameDetail(g: SnapshotGame) {
    val c = Dcc.colors
    val overtime = g.overtime || g.homeOT > 0 || g.awayOT > 0

    Spacer(Modifier.height(11.dp))
    MetaText(
        listOfNotNull(
            SaveLabels.kickoff(g.kickoff)?.let { "Kickoff $it" },
            if (g.played || SaveLabels.weather(g.weather) != null) "${g.temperatureF}°F" else null,
            SaveLabels.weather(g.weather),
            g.windMph.takeIf { it > 0 }?.let { "Wind $it mph" },
            g.attendance.takeIf { it > 0 }?.let { "Attendance ${SaveLabels.grouped(it)}" },
            if (!g.played) "Upcoming" else if (g.userPlayed) "Played by you" else "Simulated",
        ).joinToString("  ·  "),
        c.ink3, 10, maxLines = 3,
    )

    if (!g.played) return

    Spacer(Modifier.height(9.dp))
    Row(Modifier.fillMaxWidth()) {
        Spacer(Modifier.weight(1f))
        listOf("Q1", "Q2", "Q3", "Q4").forEach { q ->
            MetaText(q, c.ink4, 9, Modifier.width(26.dp))
        }
        if (overtime) MetaText("OT", c.ink4, 9, Modifier.width(26.dp))
        MetaText("F", c.ink4, 9, Modifier.width(32.dp))
    }
    ScoreLine(g.away, g.awayQ, g.awayOT, g.awayScore, overtime)
    ScoreLine(g.home, g.homeQ, g.homeOT, g.homeScore, overtime)
}

@Composable
private fun ScoreLine(name: String?, quarters: List<Int>, ot: Int, final: Int, overtime: Boolean) {
    val c = Dcc.colors
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        RowTitle(name.orEmpty().ifEmpty { "TBD" }, c.ink, 13, Modifier.weight(1f))
        // Four quarters always, even when the save wrote fewer.
        for (i in 0 until 4) NumText("${quarters.getOrElse(i) { 0 }}", c.ink2, 12, modifier = Modifier.width(26.dp))
        if (overtime) NumText("$ot", c.ink2, 12, modifier = Modifier.width(26.dp))
        NumText("$final", c.ink, 13, FontWeight.SemiBold, Modifier.width(32.dp))
    }
}

/**
 * A player card: his school's own colour, its mark, and what a card has room
 * for.
 *
 * The colour is read off the school's logo on the PC and travels in the
 * snapshot, because the save carries no team colours and a hand-written table
 * of 138 would be wrong the moment a dynasty renamed one. A champion gets the
 * gold ring, which is the whole reason the game ships a gold mark.
 *
 * There is no portrait here yet. The phone has no art folder — the faces are
 * gigabytes on the PC — so a card shows initials until the portrait pack is
 * built and carried across.
 */
@Composable
private fun PlayerCard(
    p: SnapshotPlayer,
    color: Color,
    champion: Boolean,
    monogram: String,
    onClick: () -> Unit,
) {
    val ink = inkOn(color)
    val gold = Color(0xFFC9A227)
    Column(
        Modifier
            .fillMaxWidth()
            .aspectRatio(0.75f)
            .clip(RoundedCornerShape(Dcc.shapes.card))
            .background(color)
            .border(
                if (champion) 2.dp else 1.dp,
                if (champion) gold else Dcc.colors.surfaceLine,
                RoundedCornerShape(Dcc.shapes.card),
            )
            .clickable { onClick() },
    ) {
        Box(Modifier.fillMaxWidth().weight(1f)) {
            // The mark, low and large, the way a crest sits on a shirt.
            Text(
                monogram,
                modifier = Modifier.align(Alignment.Center),
                style = androidx.compose.ui.text.TextStyle(
                    fontFamily = Dcc.fonts.serif,
                    fontSize = 64.sp,
                    color = (if (champion) gold else ink).copy(alpha = 0.20f),
                ),
            )
            NumText(
                p.overall.toString(),
                size = 24,
                color = ink,
                weight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.TopStart).padding(start = 10.dp, top = 8.dp),
            )
            if (p.redshirt) {
                MetaText(
                    "RS",
                    ink.copy(alpha = 0.8f),
                    9,
                    Modifier.align(Alignment.TopEnd).padding(end = 10.dp, top = 10.dp),
                )
            }
        }
        // A shade at the foot, so the writing reads on any school's colour.
        Column(
            Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, Color.Black.copy(alpha = 0.55f)),
                    ),
                )
                .padding(horizontal = 10.dp, vertical = 9.dp),
        ) {
            RowTitle(p.name, Color.White, 14)
            Spacer(Modifier.height(2.dp))
            MetaText(
                listOfNotNull(p.position, SaveLabels.year(p.year), SaveLabels.height(p.heightIn).ifEmpty { null })
                    .joinToString(" · ").uppercase(),
                Color.White.copy(alpha = 0.72f),
                9,
            )
            Spacer(Modifier.height(2.dp))
            MetaText(
                "SPEED ${p.ratings?.get("Speed") ?: "—"}",
                Color.White.copy(alpha = 0.86f),
                9,
            )
        }
    }
}
