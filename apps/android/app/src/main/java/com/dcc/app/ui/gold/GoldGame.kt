package com.dcc.app.ui.gold

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dcc.app.data.SaveLabels
import com.dcc.app.data.SnapshotGame
import com.dcc.app.ui.theme.Dcc

/**
 * One game, opened from a score card or from the feature.
 *
 * Everything on it is decoded out of the save: the final, the quarter line, and
 * the conditions the game was played in. Per-player and team statistics are not
 * in the save's game table — the only per-team series it gives up is the
 * scoring by quarter — so this shows that rather than inventing box-score rows
 * that would have nothing behind them.
 */
@Composable
fun GoldGameSheet(g: SnapshotGame, userTeam: String?, onClose: () -> Unit) {
    val c = Dcc.colors
    val overtime = g.overtime || g.homeOT > 0 || g.awayOT > 0
    val homeWon = g.homeScore > g.awayScore
    val date = SaveLabels.date(g.month, g.day)

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = 8.dp, bottom = 16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Label(
                if (g.postseason) "BOX SCORE · BOWL" else "BOX SCORE · WEEK ${g.week}",
                10.0, c.accent, 2.5,
            )
            Spacer(Modifier.weight(1f))
            Box(
                Modifier
                    .clip(RoundedCornerShape(Dcc.shapes.button))
                    .border(1.dp, c.line, RoundedCornerShape(Dcc.shapes.button))
                    .clickable(onClick = onClose)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Label("CLOSE ✕", 9.0, c.ink3, 1.5)
            }
        }

        // ── the final ─────────────────────────────────────────────────────
        Spacer(Modifier.height(14.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(Dcc.shapes.card))
                .border(1.dp, c.line, RoundedCornerShape(Dcc.shapes.card))
                .background(c.surface)
                .padding(vertical = 18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (g.played) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    GoldNum("${g.awayScore}", 44, if (homeWon) c.ink3 else c.ink)
                    // Bodoni's hyphen is a hairline and disappears at this size,
                    // so the separator is drawn.
                    Box(
                        Modifier
                            .padding(horizontal = 10.dp)
                            .width(13.dp)
                            .height(3.dp)
                            .background(c.ink3),
                    )
                    GoldNum("${g.homeScore}", 44, if (homeWon) c.ink else c.ink3)
                }
            } else {
                Label("NOT PLAYED YET", 10.0, c.ink3, 3.0)
            }
            Spacer(Modifier.height(10.dp))
            Ui(
                "${g.away ?: "Away"} at ${g.home ?: "Home"}",
                13.0, c.ink2, FontWeight.SemiBold,
                Modifier.padding(horizontal = 16.dp), maxLines = 2,
            )
            Spacer(Modifier.height(3.dp))
            Label(
                listOfNotNull(
                    date.ifEmpty { null },
                    if (overtime) "OVERTIME" else null,
                    if (!g.played) null else if (g.userPlayed) "PLAYED BY YOU" else "SIMULATED",
                ).joinToString(" · ").uppercase(),
                9.0, c.ink4, 2.0,
            )
        }

        if (g.played) {
            // ── the quarter line ──────────────────────────────────────────
            Spacer(Modifier.height(18.dp))
            Label("SCORING BY QUARTER", 10.0, c.ink3, 2.0)
            Spacer(Modifier.height(9.dp))
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(Dcc.shapes.card))
                    .border(1.dp, c.line, RoundedCornerShape(Dcc.shapes.card))
                    .background(c.surface)
                    .padding(horizontal = 13.dp, vertical = 11.dp),
            ) {
                Row(Modifier.fillMaxWidth()) {
                    Spacer(Modifier.weight(1f))
                    for (q in listOf("1", "2", "3", "4")) {
                        Label(q, 9.0, c.ink4, 1.0, Modifier.width(26.dp))
                    }
                    if (overtime) Label("OT", 9.0, c.ink4, 1.0, Modifier.width(26.dp))
                    Label("T", 9.0, c.accent, 1.0, Modifier.width(32.dp))
                }
                Spacer(Modifier.height(8.dp))
                QuarterRow(g.away, g.awayQ, g.awayOT, g.awayScore, overtime, won = !homeWon)
                Spacer(Modifier.height(7.dp))
                QuarterRow(g.home, g.homeQ, g.homeOT, g.homeScore, overtime, won = homeWon)
            }

            // ── the same numbers, as a shape ──────────────────────────────
            val top = maxOf(1, (g.homeQ + g.awayQ).maxOrNull() ?: 1)
            if (g.homeQ.isNotEmpty() || g.awayQ.isNotEmpty()) {
                Spacer(Modifier.height(18.dp))
                Label("QUARTER BY QUARTER", 10.0, c.ink3, 2.0)
                Spacer(Modifier.height(9.dp))
                for (i in 0..3) {
                    QuarterBars(
                        quarter = i + 1,
                        away = g.awayQ.getOrElse(i) { 0 },
                        home = g.homeQ.getOrElse(i) { 0 },
                        top = top,
                    )
                    Spacer(Modifier.height(7.dp))
                }
                Row {
                    BarKey(g.away ?: "Away", c.accent)
                    Spacer(Modifier.width(16.dp))
                    BarKey(g.home ?: "Home", c.ink3)
                }
            }
        }

        // ── conditions ────────────────────────────────────────────────────
        Spacer(Modifier.height(18.dp))
        Label("CONDITIONS", 10.0, c.ink3, 2.0)
        Spacer(Modifier.height(9.dp))
        val tiles = listOf(
            "KICKOFF" to (SaveLabels.kickoff(g.kickoff) ?: "—"),
            "ATTENDANCE" to (g.attendance.takeIf { it > 0 }?.let { SaveLabels.grouped(it) } ?: "—"),
            "TEMPERATURE" to (g.temperatureF.takeIf { it != 0 }?.let { "$it°" } ?: "—"),
            "WEATHER" to (SaveLabels.weather(g.weather) ?: "—"),
            "WIND" to (if (g.windMph > 0) "${g.windMph} mph" else "Calm"),
        )
        for (pair in tiles.chunked(2)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                for (t in pair) Tile(t.first, t.second, Modifier.weight(1f))
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
            Spacer(Modifier.height(9.dp))
        }

        // The press piece is written on the desktop with the user's own key and
        // has no way across to the phone yet. Saying so beats a blank space
        // where a story is supposed to be.
        Spacer(Modifier.height(6.dp))
        Ui(
            if (userTeam != null && (g.home == userTeam || g.away == userTeam)) {
                "The written recap for your games lives on the Windows app for now — " +
                    "it is generated there with your own key and does not travel with the save."
            } else {
                "Coverage is written on the Windows app for now and does not travel with the save."
            },
            11.0, c.ink4,
        )
    }
}

@Composable
private fun QuarterRow(
    team: String?,
    quarters: List<Int>,
    ot: Int,
    total: Int,
    overtime: Boolean,
    won: Boolean,
) {
    val c = Dcc.colors
    val ink = if (won) c.ink else c.ink3
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Ui(
            team.orEmpty().ifEmpty { "TBD" }, 12.0, ink,
            if (won) FontWeight.SemiBold else FontWeight.Normal,
            Modifier.weight(1f), maxLines = 1,
        )
        for (i in 0..3) {
            GoldNum("${quarters.getOrElse(i) { 0 }}", 13, ink, Modifier.width(26.dp))
        }
        if (overtime) GoldNum("$ot", 13, ink, Modifier.width(26.dp))
        GoldNum("$total", 15, if (won) c.accent else c.ink3, Modifier.width(32.dp))
    }
}

/** Both sides of one quarter on a shared scale, so the run of play reads. */
@Composable
private fun QuarterBars(quarter: Int, away: Int, home: Int, top: Int) {
    val c = Dcc.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        Label("Q$quarter", 9.0, c.ink4, 1.0, Modifier.width(28.dp))
        Column(Modifier.weight(1f)) {
            Bar(away, top, c.accent)
            Spacer(Modifier.height(3.dp))
            Bar(home, top, c.ink3)
        }
        Spacer(Modifier.width(10.dp))
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.width(30.dp)) {
            GoldNum("$away", 11, c.accent)
            Spacer(Modifier.height(3.dp))
            GoldNum("$home", 11, c.ink3)
        }
    }
}

@Composable
private fun Bar(value: Int, top: Int, colour: Color) {
    val c = Dcc.colors
    Box(
        Modifier
            .fillMaxWidth()
            .height(7.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(c.track),
    ) {
        // A quarter with no points still shows a hairline, so an empty quarter
        // reads as nothing scored rather than as a row that failed to draw.
        Box(
            Modifier
                .fillMaxWidth((value.toFloat() / top).coerceIn(0.02f, 1f))
                .height(7.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(colour),
        )
    }
}

@Composable
private fun BarKey(name: String, colour: Color) {
    val c = Dcc.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(9.dp).height(9.dp).clip(RoundedCornerShape(2.dp)).background(colour))
        Spacer(Modifier.width(6.dp))
        Label(name.uppercase(), 9.0, c.ink4, 1.2)
    }
}

@Composable
private fun Tile(label: String, value: String, modifier: Modifier = Modifier) {
    val c = Dcc.colors
    // A figure gets Bodoni; a word like "Partly cloudy" gets the UI face, which
    // wraps and ellipsises rather than clipping at the tile's edge.
    val numeric = value.firstOrNull()?.isDigit() == true
    Column(
        modifier
            .clip(RoundedCornerShape(Dcc.shapes.button))
            .border(1.dp, c.line, RoundedCornerShape(Dcc.shapes.button))
            .background(c.surface)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Label(label, 9.0, c.ink4, 1.5)
        Spacer(Modifier.height(5.dp))
        if (numeric) GoldNum(value, 17, c.ink)
        else Ui(value, 14.0, c.ink, FontWeight.Medium, maxLines = 2)
    }
}
