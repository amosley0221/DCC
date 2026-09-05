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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dcc.app.data.Persisted
import com.dcc.app.data.SaveLabels
import com.dcc.app.data.SnapshotRecruit
import com.dcc.app.data.name
import com.dcc.app.state.AppViewModel
import com.dcc.app.state.SnapshotView
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc

/**
 * The recruiting pool as the save has it — ten thousand names, so the filters
 * are the screen.
 *
 * The game keeps a recruit's overall and ratings hidden until he has been
 * scouted, and the dynasty is built on that, so both sit behind the same wall
 * here. Everything the game shows before a recruit is scouted — stars, position,
 * hometown, pipeline, archetype, size, NIL, dealbreaker and pitch — is on the
 * row as it always was.
 *
 * Both orders the pool can be shown in arrive already sorted, and filtering only
 * ever drops rows from one of them, so nothing is re-sorted while the user types
 * or scouts.
 */
@Composable
fun RecruitSnapshotSection(vm: AppViewModel, state: Persisted, view: SnapshotView) {
    val c = Dcc.colors
    var query by rememberSaveable { mutableStateOf("") }
    var starFilter by rememberSaveable { mutableStateOf<Int?>(null) }
    var posFilter by rememberSaveable { mutableStateOf<String?>(null) }
    var expanded by rememberSaveable { mutableStateOf<Int?>(null) }

    val revealed = remember(state.revealedRecruits) { state.revealedRecruits.toSet() }

    // Scouting one recruit changes neither the filter nor the order, so the list
    // is keyed on the global switch alone — a reveal touches the row it is on and
    // nothing else.
    val shown = remember(view, query, starFilter, posFilter, state.revealAllRecruits) {
        val q = query.trim().lowercase()
        val pool = if (state.revealAllRecruits) view.recruits else view.recruitsByName
        pool.filter { r ->
            (starFilter == null || r.stars == starFilter) &&
                (posFilter == null || r.position == posFilter) &&
                (q.isEmpty() || r.name.lowercase().contains(q))
        }
    }

    Column(Modifier.fillMaxSize()) {
        SectionHeader(
            title = "Recruit",
            sub = { MetaText("${view.recruits.size} IN THE POOL · FROM YOUR SAVE") },
        )

        DccField(query, "SEARCH NAME") { query = it }
        Spacer(Modifier.height(8.dp))
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DccChip(
                if (state.revealAllRecruits) "OVERALLS SHOWN" else "OVERALLS HIDDEN",
                state.revealAllRecruits, accent = true,
            ) { vm.setRevealAllRecruits(!state.revealAllRecruits) }
            if (!state.revealAllRecruits && revealed.isNotEmpty()) {
                MetaText("${revealed.size} SCOUTED", c.ink4, 9)
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            listOf(5, 4, 3, 2, 1).forEach { s ->
                DccChip("$s★", starFilter == s) { starFilter = if (starFilter == s) null else s }
            }
        }
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            view.recruitPositions.forEach { p ->
                DccChip(p, posFilter == p) { posFilter = if (posFilter == p) null else p }
            }
        }
        Spacer(Modifier.height(8.dp))
        MetaText("${shown.size} SHOWN OF ${view.recruits.size}", c.ink4, 9)
        Spacer(Modifier.height(8.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (shown.isEmpty()) item { DccCard { EmptyState("no recruit matches that") } }
            items(shown, key = { it.index }) { r ->
                RecruitRow(
                    r,
                    expanded == r.index,
                    state.revealAllRecruits || r.playerId in revealed,
                    onScout = { vm.toggleRecruitReveal(r.playerId) },
                ) {
                    expanded = if (expanded == r.index) null else r.index
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun RecruitRow(
    r: SnapshotRecruit,
    open: Boolean,
    revealed: Boolean,
    onScout: () -> Unit,
    onToggle: () -> Unit,
) {
    val c = Dcc.colors
    DccCard(onClick = onToggle) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Portrait(r.name, 30.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                RowTitle(r.name, c.ink, 15)
                Spacer(Modifier.height(2.dp))
                MetaText(
                    listOfNotNull(
                        r.position,
                        listOfNotNull(r.hometown.ifEmpty { null }, r.state).joinToString(", ").ifEmpty { null },
                        r.pipeline?.let { "$it PIPELINE" },
                    ).joinToString(" · "),
                    c.ink3, 9, maxLines = 1,
                )
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                r.stars?.takeIf { it in 1..5 }?.let { StarRow(it, 9) }
                Spacer(Modifier.height(2.dp))
                // An unscouted overall keeps its slot rather than leaving one, so
                // the rows do not shift under the thumb as they are revealed.
                NumText(
                    if (revealed) "${r.overall}" else "––",
                    when {
                        !revealed -> c.ink4
                        r.overall >= 85 -> c.ink
                        else -> c.ink2
                    },
                    13, FontWeight.SemiBold,
                )
            }
        }

        if (open) {
            Spacer(Modifier.height(11.dp))
            MetaText(
                listOfNotNull(
                    r.archetype,
                    r.dev,
                    SaveLabels.height(r.heightIn).ifEmpty { null },
                    r.weightLb?.let { "$it lb" },
                    r.nilK?.takeIf { it > 0 }?.let { "NIL \$${it}K" },
                    SaveLabels.year(r.year),
                ).joinToString(" · "),
                c.ink3, 10, maxLines = 3,
            )
            // What he wants and how he wants to hear it — the two fields that
            // decide how a pitch lands.
            if (r.dealbreaker != null || r.idealPitch != null) {
                Spacer(Modifier.height(9.dp))
                EffectCallout(
                    listOfNotNull(
                        r.dealbreaker?.let { "Dealbreaker: $it" },
                        r.idealPitch?.let { "Responds to: $it" },
                    ).joinToString("  ·  "),
                )
            }
            if (revealed) {
                Spacer(Modifier.height(11.dp))
                // Recruit ratings only arrived with a later desktop build, so an
                // older snapshot has none. The save has always held them, and
                // saying where they are beats an empty block.
                if (r.ratings.isEmpty()) {
                    MetaText(
                        "RATINGS COME WITH A NEWER SNAPSHOT — EXPORT IT AGAIN FROM THE DESKTOP",
                        c.ink4, 9, maxLines = 2,
                    )
                } else {
                    MonoLabel("RATINGS", c.ink3, 9)
                    Spacer(Modifier.height(6.dp))
                    // Strongest first, the way the roster rows read.
                    r.ratings.entries.sortedByDescending { it.value }.forEach { (label, value) ->
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
                Spacer(Modifier.height(10.dp))
                DccButton("Hide again", small = true, onClick = onScout)
            } else {
                Spacer(Modifier.height(10.dp))
                DccButton("Scout ${r.name}", small = true, onClick = onScout)
                Spacer(Modifier.height(6.dp))
                MetaText(
                    "His overall and ratings are in the snapshot already — scouting him " +
                        "only decides whether they are on screen.",
                    c.ink4, 9, maxLines = 3,
                )
            }
        }
    }
}
