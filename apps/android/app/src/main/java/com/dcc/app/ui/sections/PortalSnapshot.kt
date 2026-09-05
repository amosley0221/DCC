package com.dcc.app.ui.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dcc.app.data.SnapshotMove
import com.dcc.app.data.SnapshotThread
import com.dcc.app.data.name
import com.dcc.app.state.SnapshotView
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc

private val TABS = listOf("TRANSFERS", "TAMPERING")

/**
 * The portal, from the snapshot: who moved, and who you are working on.
 *
 * Neither half is built here. The transfer ledger needs two seasons of saves
 * read on the PC, and a tampering conversation needs the API key that lives
 * there, so both arrive with the snapshot and this screen reads them. That is
 * worth saying on the screen rather than leaving a phone that looks broken.
 */
@Composable
fun PortalSnapshotSection(view: SnapshotView) {
    var tab by rememberSaveable { mutableStateOf(TABS[0]) }
    val moves = view.snapshot.transfers
    val threads = view.snapshot.threads

    Column(Modifier.fillMaxSize()) {
        SectionHeader(
            title = "The portal",
            sub = {
                MetaText(
                    if (tab == TABS[0]) "${moves.size} MOVES ON RECORD"
                    else "${threads.size} CONVERSATION" + if (threads.size == 1) "" else "S",
                )
            },
        )

        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            TABS.forEach { t -> DccChip(t, tab == t, accent = true) { tab = t } }
        }

        if (tab == TABS[0]) TransfersList(view, moves) else ThreadsList(threads)
    }
}

@Composable
private fun TransfersList(view: SnapshotView, moves: List<SnapshotMove>) {
    val me = view.userTeam?.name
    var scope by rememberSaveable { mutableStateOf("MINE") }
    val shown = remember(moves, scope, me) {
        when {
            me == null -> moves
            scope == "MINE" -> moves.filter { it.from == me || it.to == me }
            scope == "IN" -> moves.filter { it.to == me }
            scope == "OUT" -> moves.filter { it.from == me }
            else -> moves
        }
    }

    Column(Modifier.fillMaxSize()) {
        if (me != null) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                for (s in listOf("MINE" to "MY PROGRAM", "IN" to "CAME IN", "OUT" to "LEFT", "ALL" to "EVERY SCHOOL")) {
                    DccChip(s.second, scope == s.first) { scope = s.first }
                }
            }
        }

        if (moves.isEmpty()) {
            DccCard {
                Kicker("Two seasons are needed")
                Spacer(Modifier.height(7.dp))
                BodySerif(
                    "Your dynasty file says where every player is, never where they have been. " +
                        "The desktop writes down each roster when it reads your save, and a transfer " +
                        "is somebody who turns up somewhere else the next season. Read your save on " +
                        "the PC once a year and this fills in, then bring the snapshot across.",
                )
            }
            return@Column
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (shown.isEmpty()) item { DccCard { EmptyState("no transfers match that") } }
            items(shown, key = { it.key + it.toSeason }) { m -> MoveRow(m, me) }
        }
    }
}

@Composable
private fun MoveRow(m: SnapshotMove, me: String?) {
    val c = Dcc.colors
    DccCard {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                RowTitle(m.name)
                Spacer(Modifier.height(3.dp))
                MetaText("${m.position} · ${m.from} → ${m.to}".uppercase())
            }
            Column(horizontalAlignment = Alignment.End) {
                NumText(
                    m.overallAfter.toString(),
                    size = 20,
                    color = if (m.to == me) c.accent else c.ink,
                    weight = FontWeight.SemiBold,
                )
                MetaText("SEASON ${m.toSeason}", c.ink4, 9)
            }
        }
    }
}

@Composable
private fun ThreadsList(threads: List<SnapshotThread>) {
    var open by rememberSaveable { mutableStateOf<String?>(null) }

    if (threads.isEmpty()) {
        DccCard {
            Kicker("Started on the desktop")
            Spacer(Modifier.height(7.dp))
            BodySerif(
                "From week 11 you can text players on other rosters, and they answer for " +
                    "themselves. That needs your API key, which lives on the PC, so the " +
                    "conversations are held there. Whatever you have said, and where you stand " +
                    "with each of them, comes across with the next snapshot.",
            )
        }
        return
    }

    LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items(threads, key = { it.key }) { t ->
            ThreadCard(t, open == t.key) { open = if (open == t.key) null else t.key }
        }
    }
}

@Composable
private fun ThreadCard(t: SnapshotThread, expanded: Boolean, onToggle: () -> Unit) {
    val c = Dcc.colors
    DccCard(onClick = onToggle) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                RowTitle(t.name)
                Spacer(Modifier.height(3.dp))
                MetaText("${t.position} · ${t.overall} · ${t.team}".uppercase())
            }
            Column(horizontalAlignment = Alignment.End) {
                NumText(t.interest.toString(), size = 20, color = c.accent, weight = FontWeight.SemiBold)
                MetaText(if (t.committed) "ENTERING" else "INTEREST", c.ink4, 9)
            }
        }
        Spacer(Modifier.height(8.dp))
        MetaText(t.standing.uppercase(), c.ink3, 10)
        Spacer(Modifier.height(6.dp))
        DccTrack(t.interest, color = c.accent, height = 5.dp)

        if (expanded) {
            Spacer(Modifier.height(10.dp))
            MetaText("HOW HARD HE IS TO MOVE · ${t.resistance}", c.ink4, 9)
            Spacer(Modifier.height(4.dp))
            DccTrack(t.resistance, color = c.ink3, height = 5.dp)
            if (t.because.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                BodySerif(t.because.joinToString(" "))
            }
            Spacer(Modifier.height(12.dp))
            for (turn in t.turns) {
                val mine = turn.from == "coach"
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 6.dp),
                    horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
                ) {
                    Box(Modifier.fillMaxWidth(0.84f), contentAlignment = if (mine) Alignment.CenterEnd else Alignment.CenterStart) {
                        Bubble(turn.text, mine)
                    }
                }
            }
        }
    }
}

@Composable
private fun Bubble(text: String, mine: Boolean) {
    val c = Dcc.colors
    Box(
        Modifier
            .background(
                if (mine) c.btnBg else c.surface,
                RoundedCornerShape(12.dp),
            )
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        BodySerif(text, if (mine) c.btnInk else c.ink2)
    }
}
