package com.dcc.app.ui.sections

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dcc.app.data.*
import com.dcc.app.state.AppViewModel
import com.dcc.app.state.Derived
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc
import kotlinx.coroutines.delay

@Composable
fun TamperSection(
    vm: AppViewModel,
    dynasty: Dynasty,
    state: Persisted,
    d: Derived,
    openTarget: String?,
    onOpenTarget: (String?) -> Unit,
) {
    val c = Dcc.colors
    val locked = state.week < Rules.TAMPER_OPENS_WEEK
    var query by rememberSaveable { mutableStateOf("") }
    var teamFilter by rememberSaveable { mutableStateOf<String?>(null) }

    val player = openTarget?.let { d.playersById[it] }
    if (player != null) {
        CallScreen(vm, state, d, player, locked) { onOpenTarget(null) }
        return
    }

    val targets = remember(query, teamFilter, d) {
        d.players.asSequence()
            .filter { it.teamId != dynasty.meta.userTeamId }
            .filter { teamFilter == null || it.teamId == teamFilter }
            .filter { query.isBlank() || it.name.contains(query, ignoreCase = true) }
            .sortedByDescending { it.ovr }
            .take(80)
            .toList()
    }

    Column(Modifier.fillMaxSize()) {
        SectionHeader(
            title = "Tamper",
            sub = {
                if (locked) MetaText(
                    "TAMPERING OPENS WEEK ${Rules.TAMPER_OPENS_WEEK} — " +
                        "${Rules.TAMPER_OPENS_WEEK - state.week} WEEK(S) OUT",
                    c.warn,
                ) else MetaText("CONTACT IS LOGGED AND CARRIES REAL HEAT", c.accent)
            },
        )

        if (locked) {
            DccCard(borderColor = c.warn) {
                Kicker("Window closed", c.warn)
                Spacer(Modifier.height(6.dp))
                BodySerif(
                    "Contact is locked until regular-season week ${Rules.TAMPER_OPENS_WEEK}. Build the " +
                        "target list now — nothing sends until the window opens.",
                )
                Spacer(Modifier.height(11.dp))
                DccTrack(state.week, Rules.TAMPER_OPENS_WEEK, color = c.warn, height = 5.dp)
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MetaText("WEEK", c.ink3, 9)
                    Stepper(state.week, 1, 15) { vm.setWeek(it) }
                }
            }
            Spacer(Modifier.height(12.dp))
        }

        DccField(query, "SEARCH TARGETS") { query = it }
        Spacer(Modifier.height(8.dp))
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            DccChip("All teams", teamFilter == null) { teamFilter = null }
            dynasty.teams.filter { !it.isUser }.forEach { t ->
                DccChip(t.abbr, teamFilter == t.id) { teamFilter = if (teamFilter == t.id) null else t.id }
            }
        }
        Spacer(Modifier.height(10.dp))

        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(targets, key = { it.id }) { p ->
                val convo = state.convos[p.id]
                DccCard(onClick = { onOpenTarget(p.id) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        NumText("${p.ovr}", if (p.ovr >= 90) c.ink else c.ink2, 15, FontWeight.SemiBold, Modifier.width(34.dp))
                        Portrait(p.name, 30.dp)
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            RowTitle(p.name, c.ink, 15)
                            Spacer(Modifier.height(2.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                d.teamsById[p.teamId]?.let { t -> SchoolBadge(t.monogram, t.name, t.isUser, 14.dp) }
                                Spacer(Modifier.width(6.dp))
                                // Buried players are the receptive ones.
                                MetaText("${p.pos}#${p.depth}", if (p.depth > 1) c.warn else c.ink3, 9)
                            }
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            NumText(convo?.interest?.toString() ?: "—", if (convo != null) c.ink else c.ink4, 13)
                            Spacer(Modifier.height(2.dp))
                            MonoLabel(
                                when {
                                    convo?.status == "burned" -> "BURNED"
                                    convo != null -> "OPEN"
                                    else -> "✆ TEXT"
                                },
                                when {
                                    convo?.status == "burned" -> c.ink4
                                    convo != null -> c.ink2
                                    else -> c.accent
                                },
                                9,
                            )
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun CallScreen(
    vm: AppViewModel,
    state: Persisted,
    d: Derived,
    player: Player,
    locked: Boolean,
    onBack: () -> Unit,
) {
    val c = Dcc.colors
    val convo = state.convos[player.id] ?: Convo(playerId = player.id, nilOffer = player.nil)
    var draft by rememberSaveable { mutableStateOf("") }
    var pending by remember { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()

    // The relay's model writes the reply in a wired-up install; scoring the
    // exchange locally keeps the section usable with the server off.
    LaunchedEffect(pending) {
        val text = pending ?: return@LaunchedEffect
        delay(700)
        val res = Rules.scoreExchange(player, convo, text)
        vm.setConvo(
            convo.copy(
                contacted = true,
                interest = (convo.interest + res.interestDelta).coerceIn(0, 100),
                status = if (res.burned) "burned" else convo.status,
                messages = convo.messages +
                    ChatMessage("them", res.reply, System.currentTimeMillis()) +
                    ChatMessage("system", res.note, System.currentTimeMillis()),
            ),
        )
        vm.addHeat(res.heatDelta)
        if (res.burned) {
            vm.addStory(
                Story(
                    id = "compliance-${player.id}",
                    kicker = "Compliance",
                    week = state.week,
                    time = "--:--",
                    headline = "${player.name} reported contact from your staff",
                    body = "The ${d.teamsById[player.teamId]?.name} ${player.pos} turned over his messages. " +
                        "A pending penalty is attached until the program responds.",
                    effect = StoryEffect("Program +${Rules.BURNED_HEAT} Heat · pending penalty"),
                ),
            )
        }
        pending = null
    }

    LaunchedEffect(convo.messages.size) {
        if (convo.messages.isNotEmpty()) listState.animateScrollToItem(convo.messages.size - 1)
    }

    fun send(text: String) {
        if (text.isBlank() || locked || convo.status != "open" || pending != null) return
        vm.setConvo(convo.copy(messages = convo.messages + ChatMessage("me", text, System.currentTimeMillis())))
        draft = ""
        pending = text
    }

    val (standingText, standingTone) = Rules.standing(convo.interest)
    val (moneyText, moneyTone) = Rules.nilVerdict(convo.nilOffer, player.nil)

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            DccButton("← Targets", small = true) { onBack() }
            Spacer(Modifier.weight(1f))
            HeatMeter(state.heat, compact = true)
        }

        DccCard {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Portrait(player.name, 52.dp)
                Spacer(Modifier.width(11.dp))
                Column(Modifier.weight(1f)) {
                    Headline(player.name, c.ink, 19)
                    Spacer(Modifier.height(3.dp))
                    MetaText(
                        "${player.pos}#${player.depth} · ${d.teamsById[player.teamId]?.name} · ${player.ovr} OVR",
                        c.ink3, 9.5.toInt(),
                    )
                }
                StagePill(standingText, toneColor(standingTone))
            }
            Spacer(Modifier.height(11.dp))
            EffectCallout("DEALBREAKER · ${player.dealbreaker.uppercase()}")
            Spacer(Modifier.height(11.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                MetaText("INTEREST", c.ink3, 9)
                NumText(
                    "${convo.interest}",
                    when {
                        convo.interest >= 70 -> c.good
                        convo.interest >= 35 -> c.warn
                        else -> c.ink3
                    },
                    13, FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(4.dp))
            DccTrack(
                convo.interest,
                color = when {
                    convo.interest >= 70 -> c.good
                    convo.interest >= 35 -> c.warn
                    else -> c.ink4
                },
            )
        }

        Spacer(Modifier.height(10.dp))

        DccCard {
            Kicker("The offer")
            Spacer(Modifier.height(9.dp))
            MetaText("ROLE PROMISE", c.ink3, 9)
            Spacer(Modifier.height(6.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Rules.ROLES.forEach { r ->
                    DccChip(r, convo.role == r, accent = true) { vm.setConvo(convo.copy(role = r)) }
                }
            }
            Spacer(Modifier.height(10.dp))
            MetaText("PROMISES", c.ink3, 9)
            Spacer(Modifier.height(6.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Rules.PROMISES.forEach { p ->
                    DccChip(p, p in convo.promises) {
                        vm.setConvo(
                            convo.copy(
                                promises = if (p in convo.promises) convo.promises - p else convo.promises + p,
                            ),
                        )
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    MetaText("NIL — HIS NUMBER IS ${player.nil}", c.ink3, 9)
                    Spacer(Modifier.height(2.dp))
                    MonoLabel(moneyText, toneColor(moneyTone), 10)
                }
                Stepper(convo.nilOffer, 0, 400_000, 2_500) { vm.setConvo(convo.copy(nilOffer = it)) }
            }
            Spacer(Modifier.height(6.dp))
            DccTrack(convo.nilOffer, maxOf(player.nil * 2, 1), color = toneColor(moneyTone))
        }

        Spacer(Modifier.height(10.dp))

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (convo.messages.isEmpty()) item { EmptyState("no messages yet") }
            items(convo.messages.size) { i ->
                val m = convo.messages[i]
                when (m.from) {
                    "system" -> MetaText(m.text, c.ink4, 9, Modifier.fillMaxWidth(), maxLines = 3)
                    "me" -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        Bubble(m.text, true)
                    }
                    else -> Row(Modifier.fillMaxWidth()) { Bubble(m.text, false) }
                }
            }
            if (pending != null) item { MetaText("SCORING YOUR CALL…", c.warn, 9) }
            item { Spacer(Modifier.height(8.dp)) }
        }

        if (convo.status == "burned") {
            MonoLabel("HE REPORTED THE CONTACT — THIS LINE IS DEAD", c.accent, 10)
        } else {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Rules.TALKING_POINTS.forEach { t -> DccChip(t) { send(t) } }
            }
            Spacer(Modifier.height(8.dp))
            // Composer sits at the bottom, in thumb reach.
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DccField(
                    draft,
                    if (locked) "LOCKED UNTIL WEEK ${Rules.TAMPER_OPENS_WEEK}" else "SAY SOMETHING",
                    Modifier.weight(1f),
                    enabled = !locked && pending == null,
                ) { draft = it }
                DccButton(
                    "Send", style = BtnStyle.PRIMARY,
                    enabled = !locked && pending == null && draft.isNotBlank(),
                ) { send(draft) }
            }
            if (convo.interest >= Rules.PLEDGE_INTEREST && convo.status == "open") {
                Spacer(Modifier.height(8.dp))
                DccButton("Get the pledge — queue portal commitment", Modifier.fillMaxWidth(), BtnStyle.ACCENT) {
                    vm.setConvo(convo.copy(status = "pledged"))
                    vm.enqueue(
                        "PORTAL", "${player.name} — portal commitment",
                        "${convo.role} · NIL ${convo.nilOffer} · from ${d.teamsById[player.teamId]?.name}",
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun Bubble(text: String, mine: Boolean) {
    val c = Dcc.colors
    val r = Dcc.shapes.bubble
    val shape = if (mine) RoundedCornerShape(r, r, 4.dp, r) else RoundedCornerShape(r, r, r, 4.dp)
    Box(
        Modifier
            .fillMaxWidth(0.78f)
            .clip(shape)
            .background(if (mine) c.btnBg else c.surface)
            .padding(horizontal = 12.dp, vertical = 9.dp),
    ) {
        Text(
            text,
            style = TextStyle(
                fontFamily = Dcc.fonts.sans,
                fontSize = 13.5.sp,
                lineHeight = 20.sp,
                color = if (mine) c.btnInk else c.ink2,
            ),
        )
    }
}
