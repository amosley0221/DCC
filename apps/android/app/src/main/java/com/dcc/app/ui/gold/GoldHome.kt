package com.dcc.app.ui.gold

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dcc.app.data.League
import com.dcc.app.data.Persisted
import com.dcc.app.data.SnapshotGame
import com.dcc.app.data.SnapshotRecruit
import com.dcc.app.state.SnapshotView
import com.dcc.app.ui.components.PlayerFace
import com.dcc.app.ui.components.SchoolBadge
import com.dcc.app.ui.theme.Dcc
import kotlinx.coroutines.delay

/**
 * Home, as the handoff draws it for a phone: a feature, Saturday's scores
 * across, and your board.
 *
 * Everything is read from the snapshot the desktop sends. The feature well
 * carries the scoreline rather than a photograph — the save has no images, and
 * a fabricated one would be the only invented thing on the screen.
 */
@Composable
fun GoldHome(
    snap: SnapshotView?,
    state: Persisted,
    onOpenGame: (SnapshotGame) -> Unit,
    onOpenBoard: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    val c = Dcc.colors

    if (snap == null) {
        Standby(
            "Waiting on your save",
            "This shows your dynasty and nothing else, so it stays empty until your save reaches it. " +
                "The Windows app reads the save on your PC and hands the dynasty to this phone — over " +
                "your home Wi-Fi, through your own GitHub, or as a file you bring across.",
            onOpenSettings,
        )
        return
    }

    val me = snap.userTeam
    val mine = me?.let { snap.scheduleOf(it.index) }.orEmpty()
    val last = mine.lastOrNull { it.played && !it.postseason }
    val week = last?.week ?: snap.weeks.lastOrNull()
    val saturday = week?.let { snap.gamesIn(it) }.orEmpty()
        .filter { it.played && !snap.holds(it, false) }
        .sortedByDescending { snap.isUserGame(it) }
    val board = snap.recruits.take(6)

    /**
     * Saturday, either your league or the ranked games.
     *
     * The country plays a hundred and twenty games a week and a phone cannot
     * show them all, so the rail carries the ones you would actually look for:
     * your conference by default, the top 25 on a tap. Both are ordered with
     * your own game first.
     */
    var ranked by rememberSaveable { mutableStateOf(false) }
    val table = remember(snap) {
        League.build(
            League.visible(snap.snapshot.games, me?.index, snap.holdFrom, false),
            snap.snapshot.teams,
        )
    }
    val rankOf = remember(table) {
        League.rankings(table).withIndex().associate { (i, r) -> r.index to i + 1 }
    }
    val bestRank = { g: SnapshotGame ->
        minOf(rankOf[g.homeIndex] ?: 999, rankOf[g.awayIndex] ?: 999)
    }
    val shown = remember(saturday, ranked, table, rankOf) {
        val conference = me?.conference
        val picked = if (!ranked && !conference.isNullOrBlank()) {
            saturday.filter {
                table[it.homeIndex]?.conference == conference || table[it.awayIndex]?.conference == conference
            }
        } else {
            saturday.filter { bestRank(it) <= 25 }
        }
        // Never an empty rail because a filter found nothing: the week itself is
        // the fallback, and it is the honest one.
        (if (picked.isEmpty()) saturday else picked).sortedWith(
            compareByDescending<SnapshotGame> { snap.isUserGame(it) }.thenBy { bestRank(it) },
        )
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = 8.dp, bottom = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // ── the feature ───────────────────────────────────────────────────
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Dcc.shapes.card))
                .border(1.dp, c.line, RoundedCornerShape(Dcc.shapes.card))
                .background(c.surface)
                // The feature is about a game, so it opens that game.
                .then(if (last != null) Modifier.clickable { onOpenGame(last) } else Modifier),
        ) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(112.dp)
                    .background(Brush.linearGradient(listOf(c.surfaceStrong, c.surface))),
                contentAlignment = Alignment.Center,
            ) {
                if (last != null) {
                    val home = last.home == me?.name
                    val us = if (home) last.homeScore else last.awayScore
                    val them = if (home) last.awayScore else last.homeScore
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        GoldNum("$us", 46, if (us >= them) c.ink else c.ink3)
                        Box(
                            Modifier
                                .padding(horizontal = 10.dp)
                                .width(14.dp)
                                .height(3.dp)
                                .background(c.ink3),
                        )
                        GoldNum("$them", 46, if (them > us) c.ink else c.ink3)
                    }
                } else {
                    Label("NOTHING PLAYED YET", 10.0, c.ink3, 3.0)
                }
            }
            Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 14.dp)) {
                Label(
                    if (last == null) "YOUR PROGRAM" else "FEATURE · WEEK ${last.week}",
                    10.0, c.accent, 2.5,
                )
                Spacer(Modifier.height(6.dp))
                Display(
                    if (last == null) me?.name ?: "Your dynasty"
                    else featureHeadline(last, me?.name),
                    19, c.ink,
                )
                Spacer(Modifier.height(6.dp))
                Ui(featureStandfirst(last, me?.wins, me?.losses), 12.0, c.ink2)
            }
        }

        // ── Saturday ──────────────────────────────────────────────────────
        if (saturday.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth().padding(top = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Label(
                    if (ranked) "SATURDAY · RANKED"
                    else "SATURDAY · ${(me?.conference ?: "AROUND THE COUNTRY").uppercase()}",
                    10.0, c.ink3, 2.0, Modifier.weight(1f),
                )
                Label(
                    if (ranked) "MY LEAGUE" else "TOP 25",
                    10.0, c.accent, 1.5,
                    Modifier.clickable { ranked = !ranked },
                )
            }

            // It scrolls itself, slowly, so a glance at the phone gets more than
            // the first two cards. A drag interrupts it and it picks up again.
            val scroll = rememberScrollState()
            LaunchedEffect(scroll.maxValue, ranked) {
                if (scroll.maxValue <= 0) return@LaunchedEffect
                while (true) {
                    delay(2500)
                    scroll.animateScrollTo(
                        scroll.maxValue,
                        tween(durationMillis = scroll.maxValue * 14 + 1200, easing = LinearEasing),
                    )
                    delay(2500)
                    scroll.animateScrollTo(0, tween(durationMillis = 1100, easing = LinearEasing))
                }
            }
            Row(
                Modifier.fillMaxWidth().horizontalScroll(scroll),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (g in shown.take(18)) {
                    ScoreCard(
                        g,
                        mine = snap.isUserGame(g),
                        awayRank = rankOf[g.awayIndex],
                        homeRank = rankOf[g.homeIndex],
                    ) { onOpenGame(g) }
                }
            }
        }

        // ── the board ─────────────────────────────────────────────────────
        if (board.isNotEmpty()) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(Dcc.shapes.card))
                    .border(1.dp, c.line, RoundedCornerShape(Dcc.shapes.card))
                    .background(c.surface)
                    .padding(horizontal = 16.dp, vertical = 13.dp),
            ) {
                Row(
                    Modifier.clickable(onClick = onOpenBoard),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Label("THE BOARD", 10.0, c.ink3, 2.0)
                    Spacer(Modifier.weight(1f))
                    Label("ALL →", 10.0, c.accent, 1.5)
                }
                Spacer(Modifier.height(11.dp))
                for (r in board) {
                    BoardRow(
                        r,
                        scouted = state.revealAllRecruits || state.revealedRecruits.contains(r.playerId),
                        onOpen = onOpenBoard,
                    )
                    Spacer(Modifier.height(10.dp))
                }
            }
        }
    }
}

/** A headline the save's own numbers support, until a written one replaces it. */
private fun featureHeadline(g: SnapshotGame, me: String?): String {
    val home = g.home == me
    val us = if (home) g.homeScore else g.awayScore
    val them = if (home) g.awayScore else g.homeScore
    val other = (if (home) g.away else g.home) ?: "their opponent"
    return when {
        them == 0 -> "A shutout of $other"
        us > them -> "${me ?: "You"} $us, $other $them"
        else -> "$other $them, ${me ?: "you"} $us"
    }
}

private fun featureStandfirst(g: SnapshotGame?, wins: Int?, losses: Int?): String {
    if (g == null) return "Your season fills this in as it is played."
    val bits = mutableListOf<String>()
    if (wins != null && losses != null) bits += "$wins-$losses on the season."
    if (g.attendance > 0) bits += "${"%,d".format(g.attendance)} watched it."
    if (g.temperatureF > 0) bits += "${g.temperatureF}°F."
    return bits.joinToString(" ")
}

/** One Saturday result, sized for a thumb to scroll past. */
@Composable
private fun ScoreCard(g: SnapshotGame, mine: Boolean, awayRank: Int?, homeRank: Int?, onOpen: () -> Unit) {
    val c = Dcc.colors
    val homeWon = g.homeScore > g.awayScore
    Column(
        Modifier
            .width(150.dp)
            .clip(RoundedCornerShape(Dcc.shapes.button))
            .border(1.dp, if (mine) c.accent else c.line, RoundedCornerShape(Dcc.shapes.button))
            .background(if (mine) c.surfaceStrong else c.surface)
            .clickable(onClick = onOpen)
            .padding(horizontal = 11.dp, vertical = 9.dp),
    ) {
        ScoreLine(g.away ?: "", g.awayScore, dim = homeWon, rank = awayRank)
        Spacer(Modifier.height(4.dp))
        ScoreLine(g.home ?: "", g.homeScore, dim = !homeWon, rank = homeRank)
    }
}

/**
 * One side of a score, with the school's helmet.
 *
 * Shared by Saturday's cards on Home and by the League tab's wider rows, so the
 * helmet arrives in both at once. Without an art pack `SchoolBadge` draws its
 * two-letter disc and the row reads exactly as it did before.
 */
@Composable
private fun ScoreLine(team: String, score: Int, dim: Boolean, rank: Int? = null) {
    val c = Dcc.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        SchoolBadge(team.take(2).uppercase(), team, false, 24.dp, "helmet")
        Spacer(Modifier.width(6.dp))
        if (rank != null && rank <= 25) {
            Label("$rank", 9.0, c.ink3, 0.5)
            Spacer(Modifier.width(4.dp))
        }
        Ui(team, 13.0, if (dim) c.ink3 else c.ink, FontWeight.SemiBold, Modifier.weight(1f), maxLines = 1)
        Spacer(Modifier.width(6.dp))
        GoldNum("$score", 19, if (dim) c.ink3 else c.ink)
    }
}

/** A score row wide enough to stand on its own, for the League tab. */
@Composable
fun GoldScoreRow(
    away: String,
    awayScore: Int,
    home: String,
    homeScore: Int,
    modifier: Modifier = Modifier,
    awayRank: Int? = null,
    homeRank: Int? = null,
) {
    val c = Dcc.colors
    val homeWon = homeScore > awayScore
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Dcc.shapes.button))
            .border(1.dp, c.line, RoundedCornerShape(Dcc.shapes.button))
            .background(c.surface)
            .padding(horizontal = 13.dp, vertical = 10.dp),
    ) {
        ScoreLine(away, awayScore, dim = homeWon, rank = awayRank)
        Spacer(Modifier.height(4.dp))
        ScoreLine(home, homeScore, dim = !homeWon, rank = homeRank)
    }
}

/**
 * A recruit on your board.
 *
 * The handoff's pill carries a recruiting stage — TOP 3, COMMIT — which is not
 * decoded out of the save yet, so it carries what is: the overall once you have
 * scouted him, and the invitation to scout when you have not.
 */
@Composable
private fun BoardRow(r: SnapshotRecruit, scouted: Boolean, onOpen: () -> Unit) {
    val c = Dcc.colors
    val name = "${r.first} ${r.last}"
    Row(
        Modifier.clickable(onClick = onOpen),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlayerFace(name, r.assetId, 30.dp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Ui(name, 13.0, c.ink, FontWeight.SemiBold, maxLines = 1)
                Spacer(Modifier.width(6.dp))
                Text(
                    "★".repeat(r.stars ?: 0),
                    maxLines = 1,
                    style = TextStyle(fontFamily = Dcc.fonts.sans, fontSize = 10.sp, color = c.accent),
                )
            }
            Spacer(Modifier.height(1.dp))
            Label(
                listOfNotNull(r.position.ifBlank { null }, r.state ?: r.hometown.ifBlank { null })
                    .joinToString(" · "),
                10.0, c.ink3, 0.4,
            )
        }
        Spacer(Modifier.width(8.dp))
        val tint = if (scouted) c.accent else c.ink3
        Box(
            Modifier
                .clip(CircleShape)
                .border(1.dp, tint, CircleShape)
                .padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
            if (scouted) GoldNum("${r.overall}", 11, tint) else Label("SCOUT", 9.0, tint, 1.5)
        }
    }
}
