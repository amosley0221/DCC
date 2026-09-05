package com.dcc.app.ui.gold

import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import com.dcc.app.data.Dynasty
import com.dcc.app.data.Persisted
import com.dcc.app.state.AppViewModel
import com.dcc.app.state.Derived
import com.dcc.app.state.SnapshotView
import com.dcc.app.ui.components.Kicker
import com.dcc.app.ui.components.MetaText
import com.dcc.app.ui.components.MonoLabel
import com.dcc.app.ui.sections.CoachSection
import com.dcc.app.ui.sections.NationalSection
import com.dcc.app.ui.sections.QueueSection
import com.dcc.app.ui.sections.RecruitSection
import com.dcc.app.ui.sections.RecruitSnapshotSection
import com.dcc.app.ui.sections.SettingsSection
import com.dcc.app.ui.sections.TamperSection
import com.dcc.app.ui.theme.Dcc

/**
 * The Gold Standard shell.
 *
 * The two working themes keep the left nav rail they were built with. This one
 * is a different shape on purpose: a masthead, five bottom tabs within reach of
 * a thumb, and editorial names rather than functional ones. Everything
 * operational — the dynasty file, devices, the queue — sits behind the gear, so
 * a surface meant to read as coverage carries none of it.
 */

/** The five tabs. M3 allows five; anything else goes behind the gear. */
private val TABS = listOf(
    GoldTab("home", "Home"),
    GoldTab("board", "Board"),
    GoldTab("portal", "Portal"),
    GoldTab("league", "League"),
    GoldTab("legacy", "Legacy"),
)

data class GoldTab(val id: String, val label: String)

/** Reachable from the gear, in every theme. */
private val OPS = listOf(
    GoldTab("settings", "Appearance"),
    GoldTab("dynasty", "Dynasty file"),
    GoldTab("queue", "Queue"),
)

@Composable
fun GoldShell(
    vm: AppViewModel,
    state: Persisted,
    dynasty: Dynasty?,
    derived: Derived?,
    snapshot: SnapshotView?,
    busy: String?,
    importError: String?,
) {
    val c = Dcc.colors
    var tab by rememberSaveable { mutableStateOf("home") }
    var ops by rememberSaveable { mutableStateOf<String?>(null) }
    var callTarget by rememberSaveable { mutableStateOf<String?>(null) }
    // The game's row in the save's table — the only stable id it has, and small
    // enough to survive rotation in saved state.
    var openGame by rememberSaveable { mutableStateOf<Int?>(null) }

    // Resolved here rather than in the branch, so a row that is no longer in
    // the snapshot — a save replaced while a game was open — simply falls back
    // to the tab instead of needing state written during composition.
    val game = openGame?.let { row -> snapshot?.snapshot?.games?.firstOrNull { it.row == row } }

    val week = snapshot?.meta?.currentWeek
    val team = snapshot?.meta?.userTeamName ?: snapshot?.userTeam?.name

    Box(Modifier.fillMaxSize().background(c.bg0)) {
        // Stadium haze: two soft washes in the accent, behind everything.
        //
        // Corner glows, not a full-height gradient. A vertical gradient across
        // the whole screen tinted every pixel, so the ground stopped being
        // black and became the accent — fine for champagne, navy for blue. The
        // desktop has always painted this as two ellipses fading to nothing;
        // this is the same shape, and the middle of the screen stays bg0.
        Canvas(Modifier.fillMaxSize()) {
            drawRect(
                Brush.radialGradient(
                    listOf(c.haze, Color.Transparent),
                    center = Offset(size.width * 0.72f, size.height * 0.10f),
                    radius = size.width * 0.80f,
                ),
            )
            drawRect(
                Brush.radialGradient(
                    listOf(c.haze2, Color.Transparent),
                    center = Offset(size.width * 0.12f, size.height * 0.90f),
                    radius = size.width * 0.70f,
                ),
            )
        }

        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            // ── masthead ──────────────────────────────────────────────────
            Box(Modifier.fillMaxWidth()) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 14.dp, bottom = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Row {
                        Text(
                            "DYNASTY ",
                            style = TextStyle(
                                fontFamily = Dcc.fonts.serif, fontWeight = FontWeight.SemiBold,
                                fontSize = 20.sp, letterSpacing = 3.sp, color = c.ink,
                            ),
                        )
                        Text(
                            "HQ",
                            style = TextStyle(
                                fontFamily = Dcc.fonts.serif, fontWeight = FontWeight.SemiBold,
                                fontSize = 20.sp, letterSpacing = 3.sp, color = c.accent,
                            ),
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        listOfNotNull(team, week?.let { "WEEK $it" })
                            .joinToString(" · ").ifEmpty { "NO DYNASTY YET" }.uppercase(),
                        style = TextStyle(
                            fontFamily = Dcc.fonts.sans, fontWeight = FontWeight.Medium,
                            fontSize = 9.sp, letterSpacing = 3.sp, color = c.accent,
                        ),
                    )
                }
                // The gear: everything operational, and the only way to it.
                Box(
                    Modifier
                        .align(Alignment.CenterEnd)
                        .padding(end = 12.dp)
                        .size(38.dp)
                        .clip(CircleShape)
                        .clickable { ops = if (ops == null) "settings" else null; openGame = null },
                    contentAlignment = Alignment.Center,
                ) {
                    MonoLabel(if (ops != null) "CLOSE" else "•••", if (ops != null) c.accent else c.ink3, if (ops != null) 9 else 13)
                }
            }

            Box(Modifier.fillMaxWidth().height(1.dp).background(c.line))

            // ── content ───────────────────────────────────────────────────
            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (ops != null) {
                    // No scroll here on purpose. Every section brings its own —
                    // Settings a verticalScroll, Queue a LazyColumn — and a
                    // scrollable nested in a scrollable of the same direction is
                    // measured with an infinite maximum height, which Compose
                    // throws on. That threw the moment this opened.
                    Column(
                        Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (o in OPS) {
                                OpsTab(o.label, ops == o.id) { ops = o.id }
                            }
                        }
                        Spacer(Modifier.height(16.dp))
                        Box(Modifier.weight(1f).fillMaxWidth()) {
                            // Each tab gets its own half. Both non-queue tabs
                            // used to fall through to the same call, so
                            // Appearance and Dynasty file drew the identical
                            // full page.
                            when (ops) {
                                "queue" -> QueueSection(vm, state)
                                "dynasty" ->
                                    SettingsSection(vm, state, dynasty, snapshot, busy, importError, "dynasty")
                                else ->
                                    SettingsSection(vm, state, dynasty, snapshot, busy, importError, "appearance")
                            }
                        }
                    }
                } else if (game != null) {
                    Box(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                        GoldGameSheet(game, snapshot?.meta?.userTeamName) { openGame = null }
                    }
                } else {
                    Box(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                        when (tab) {
                            "home" -> GoldHome(
                                snapshot,
                                state,
                                onOpenGame = { openGame = it.row },
                                onOpenBoard = { tab = "board" },
                            ) { ops = "dynasty" }

                            "board" -> if (snapshot != null) {
                                RecruitSnapshotSection(vm, state, snapshot)
                            } else if (dynasty != null && derived != null) {
                                RecruitSection(vm, state, derived, dynasty.meta.userTeamId)
                            } else {
                                Standby("The board", "Your recruiting class lands here once your save reaches this phone.") { ops = "dynasty" }
                            }

                            "portal" -> if (dynasty != null && derived != null) {
                                TamperSection(vm, dynasty, state, derived, callTarget) { callTarget = it }
                            } else {
                                Standby("The portal", "Conversations and offers open here once your save reaches this phone.") { ops = "dynasty" }
                            }

                            "league" -> if (snapshot != null || (dynasty != null && derived != null)) {
                                if (dynasty != null && derived != null) NationalSection(dynasty, derived, snapshot)
                                else GoldLeague(snapshot!!)
                            } else {
                                Standby("The league", "Scores and standings from around the country land here with your save.") { ops = "dynasty" }
                            }

                            else -> if (dynasty != null) {
                                CoachSection(vm, dynasty)
                            } else {
                                Standby("Legacy", "Your career, titles and the players you sent to Sunday. Not read out of the save yet.") { ops = "dynasty" }
                            }
                        }
                    }
                }
            }

            // ── bottom tabs ───────────────────────────────────────────────
            if (ops == null) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(c.line))
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(c.bar)
                        .padding(top = 10.dp, bottom = 6.dp),
                ) {
                    val held = state.queue.count { it.state == "HELD" }
                    for (t in TABS) {
                        val on = tab == t.id
                        Column(
                            Modifier
                                .weight(1f)
                                .clickable { tab = t.id; callTarget = null; openGame = null },
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            MonoLabel(t.label.uppercase(), if (on) c.accent else c.ink3, 10)
                            Spacer(Modifier.height(6.dp))
                            Box(
                                Modifier
                                    .size(4.dp)
                                    .clip(CircleShape)
                                    .background(if (on) c.accent else androidx.compose.ui.graphics.Color.Transparent),
                            )
                        }
                    }
                    // A held edit is a quiet cue, not a status line.
                    if (held > 0) {
                        Box(
                            Modifier
                                .padding(end = 10.dp)
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(c.warn),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OpsTab(label: String, on: Boolean, onClick: () -> Unit) {
    val c = Dcc.colors
    Box(
        Modifier
            .clip(RoundedCornerShape(Dcc.shapes.button))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        MonoLabel(label.uppercase(), if (on) c.accent else c.ink3, 11)
    }
}

/** A screen the app is built for but cannot fill yet. Product copy, not a note. */
@Composable
fun Standby(title: String, body: String, onOpenSettings: () -> Unit) {
    val c = Dcc.colors
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = 40.dp),
    ) {
        Text(
            title,
            style = TextStyle(
                fontFamily = Dcc.fonts.serif, fontWeight = FontWeight.SemiBold,
                fontSize = 34.sp, lineHeight = 36.sp, color = c.ink,
            ),
        )
        Spacer(Modifier.height(12.dp))
        Text(
            body,
            style = TextStyle(
                fontFamily = Dcc.fonts.sans, fontWeight = FontWeight.Normal,
                fontSize = 14.sp, lineHeight = 22.sp, color = c.ink2,
            ),
        )
        Spacer(Modifier.height(20.dp))
        Box(
            Modifier
                .clip(RoundedCornerShape(Dcc.shapes.button))
                .background(c.accent)
                .clickable(onClick = onOpenSettings)
                .padding(horizontal = 22.dp, vertical = 13.dp),
        ) {
            MonoLabel("BRING YOUR SAVE ACROSS", c.onAccent, 12)
        }
    }
}

/** Scores from around the country, when only the snapshot is loaded. */
@Composable
private fun GoldLeague(snap: SnapshotView) {
    val c = Dcc.colors
    val week = snap.weeks.lastOrNull { w -> snap.gamesIn(w).any { it.played } }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = 14.dp),
    ) {
        Kicker("Around the country", c.accent)
        Spacer(Modifier.height(4.dp))
        MetaText(week?.let { "WEEK $it" } ?: "NOTHING PLAYED YET", c.ink3, 10)
        Spacer(Modifier.height(14.dp))
        for (g in week?.let { snap.gamesIn(it) }.orEmpty().filter { it.played }.take(40)) {
            GoldScoreRow(
                away = g.away ?: "", awayScore = g.awayScore,
                home = g.home ?: "", homeScore = g.homeScore,
                modifier = Modifier.padding(bottom = 10.dp),
            )
        }
        Spacer(Modifier.height(20.dp))
    }
}
