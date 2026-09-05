package com.dcc.app.ui.gold

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dcc.app.data.Persisted
import com.dcc.app.data.SnapshotGame
import com.dcc.app.data.SnapshotRecruit
import com.dcc.app.state.SnapshotView
import com.dcc.app.ui.theme.Dcc
import com.dcc.app.ui.theme.initialsOf
import com.dcc.app.ui.theme.toneFor

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
                    if (last == null) "YOUR PROGRAMME" else "FEATURE · WEEK ${last.week}",
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
            Label("SATURDAY", 10.0, c.ink3, 2.0, Modifier.padding(top = 2.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (g in saturday.take(14)) {
                    ScoreCard(g, mine = snap.isUserGame(g)) { onOpenGame(g) }
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
private fun ScoreCard(g: SnapshotGame, mine: Boolean, onOpen: () -> Unit) {
    val c = Dcc.colors
    val homeWon = g.homeScore > g.awayScore
    Column(
        Modifier
            .width(112.dp)
            .clip(RoundedCornerShape(Dcc.shapes.button))
            .border(1.dp, if (mine) c.accent else c.line, RoundedCornerShape(Dcc.shapes.button))
            .background(if (mine) c.surfaceStrong else c.surface)
            .clickable(onClick = onOpen)
            .padding(horizontal = 11.dp, vertical = 9.dp),
    ) {
        ScoreLine(g.away ?: "", g.awayScore, dim = homeWon)
        Spacer(Modifier.height(4.dp))
        ScoreLine(g.home ?: "", g.homeScore, dim = !homeWon)
    }
}

@Composable
private fun ScoreLine(team: String, score: Int, dim: Boolean) {
    val c = Dcc.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        Ui(team, 11.0, if (dim) c.ink3 else c.ink, FontWeight.SemiBold, Modifier.weight(1f), maxLines = 1)
        Spacer(Modifier.width(6.dp))
        GoldNum("$score", 15, if (dim) c.ink3 else c.ink)
    }
}

/** A score row wide enough to stand on its own, for the League tab. */
@Composable
fun GoldScoreRow(away: String, awayScore: Int, home: String, homeScore: Int, modifier: Modifier = Modifier) {
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
        ScoreLine(away, awayScore, dim = homeWon)
        Spacer(Modifier.height(4.dp))
        ScoreLine(home, homeScore, dim = !homeWon)
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
        Box(
            Modifier
                .size(30.dp)
                .clip(CircleShape)
                .background(toneFor(name, c.tones))
                .border(1.dp, c.line, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            GoldNum(initialsOf(name), 10, c.ink)
        }
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
