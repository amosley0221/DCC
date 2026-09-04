package com.dcc.app.ui.sections

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dcc.app.data.*
import com.dcc.app.state.AppViewModel
import com.dcc.app.state.Derived
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc

private val TABS = listOf("SCHEDULE", "ROSTER", "DEPTH", "TRADE", "TOP 25")

@Composable
fun TeamSection(vm: AppViewModel, dynasty: Dynasty, state: Persisted, d: Derived, onCall: (String) -> Unit) {
    val c = Dcc.colors
    var tab by rememberSaveable { mutableStateOf(TABS[0]) }
    var teamId by rememberSaveable { mutableStateOf(dynasty.meta.userTeamId) }
    var editing by rememberSaveable { mutableStateOf<String?>(null) }
    var depthPos by rememberSaveable { mutableStateOf("QB") }

    val team = d.teamsById.getValue(teamId)

    Column(Modifier.fillMaxSize()) {
        SectionHeader(
            title = team.name,
            sub = { MetaText("RANK #${team.rank} · ${team.wins}–${team.losses} · ${team.conference}") },
        )

        // One team picker scopes every sub-tab, so all of this works for any program.
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            dynasty.teams.sortedBy { it.rank }.forEach { t ->
                DccChip("${t.rank} ${t.abbr}", teamId == t.id) { teamId = t.id; editing = null }
            }
        }
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            TABS.forEach { t -> DccChip(t, tab == t, accent = true) { tab = t } }
        }

        when (tab) {
            "SCHEDULE" -> LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(dynasty.schedule.filter { it.teamId == teamId }, key = { it.id }) { g ->
                    val opp = d.teamsById.getValue(g.opponentId)
                    val tone = when (g.result) {
                        "W" -> c.good
                        "L" -> c.accent
                        "NEXT" -> c.warn
                        else -> c.ink4
                    }
                    DccCard(borderColor = if (g.result == "NEXT") c.accent else c.surfaceLine) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            NumText("WK ${g.week}", c.ink3, 10, modifier = Modifier.width(46.dp))
                            SchoolBadge(opp.monogram, opp.name, opp.isUser, 24.dp)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                RowTitle(opp.name, c.ink, 15)
                                Spacer(Modifier.height(2.dp))
                                MetaText(
                                    buildString {
                                        append(if (g.home) "HOME" else "AWAY")
                                        if (g.ranked) append(" · #${opp.rank}")
                                        if (g.rivalry) append(" · RIVALRY")
                                        append(" · ${g.kickoff}")
                                    },
                                    c.ink3, 9, maxLines = 1,
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                MonoLabel(g.result ?: "—", tone, 12)
                                g.score?.let {
                                    Spacer(Modifier.height(2.dp))
                                    MetaText(it, c.ink3, 9)
                                }
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }

            "ROSTER" -> LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(d.rosterOf(teamId), key = { it.id }) { p ->
                    val open = editing == p.id
                    DccCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            NumText(
                                "${p.ovr}",
                                if (p.ovr >= 90) c.warn else c.ink2, 15,
                                androidx.compose.ui.text.font.FontWeight.SemiBold,
                                Modifier.width(34.dp),
                            )
                            Portrait(p.name, 30.dp)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                RowTitle(p.name, c.ink, 15)
                                Spacer(Modifier.height(2.dp))
                                MetaText(
                                    "${p.pos}${p.depth} · ${p.year} · ${p.dev}" + if (p.redshirt) " · RS" else "",
                                    c.ink3, 9, maxLines = 1,
                                )
                                if (p.id in d.queuedPlayerIds) {
                                    Spacer(Modifier.height(2.dp))
                                    SyncDot(true)
                                }
                            }
                            DccButton("✆", small = true) { onCall(p.id) }
                            Spacer(Modifier.width(6.dp))
                            DccButton(if (open) "Close" else "✎", small = true) {
                                editing = if (open) null else p.id
                            }
                        }

                        if (open) {
                            Spacer(Modifier.height(12.dp))
                            MetaText("OVERALL — QUEUES A SAVE WRITE", c.ink3, 9)
                            Spacer(Modifier.height(6.dp))
                            Stepper(p.ovr, 40, 99) { v ->
                                vm.patchPlayer(p.id, PlayerPatch(ovr = v))
                                vm.enqueue(
                                    "ROSTER", "${p.name} — ${team.name}", "Overall ${p.ovr} → $v",
                                    applyKind = "ovr", applyPlayerId = p.id, applyOvr = v,
                                )
                            }
                            Spacer(Modifier.height(10.dp))
                            MetaText("DEV TRAIT", c.ink3, 9)
                            Spacer(Modifier.height(6.dp))
                            Row(
                                Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Rules.DEV_TRAITS.forEach { t ->
                                    DccChip(t, p.dev == t, accent = true) {
                                        vm.patchPlayer(p.id, PlayerPatch(dev = t))
                                        vm.enqueue("ROSTER", "${p.name} — ${team.name}", "Dev trait ${p.dev} → $t")
                                    }
                                }
                            }
                            Spacer(Modifier.height(10.dp))
                            MetaText("CLASS", c.ink3, 9)
                            Spacer(Modifier.height(6.dp))
                            Row(
                                Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Rules.CLASSES.forEach { y ->
                                    DccChip(y, p.year == y, accent = true) {
                                        vm.patchPlayer(p.id, PlayerPatch(year = y))
                                        vm.enqueue("ROSTER", "${p.name} — ${team.name}", "Class ${p.year} → $y")
                                    }
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                            DccToggle(p.redshirt, if (p.redshirt) "REDSHIRTED" else "NOT REDSHIRTED") { v ->
                                vm.patchPlayer(p.id, PlayerPatch(redshirt = v))
                                vm.enqueue(
                                    "ROSTER", "${p.name} — ${team.name}",
                                    if (v) "Redshirt applied" else "Redshirt removed",
                                )
                            }
                            Spacer(Modifier.height(6.dp))
                            DccButton("Release player", style = BtnStyle.ACCENT) {
                                vm.enqueue("ROSTER", "Release ${p.name}", "Removed from the ${team.name} roster")
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }

            "DEPTH" -> {
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Rules.POSITIONS.forEach { p -> DccChip(p, depthPos == p) { depthPos = p } }
                }
                val group = d.depthOf(teamId, depthPos)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(group.size, key = { group[it].id }) { i ->
                        val p = group[i]
                        DccCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                MonoLabel(
                                    "$depthPos${i + 1}",
                                    if (i == 0) c.accent else c.ink3, 11,
                                    Modifier.width(46.dp),
                                )
                                Portrait(p.name, 28.dp)
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    RowTitle(p.name, c.ink, 14)
                                    MetaText("${p.year} · ${p.dev}", c.ink3, 9)
                                }
                                NumText("${p.ovr}", if (p.ovr >= 90) c.warn else c.ink2, 14)
                                Spacer(Modifier.width(8.dp))
                                DccButton("↑", small = true, enabled = i > 0) {
                                    val order = group.map { it.id }.toMutableList()
                                    order.add(i - 1, order.removeAt(i))
                                    vm.setDepth(teamId, depthPos, order)
                                    vm.enqueue(
                                        "DEPTH", "$depthPos depth chart — ${team.name}",
                                        "${p.name} → $depthPos$i",
                                        applyKind = "depth", applyTeamId = teamId,
                                        applyPos = depthPos, applyOrder = order,
                                    )
                                }
                                Spacer(Modifier.width(4.dp))
                                DccButton("↓", small = true, enabled = i < group.size - 1) {
                                    val order = group.map { it.id }.toMutableList()
                                    order.add(i + 1, order.removeAt(i))
                                    vm.setDepth(teamId, depthPos, order)
                                    vm.enqueue(
                                        "DEPTH", "$depthPos depth chart — ${team.name}",
                                        "${p.name} → $depthPos${i + 2}",
                                        applyKind = "depth", applyTeamId = teamId,
                                        applyPos = depthPos, applyOrder = order,
                                    )
                                }
                            }
                        }
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }

            "TRADE" -> TradeTab(vm, dynasty, d, teamId)

            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(dynasty.teams.sortedBy { it.rank }, key = { it.id }) { t ->
                    DccCard(borderColor = if (t.isUser) c.accent else c.surfaceLine, onClick = { teamId = t.id }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            NumText("${t.rank}", if (t.isUser) c.accent else c.ink3, 13, modifier = Modifier.width(30.dp))
                            SchoolBadge(t.monogram, t.name, t.isUser, 24.dp)
                            Spacer(Modifier.width(10.dp))
                            RowTitle(t.name, c.ink, 15, Modifier.weight(1f))
                            if (t.isUser) { MonoLabel("YOU", c.accent, 9); Spacer(Modifier.width(8.dp)) }
                            NumText("${t.wins}–${t.losses}", c.ink2, 12)
                            Spacer(Modifier.width(8.dp))
                            NumText(
                                when (t.trend) { "up" -> "▲"; "down" -> "▼"; else -> "—" },
                                when (t.trend) { "up" -> c.good; "down" -> c.accent; else -> c.ink4 },
                                12,
                            )
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

@Composable
private fun TradeTab(vm: AppViewModel, dynasty: Dynasty, d: Derived, myTeamId: String) {
    val c = Dcc.colors
    var otherId by rememberSaveable { mutableStateOf(dynasty.teams.first { !it.isUser }.id) }
    var mine by rememberSaveable { mutableStateOf(setOf<String>()) }
    var theirs by rememberSaveable { mutableStateOf(setOf<String>()) }

    val minePlayers = mine.mapNotNull { d.playersById[it] }
    val theirPlayers = theirs.mapNotNull { d.playersById[it] }
    val myCount = d.rosterOf(myTeamId).size
    val theirCount = d.rosterOf(otherId).size
    val myProjected = myCount - minePlayers.size + theirPlayers.size
    val theirProjected = theirCount - theirPlayers.size + minePlayers.size

    val overTeam = when {
        myProjected > Rules.ROSTER_LIMIT -> d.teamsById.getValue(myTeamId)
        theirProjected > Rules.ROSTER_LIMIT -> d.teamsById.getValue(otherId)
        else -> null
    }
    val overCount = if (myProjected > Rules.ROSTER_LIMIT) myProjected else theirProjected
    val verdict = Rules.tradeVerdict(minePlayers, theirPlayers)
    val empty = minePlayers.isEmpty() && theirPlayers.isEmpty()

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            dynasty.teams.filter { !it.isUser }.sortedBy { it.rank }.forEach { t ->
                DccChip(t.abbr, otherId == t.id) { otherId = t.id; theirs = emptySet() }
            }
        }

        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            item {
                TradeHeader(d.teamsById.getValue(myTeamId).name, myCount, myProjected)
            }
            items(d.rosterOf(myTeamId).take(30), key = { "m${it.id}" }) { p ->
                TradeRow(p, p.id in mine) {
                    mine = if (p.id in mine) mine - p.id else mine + p.id
                }
            }
            item {
                Spacer(Modifier.height(10.dp))
                TradeHeader(d.teamsById.getValue(otherId).name, theirCount, theirProjected)
            }
            items(d.rosterOf(otherId).take(30), key = { "t${it.id}" }) { p ->
                TradeRow(p, p.id in theirs) {
                    theirs = if (p.id in theirs) theirs - p.id else theirs + p.id
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }

        DccCard {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                MetaText("YOU SEND ${minePlayers.size}", c.ink3, 9)
                MonoLabel(if (empty) "—" else verdict.text, toneColor(verdict.tone), 10)
                MetaText("YOU GET ${theirPlayers.size}", c.ink3, 9)
            }
            Spacer(Modifier.height(6.dp))
            DccTrack((verdict.balance * 100).toInt(), color = toneColor(verdict.tone), height = 5.dp)

            // The 85-man limit is enforced by prevention: an illegal trade has
            // no submit path, so there is no failure state to land in.
            if (overTeam != null) {
                Spacer(Modifier.height(10.dp))
                EffectCallout(
                    "${overTeam.name} would carry $overCount players — " +
                        "${overCount - Rules.ROSTER_LIMIT} over the ${Rules.ROSTER_LIMIT}-man limit.",
                )
            }

            Spacer(Modifier.height(10.dp))
            if (overTeam != null) {
                DccButton("Over the limit — can't queue", Modifier.fillMaxWidth(), BtnStyle.DEAD)
            } else {
                DccButton(
                    if (empty) "Select players" else "Queue trade",
                    Modifier.fillMaxWidth(),
                    BtnStyle.PRIMARY,
                    enabled = !empty,
                ) {
                    vm.enqueue(
                        "TRADE",
                        "${d.teamsById.getValue(myTeamId).name} ⇄ ${d.teamsById.getValue(otherId).name}",
                        "Send ${minePlayers.joinToString { it.name }.ifEmpty { "nobody" }} · " +
                            "receive ${theirPlayers.joinToString { it.name }.ifEmpty { "nobody" }} · " +
                            "post-trade $myProjected/$theirProjected",
                    )
                    mine = emptySet(); theirs = emptySet()
                }
            }
        }
    }
}

@Composable
private fun TradeHeader(name: String, current: Int, projected: Int) {
    val c = Dcc.colors
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        RowTitle(name, c.ink, 15, Modifier.weight(1f))
        NumText("$current/${Rules.ROSTER_LIMIT} → ", c.ink3, 11)
        NumText(
            "$projected",
            toneColor(Rules.countTone(projected)),
            13,
            androidx.compose.ui.text.font.FontWeight.SemiBold,
        )
    }
}

@Composable
private fun TradeRow(p: Player, picked: Boolean, onClick: () -> Unit) {
    val c = Dcc.colors
    DccCard(borderColor = if (picked) c.accent else c.surfaceLine, onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Portrait(p.name, 26.dp)
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                RowTitle(p.name, c.ink, 14)
                MetaText("${p.pos}${p.depth} · ${p.year}", c.ink3, 9)
            }
            NumText("${p.ovr}", if (p.ovr >= 90) c.warn else c.ink2, 14)
        }
    }
}
