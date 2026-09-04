package com.dcc.app.ui.sections

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dcc.app.data.Persisted
import com.dcc.app.data.Prospect
import com.dcc.app.data.ProspectPatch
import com.dcc.app.data.Rules
import com.dcc.app.state.AppViewModel
import com.dcc.app.state.Derived
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc

private val TABS = listOf("MY BOARD", "PROSPECTS", "CLASS RANKS")

@Composable
fun RecruitSection(vm: AppViewModel, state: Persisted, d: Derived, myTeamId: String) {
    val c = Dcc.colors
    var tab by rememberSaveable { mutableStateOf(TABS[0]) }
    var expanded by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var starFilter by rememberSaveable { mutableStateOf<Int?>(null) }
    var posFilter by rememberSaveable { mutableStateOf<String?>(null) }
    var onlyInterested by rememberSaveable { mutableStateOf(false) }

    val board = remember(state.board, d) { d.boardProspects() }

    val filtered = remember(query, starFilter, posFilter, onlyInterested, d) {
        val q = query.trim().lowercase()
        d.prospects.asSequence()
            .filter { q.isEmpty() || "${it.name} ${it.town} ${it.state} ${it.pipeline}".lowercase().contains(q) }
            .filter { starFilter == null || it.stars == starFilter }
            .filter { posFilter == null || it.pos == posFilter }
            .filter { !onlyInterested || Rules.interestFor(it, myTeamId).inRange }
            .take(150)
            .toList()
    }

    fun queueStage(p: Prospect, stage: String) {
        vm.patchProspect(p.id, ProspectPatch(stage = stage))
        vm.enqueue(
            type = "RECRUIT",
            title = "${p.name} — $stage",
            detail = "Commitment stage ${p.stage} → $stage",
            applyKind = "stage", applyProspectId = p.id, applyStage = stage,
        )
    }

    Column(Modifier.fillMaxSize()) {
        SectionHeader(
            title = "Recruit",
            sub = { MetaText("${board.size} ON BOARD · ${d.prospects.size} IN POOL") },
        )

        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            TABS.forEach { t -> DccChip(t, tab == t) { tab = t } }
        }

        when (tab) {
            "MY BOARD" -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (board.isEmpty()) item { DccCard { EmptyState("add prospects from the pool") } }
                items(board, key = { it.id }) { p ->
                    val interest = Rules.interestFor(p, myTeamId)
                    val committed = p.stage in setOf("SOFT COMMIT", "COMMITTED", "HARD COMMIT", "SIGNED")
                    DccCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Portrait(p.name, 40.dp)
                            Spacer(Modifier.width(11.dp))
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    RowTitle(p.name, c.ink, 15, Modifier.weight(1f, false))
                                    Spacer(Modifier.width(8.dp))
                                    StarRow(p.stars, 9)
                                }
                                Spacer(Modifier.height(2.dp))
                                MetaText("${p.pos} · #${p.natlRank} NATL", c.ink3, 9.5.toInt())
                                Spacer(Modifier.height(2.dp))
                                MonoLabel(interest.text, toneColor(interest.tone), 9)
                                if (p.id in d.queuedProspectIds) {
                                    Spacer(Modifier.height(2.dp))
                                    SyncDot(true)
                                }
                            }
                            Spacer(Modifier.width(8.dp))
                            // Their board order — left is their #1.
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                val shown = if (committed) p.topSchools.take(1) else p.topSchools.take(3)
                                shown.forEach { id ->
                                    d.teamsById[id]?.let { t -> SchoolBadge(t.monogram, t.name, t.isUser, 22.dp) }
                                }
                            }
                        }

                        Spacer(Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            StagePill(p.stage, toneColor(Rules.stageTone(p.stage))) {
                                expanded = if (expanded == p.id) null else p.id
                            }
                            Spacer(Modifier.weight(1f))
                            DccButton("− Remove", small = true) { vm.toggleBoard(p.id) }
                        }

                        if (expanded == p.id) {
                            Spacer(Modifier.height(11.dp))
                            MetaText("COMMITMENT STAGE — CHANGES QUEUE FOR THE PC AGENT", c.ink3, 9)
                            Spacer(Modifier.height(7.dp))
                            Row(
                                Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Rules.STAGES.forEach { s ->
                                    DccChip(s, p.stage == s, accent = true) { queueStage(p, s) }
                                }
                            }
                            Spacer(Modifier.height(10.dp))
                            MetaText("THEIR TOP SCHOOLS — IN THEIR ORDER", c.ink3, 9)
                            Spacer(Modifier.height(7.dp))
                            Row(
                                Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                p.topSchools.forEachIndexed { i, id ->
                                    d.teamsById[id]?.let { t ->
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            MetaText("#${i + 1}", c.ink4, 9)
                                            Spacer(Modifier.width(4.dp))
                                            SchoolBadge(t.monogram, t.name, t.isUser, 22.dp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }

            "PROSPECTS" -> Column(Modifier.fillMaxSize()) {
                DccField(query, "SEARCH NAME, TOWN, STATE, PIPELINE") { query = it }
                Spacer(Modifier.height(8.dp))
                Row(
                    Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf(5, 4, 3, 2, 1).forEach { s ->
                        DccChip("$s★", starFilter == s) { starFilter = if (starFilter == s) null else s }
                    }
                    DccChip("Interested in me", onlyInterested) { onlyInterested = !onlyInterested }
                }
                Spacer(Modifier.height(6.dp))
                Row(
                    Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Rules.POSITIONS.forEach { p ->
                        DccChip(p, posFilter == p) { posFilter = if (posFilter == p) null else p }
                    }
                }
                Spacer(Modifier.height(8.dp))
                MetaText("${filtered.size} SHOWN OF ${d.prospects.size}", c.ink4, 9)
                Spacer(Modifier.height(8.dp))

                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(filtered, key = { it.id }) { p ->
                        val onBoard = p.id in state.board
                        DccCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                NumText("${p.natlRank}", c.ink4, 11, modifier = Modifier.width(34.dp))
                                Portrait(p.name, 30.dp)
                                Spacer(Modifier.width(9.dp))
                                Column(Modifier.weight(1f)) {
                                    RowTitle(p.name, c.ink, 14)
                                    Spacer(Modifier.height(2.dp))
                                    MetaText(
                                        "${p.pos} · ${p.height} · ${p.town}, ${p.state} · ${p.stage}",
                                        c.ink3, 9, maxLines = 1,
                                    )
                                }
                                Spacer(Modifier.width(8.dp))
                                Column(horizontalAlignment = Alignment.End) {
                                    StarRow(p.stars, 9)
                                    Spacer(Modifier.height(2.dp))
                                    NumText(
                                        if (p.ovrRevealed) "${p.ovr}" else "—",
                                        if (p.ovrRevealed) c.ink else c.ink4, 13,
                                    )
                                }
                                Spacer(Modifier.width(10.dp))
                                DccButton(
                                    if (onBoard) "✓" else "+",
                                    style = if (onBoard) BtnStyle.PRIMARY else BtnStyle.SECONDARY,
                                    small = true,
                                ) { vm.toggleBoard(p.id) }
                            }
                        }
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }

            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(d.teamsById.values.sortedByDescending { it.prestige }, key = { it.id }) { t ->
                    DccCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            SchoolBadge(t.monogram, t.name, t.isUser, 24.dp)
                            Spacer(Modifier.width(10.dp))
                            RowTitle(t.name, c.ink, 15, Modifier.weight(1f))
                            NumText("${10 + ((t.prestige * 3) % 14)} commits", c.ink3, 10)
                            Spacer(Modifier.width(10.dp))
                            NumText("${t.prestige * 271 + 900}", c.warn, 12)
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}
