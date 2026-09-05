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
import com.dcc.app.data.SaveLabels
import com.dcc.app.data.SnapshotRecruit
import com.dcc.app.data.name
import com.dcc.app.state.SnapshotView
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc

/**
 * The recruiting pool as the save has it — ten thousand names, so the filters
 * are the screen.
 *
 * The pool arrives already sorted by stars and overall, and filtering only ever
 * drops rows from that order, so nothing is re-sorted while the user types.
 */
@Composable
fun RecruitSnapshotSection(view: SnapshotView) {
    val c = Dcc.colors
    var query by rememberSaveable { mutableStateOf("") }
    var starFilter by rememberSaveable { mutableStateOf<Int?>(null) }
    var posFilter by rememberSaveable { mutableStateOf<String?>(null) }
    var expanded by rememberSaveable { mutableStateOf<Int?>(null) }

    val shown = remember(view, query, starFilter, posFilter) {
        val q = query.trim().lowercase()
        view.recruits.filter { r ->
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
                RecruitRow(r, expanded == r.index) {
                    expanded = if (expanded == r.index) null else r.index
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun RecruitRow(r: SnapshotRecruit, open: Boolean, onToggle: () -> Unit) {
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
                NumText("${r.overall}", if (r.overall >= 85) c.ink else c.ink2, 13, FontWeight.SemiBold)
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
        }
    }
}
