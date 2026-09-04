package com.dcc.app.ui.sections

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import com.dcc.app.data.Rules
import com.dcc.app.data.Story
import com.dcc.app.state.AppViewModel
import com.dcc.app.state.Derived
import com.dcc.app.data.Persisted
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc

@Composable
fun WireSection(vm: AppViewModel, state: Persisted, d: Derived) {
    val c = Dcc.colors
    val stories = d.stories.sortedWith(compareByDescending<Story> { it.week }.thenByDescending { it.time })
    val critical = state.heat >= Rules.HEAT_THRESHOLD

    Column(Modifier.fillMaxSize()) {
        SectionHeader(
            title = "The Wire",
            sub = { MetaText("WEEK ${state.week} · ${d.userTeam.wins}–${d.userTeam.losses} · RANK ${d.userTeam.rank}") },
            right = { HeatMeter(state.heat, compact = true) },
        )

        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (critical) item {
                DccCard(borderColor = c.accent, background = c.heatBoxBg) {
                    Kicker("Critical — heat ${state.heat}")
                    Spacer(Modifier.height(5.dp))
                    BodySerif(
                        "Past the threshold. Compliance is looking at the program. The next mishandled " +
                            "contact triggers a portal-board event and a pending penalty.",
                    )
                }
            }

            items(stories, key = { it.id }) { s ->
                val dismissed = s.status == "dismissed"
                // The hero card inverts onto paper in Field Office; in Night
                // Wire it is an ordinary surface.
                val actionable = s.effect != null && s.status == "open"
                DccCard(
                    modifier = Modifier.alpha(if (dismissed) 0.45f else 1f),
                    background = if (actionable) c.heroBg else c.surface,
                ) {
                    val ink = if (actionable) c.heroInk else c.ink
                    val ink2 = if (actionable) c.heroInk2 else c.ink2

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Kicker(s.kicker)
                        MetaText("WK ${s.week} · ${s.time}", if (actionable) c.heroInk2 else c.ink3, 9)
                    }
                    Spacer(Modifier.height(6.dp))
                    Headline(s.headline, ink, 19)
                    Spacer(Modifier.height(7.dp))
                    BodySerif(s.body, ink2)

                    if (actionable) {
                        Spacer(Modifier.height(12.dp))
                        EffectCallout(s.effect!!.label)
                        Spacer(Modifier.height(11.dp))
                        // Primary actions sit at the bottom of the card, in reach.
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            DccButton("Approve", Modifier.weight(1f), BtnStyle.PRIMARY) {
                                vm.setStoryStatus(s.id, "approved")
                                vm.enqueue("STORY", s.headline, s.effect.label)
                            }
                            DccButton("Dismiss", Modifier.weight(1f)) {
                                vm.setStoryStatus(s.id, "dismissed")
                            }
                        }
                    }

                    when (s.status) {
                        "approved" -> {
                            Spacer(Modifier.height(11.dp))
                            MonoLabel("✓ APPROVED — IN QUEUE", c.good, 9)
                        }
                        "dismissed" -> {
                            Spacer(Modifier.height(11.dp))
                            MonoLabel("✕ DISMISSED", c.ink4, 9)
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}
