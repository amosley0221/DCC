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
 * The schools worth showing on his row: the one he picked, or the three still
 * in it.
 *
 * A hard commit or a signature settles it, so showing the field there would be
 * noise — the interest numbers behind a committed recruit are last week's race.
 * A soft commit is not settled, so it keeps all three: that is exactly the
 * recruit worth looking at twice.
 */
private fun SnapshotRecruit.leaders(): List<String> {
    val ranked = topSchools.filter { it.school.isNotEmpty() }.sortedByDescending { it.interest }
    if (ranked.isEmpty()) return emptyList()
    return when (stage) {
        "HardCommitted", "Signed" -> listOf(ranked.first().school)
        else -> ranked.take(3).map { it.school }
    }
}

/** One change the phone wants made to a recruit, as the queue will carry it. */
data class QueuedEdit(
    val overall: Int? = null,
    val stars: Int? = null,
    val dev: String? = null,
    val dealbreaker: String? = null,
    val pitch: String? = null,
    val ratings: Map<String, Int> = emptyMap(),
)

/** Where a recruit is coming from, in the game's own words rather than the roster's. */
private val CLASS_WORD = mapOf(
    "HighSchool" to "High school",
    "JuniorCollege_Sophomore" to "JUCO sophomore",
    "JuniorCollege_Junior" to "JUCO junior",
    "JuniorCollege_Senior" to "JUCO senior",
)

/** The game's own words for how far along a recruitment is. */
/** The stages, in the order a recruitment moves through them. */
private val STAGE_ORDER = listOf(
    "Top10", "Top5", "Top3", "Battle", "SoftCommitted", "HardCommitted", "Signed",
)

private val STAGE_LABEL = mapOf(
    "Top10" to "TOP 10", "Top5" to "TOP 5", "Top3" to "TOP 3", "Battle" to "BATTLE",
    "SoftCommitted" to "SOFT COMMIT", "HardCommitted" to "COMMITTED", "Signed" to "SIGNED",
)

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
                    onToggle = { expanded = if (expanded == r.index) null else r.index },
                    onStage = { stage ->
                        vm.enqueue(
                            type = "RECRUIT",
                            title = r.name,
                            detail = "commitment stage to ${STAGE_LABEL[stage] ?: stage}",
                            applyKind = "stage",
                            applyProspectId = r.playerId.toString(),
                            applyStage = stage,
                            applyIndex = r.index,
                        )
                    },
                    onEdit = { e ->
                        vm.enqueue(
                            type = "PLAYER",
                            title = r.name,
                            detail = listOfNotNull(
                                e.overall?.let { "overall to $it" },
                                e.stars?.let { "$it stars" },
                                e.dev?.let { "dev trait to $it" },
                                e.dealbreaker?.let { "dealbreaker to $it" },
                                e.pitch?.let { "responds to $it" },
                                e.ratings.entries.firstOrNull()?.let { (k, v) -> "$k to $v" },
                            ).joinToString(", "),
                            applyKind = "player",
                            applyPlayerId = r.playerId.toString(),
                            applyIndex = r.index,
                            applyOvr = e.overall,
                            applyStars = e.stars,
                            applyDev = e.dev,
                            applyDealbreaker = e.dealbreaker,
                            applyPitch = e.pitch,
                            applyRatings = e.ratings,
                        )
                    },
                )
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
    onStage: (String) -> Unit,
    onEdit: (QueuedEdit) -> Unit,
) {
    val c = Dcc.colors
    DccCard(onClick = onToggle) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            PlayerFace(r.name, r.assetId, 30.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                RowTitle(r.name, c.ink, 15)
                Spacer(Modifier.height(2.dp))
                MetaText(
                    listOfNotNull(
                        r.nationalRank?.let { "NO. $it" },
                        r.position,
                        r.stage?.let { STAGE_LABEL[it] ?: it },
                        listOfNotNull(r.hometown.ifEmpty { null }, r.state).joinToString(", ").ifEmpty { null },
                        r.pipeline?.let { "$it PIPELINE" },
                    ).joinToString(" · "),
                    c.ink3, 9, maxLines = 1,
                )
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                r.stars?.takeIf { it in 1..5 }?.let { StarRow(it, 9) }
                Spacer(Modifier.height(3.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // The overall sits inside the crests rather than outside
                    // them, so the last crest ends flush with the stars above
                    // however many schools are still in it.
                    if (revealed) {
                        NumText(
                            "${r.overall}",
                            if (r.overall >= 85) c.ink else c.ink2,
                            13, FontWeight.SemiBold,
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    // Once he is committed the race is over, so the row says who
                    // got him rather than who else was asking.
                    r.leaders().forEachIndexed { i, s ->
                        if (i > 0) Spacer(Modifier.width(4.dp))
                        SchoolBadge(s.take(2).uppercase(), s, isUser = false, size = 17.dp)
                    }
                }
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
                    r.recruitClass?.let { CLASS_WORD[it] ?: it } ?: SaveLabels.year(r.year),
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
            // Who is recruiting him, and how hard. The interest number means
            // nothing alone — what matters is who leads and by how much — so it
            // reads against the leader rather than as a bare figure.
            if (r.topSchools.isNotEmpty()) {
                Spacer(Modifier.height(11.dp))
                MonoLabel("WHO IS RECRUITING HIM", c.ink3, 9)
                Spacer(Modifier.height(6.dp))
                val top = r.topSchools.maxOf { it.interest }.coerceAtLeast(1)
                r.topSchools.forEach { s ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        SchoolBadge(s.school.take(2).uppercase(), s.school, isUser = false, size = 14.dp)
                        Spacer(Modifier.width(7.dp))
                        MetaText(s.school, c.ink2, 10, Modifier.weight(1f), maxLines = 1)
                        Box(Modifier.width(70.dp)) {
                            DccTrack(
                                (s.interest * 100 / top).coerceIn(0, 100),
                                color = if (s.interest == top) c.accent else c.ink4,
                            )
                        }
                        Spacer(Modifier.width(7.dp))
                        NumText("${s.interest}", c.ink3, 10)
                    }
                }
            }
            if (revealed) {
                Spacer(Modifier.height(11.dp))
                MonoLabel("CHANGE HIM", c.ink3, 9)
                Spacer(Modifier.height(6.dp))
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    (1..5).forEach { n ->
                        DccChip("$n★", r.stars == n) { onEdit(QueuedEdit(stars = n)) }
                        Spacer(Modifier.width(6.dp))
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    SaveLabels.DEV_TRAITS.forEach { t ->
                        DccChip(t, r.dev == t) { onEdit(QueuedEdit(dev = t)) }
                        Spacer(Modifier.width(6.dp))
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    listOf(-5, -1, 1, 5).forEach { d ->
                        DccChip(if (d > 0) "OVR +$d" else "OVR $d", false) {
                            onEdit(QueuedEdit(overall = (r.overall + d).coerceIn(0, 99)))
                        }
                        Spacer(Modifier.width(6.dp))
                    }
                }
                Spacer(Modifier.height(6.dp))
                MetaText("DEALBREAKER", c.ink4, 9)
                Spacer(Modifier.height(4.dp))
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    SaveLabels.DEALBREAKERS.forEach { t ->
                        DccChip(t, r.dealbreaker == t) { onEdit(QueuedEdit(dealbreaker = t)) }
                        Spacer(Modifier.width(6.dp))
                    }
                }
                Spacer(Modifier.height(6.dp))
                MetaText("RESPONDS TO", c.ink4, 9)
                Spacer(Modifier.height(4.dp))
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    SaveLabels.IDEAL_PITCHES.forEach { t ->
                        DccChip(t, r.idealPitch == t) { onEdit(QueuedEdit(pitch = t)) }
                        Spacer(Modifier.width(6.dp))
                    }
                }
                Spacer(Modifier.height(5.dp))
                MetaText("EACH TAP QUEUES A WRITE FOR THE WINDOWS APP", c.ink4, 9)
            }

            // Changing a recruitment is a save write, and the phone does not do
            // those — it queues the ask and the Windows app makes the change.
            if (r.stage != null) {
                Spacer(Modifier.height(11.dp))
                MonoLabel("COMMITMENT STAGE", c.ink3, 9)
                Spacer(Modifier.height(6.dp))
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    STAGE_ORDER.forEach { stage ->
                        DccChip(STAGE_LABEL[stage] ?: stage, stage == r.stage) { onStage(stage) }
                        Spacer(Modifier.width(6.dp))
                    }
                }
                Spacer(Modifier.height(5.dp))
                MetaText("QUEUES A WRITE FOR THE WINDOWS APP — NOTHING CHANGES ON THE PHONE", c.ink4, 9)
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
                            DccChip("−", false) {
                                onEdit(QueuedEdit(ratings = mapOf(label to (value - 1).coerceIn(0, 99))))
                            }
                            Spacer(Modifier.width(4.dp))
                            DccChip("+", false) {
                                onEdit(QueuedEdit(ratings = mapOf(label to (value + 1).coerceIn(0, 99))))
                            }
                            Spacer(Modifier.width(6.dp))
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
