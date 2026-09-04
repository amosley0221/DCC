package com.dcc.app.ui.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dcc.app.data.Dynasty
import com.dcc.app.data.Persisted
import com.dcc.app.state.AppViewModel
import com.dcc.app.state.Derived
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc

// ── national ─────────────────────────────────────────────────────────────────

private val NATIONAL_TABS = listOf("TOP STORIES", "SCORES", "LEADERS", "STANDINGS")

@Composable
fun NationalSection(dynasty: Dynasty, d: Derived) {
    val c = Dcc.colors
    var tab by rememberSaveable { mutableStateOf(NATIONAL_TABS[0]) }

    Column(Modifier.fillMaxSize()) {
        SectionHeader(
            title = "National",
            sub = { MetaText("SEASON ${dynasty.meta.season} · ${dynasty.teams.size} PROGRAMS") },
        )
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            NATIONAL_TABS.forEach { t -> DccChip(t, tab == t) { tab = t } }
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when (tab) {
                "TOP STORIES" -> items(d.stories.take(6), key = { it.id }) { s ->
                    DccCard {
                        Kicker(s.kicker)
                        Spacer(Modifier.height(5.dp))
                        Headline(s.headline)
                        Spacer(Modifier.height(6.dp))
                        BodySerif(s.body)
                    }
                }

                "SCORES" -> items(dynasty.national.scores.size) { i ->
                    val g = dynasty.national.scores[i]
                    DccCard {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            RowTitle(g.away, c.ink, 15)
                            NumText(g.score?.substringAfter("–").orEmpty(), c.ink, 14, FontWeight.SemiBold)
                        }
                        Spacer(Modifier.height(5.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            RowTitle(g.home, c.ink, 15)
                            NumText(g.score?.substringBefore("–").orEmpty(), c.ink, 14, FontWeight.SemiBold)
                        }
                        Spacer(Modifier.height(4.dp))
                        MetaText(if (g.final) "FINAL" else "IN PROGRESS", c.ink3, 9)
                    }
                }

                "LEADERS" -> items(dynasty.national.leaders.size) { i ->
                    val l = dynasty.national.leaders[i]
                    DccCard {
                        Kicker(l.cat)
                        Spacer(Modifier.height(9.dp))
                        l.rows.forEachIndexed { idx, row ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                                NumText("${idx + 1}", c.ink4, 11, modifier = Modifier.width(18.dp))
                                RowTitle(row.name, c.ink, 14, Modifier.weight(1f))
                                MetaText(row.team, c.ink3, 9)
                                Spacer(Modifier.width(10.dp))
                                NumText(row.value, c.ink, 13, FontWeight.SemiBold)
                            }
                        }
                    }
                }

                else -> items(dynasty.teams.sortedBy { it.rank }, key = { it.id }) { t ->
                    DccCard(borderColor = if (t.isUser) c.accent else c.surfaceLine) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            NumText("${t.rank}", if (t.isUser) c.accent else c.ink3, 13, modifier = Modifier.width(30.dp))
                            SchoolBadge(t.monogram, t.name, t.isUser, 24.dp)
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                RowTitle(t.name, c.ink, 15)
                                MetaText(t.conference, c.ink3, 9)
                            }
                            NumText("${t.wins}–${t.losses}", c.ink2, 12)
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

// ── coach ────────────────────────────────────────────────────────────────────

@Composable
fun CoachSection(vm: AppViewModel, dynasty: Dynasty) {
    val c = Dcc.colors
    val coach = dynasty.coach

    Column(Modifier.fillMaxSize()) {
        SectionHeader(
            title = "Coach",
            sub = { MetaText("ALL-TIME ${coach.record.wins}–${coach.record.losses}") },
        )
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatCard("ALL-TIME", "${coach.record.wins}–${coach.record.losses}", c.ink, Modifier.weight(1f))
                    StatCard("TITLES", "${coach.titles}", c.accent, Modifier.weight(1f))
                    StatCard("DRAFTED", "${coach.drafted}", c.ink, Modifier.weight(1f))
                }
            }
            item {
                DccCard {
                    Kicker("Career timeline")
                    Spacer(Modifier.height(10.dp))
                    coach.timeline.forEach { t ->
                        Row(Modifier.padding(vertical = 5.dp)) {
                            Box(
                                Modifier.width(3.dp).height(46.dp).background(c.accent),
                            )
                            Spacer(Modifier.width(12.dp))
                            Column {
                                RowTitle(t.school, c.ink, 15)
                                MetaText("${t.years} · ${t.record}", c.ink3, 9)
                                Spacer(Modifier.height(2.dp))
                                BodySerif(t.note)
                            }
                        }
                    }
                }
            }
            item {
                DccCard {
                    Kicker("Players drafted")
                    Spacer(Modifier.height(10.dp))
                    coach.draftPicks.forEach { p ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            MonoLabel("RD ${p.round}", if (p.round == 1) c.accent else c.ink3, 10, Modifier.width(46.dp))
                            RowTitle(p.name, c.ink, 14, Modifier.weight(1f))
                            MetaText("${p.pos} · ${p.year}", c.ink3, 9)
                        }
                    }
                }
            }
            item {
                DccCard {
                    Kicker("Honors")
                    Spacer(Modifier.height(10.dp))
                    coach.honors.forEach { h ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            MonoLabel(
                                h.tag,
                                when (h.tag) { "CHAMP" -> c.good; "MILE" -> c.warn; else -> c.ink3 },
                                9, Modifier.width(46.dp),
                            )
                            BodySerif(h.text, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
            item {
                DccCard(borderColor = c.accent) {
                    Kicker("Off the books")
                    Spacer(Modifier.height(6.dp))
                    BodySerif(
                        "Every use posts a scandal-risk story to the Wire and adds heat. The agent asks " +
                            "for a second confirmation before it writes one of these.",
                    )
                    Spacer(Modifier.height(11.dp))
                    DccButton("Bump a recruit +4 OVR", Modifier.fillMaxWidth()) {
                        vm.enqueue(
                            "OFFBOOKS", "Bump a recruit +4 OVR",
                            "Off-the-books rating boost", needsConfirm = true,
                        )
                        vm.addHeat(3)
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun StatCard(label: String, value: String, color: Color, modifier: Modifier) {
    DccCard(modifier) {
        MetaText(label, Dcc.colors.ink3, 9)
        Spacer(Modifier.height(4.dp))
        Text(
            value,
            style = TextStyle(
                fontFamily = Dcc.fonts.serif,
                fontWeight = FontWeight.SemiBold,
                fontSize = 22.sp,
                color = color,
            ),
        )
    }
}

// ── queue ────────────────────────────────────────────────────────────────────

@Composable
fun QueueSection(vm: AppViewModel, state: Persisted) {
    val c = Dcc.colors
    val held = state.queue.count { it.state == "HELD" }

    Column(Modifier.fillMaxSize()) {
        SectionHeader(
            title = "Queue",
            sub = {
                // No agent exists yet, so nothing can actually drain this queue.
                MetaText("NO PC AGENT CONNECTED — NOTHING CAN BE APPLIED YET", c.warn)
            },
        )

        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (state.queue.isEmpty()) item {
                DccCard { EmptyState("nothing waiting — every edit you make lands here first") }
            }
            items(state.queue, key = { it.id }) { q ->
                DccCard {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Kicker(q.type)
                            if (q.origin == "android") {
                                Spacer(Modifier.width(9.dp))
                                MetaText("FROM ANDROID", c.ink4, 9)
                            }
                            if (q.needsConfirm) {
                                Spacer(Modifier.width(9.dp))
                                MetaText("NEEDS CONFIRM", c.accent, 9)
                            }
                        }
                        StateTag(q.state)
                    }
                    Spacer(Modifier.height(5.dp))
                    RowTitle(q.title, c.ink, 15)
                    Spacer(Modifier.height(3.dp))
                    MetaText(q.detail, c.ink3, 10, maxLines = 3)
                    if (q.state == "HELD") {
                        Spacer(Modifier.height(9.dp))
                        DccButton("Discard", small = true) { vm.discard(q.id) }
                    }
                }
            }
            item {
                DccCard(background = c.bar) {
                    Kicker("Agent log")
                    Spacer(Modifier.height(8.dp))
                    state.log.asReversed().take(24).forEach { l ->
                        MetaText(
                            l.text,
                            when (l.kind) {
                                "good" -> c.good
                                "warn" -> c.warn
                                "bad" -> c.accent
                                else -> c.ink3
                            },
                            9,
                            maxLines = 2,
                        )
                    }
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }

        // Only the PC writes the save; the phone can still stage the transition.
        DccButton(
            if (state.gameRunning) "Waiting on the PC — $held held" else "Apply all ($held)",
            Modifier.fillMaxWidth(),
            if (held > 0 && !state.gameRunning) BtnStyle.PRIMARY else BtnStyle.SECONDARY,
            enabled = held > 0 && !state.gameRunning,
        ) { vm.applyAll() }
        Spacer(Modifier.height(6.dp))
        DccButton(
            if (state.gameRunning) "Mark game closed" else "Mark game running",
            Modifier.fillMaxWidth(),
        ) { vm.setGameRunning(!state.gameRunning) }
        Spacer(Modifier.height(8.dp))
    }
}
