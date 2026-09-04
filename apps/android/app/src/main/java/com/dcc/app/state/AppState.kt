package com.dcc.app.state

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.dcc.app.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** A player or prospect with the user's pending and applied edits folded in. */
class Derived(private val dynasty: Dynasty, private val state: Persisted) {

    val players: List<Player> = dynasty.players.map { p ->
        state.playerOverrides[p.id]?.let { o ->
            p.copy(
                ovr = o.ovr ?: p.ovr,
                dev = o.dev ?: p.dev,
                year = o.year ?: p.year,
                pos = o.pos ?: p.pos,
                redshirt = o.redshirt ?: p.redshirt,
            )
        } ?: p
    }

    val prospects: List<Prospect> = dynasty.prospects.map { p ->
        state.prospectOverrides[p.id]?.let { o ->
            p.copy(
                stage = o.stage ?: p.stage,
                ovrRevealed = o.ovrRevealed ?: p.ovrRevealed,
                topSchools = o.topSchools ?: p.topSchools,
            )
        } ?: p
    }

    val playersById: Map<String, Player> = players.associateBy { it.id }
    val prospectsById: Map<String, Prospect> = prospects.associateBy { it.id }
    val teamsById: Map<String, Team> = dynasty.teams.associateBy { it.id }
    val userTeam: Team = teamsById.getValue(dynasty.meta.userTeamId)

    private val byTeam: Map<String, List<Player>> = players.groupBy { it.teamId }

    val stories: List<Story> = (state.extraStories + dynasty.stories)
        .map { it.copy(status = state.storyStatus[it.id] ?: it.status) }

    /** Anything unapplied shows a sync dot wherever the row appears. */
    val queuedPlayerIds: Set<String> = state.queue
        .filter { it.state == "HELD" && it.applyKind == "ovr" }
        .mapNotNull { it.applyPlayerId }.toSet()

    val queuedProspectIds: Set<String> = state.queue
        .filter { it.state == "HELD" && it.applyKind == "stage" }
        .mapNotNull { it.applyProspectId }.toSet()

    fun rosterOf(teamId: String): List<Player> =
        byTeam[teamId].orEmpty().sortedByDescending { it.ovr }

    fun depthOf(teamId: String, pos: String): List<Player> {
        val group = byTeam[teamId].orEmpty().filter { it.pos == pos }
        val order = state.depthOverrides["$teamId:$pos"] ?: return group.sortedByDescending { it.ovr }
        val rank = order.withIndex().associate { (i, id) -> id to i }
        return group.sortedWith(compareBy({ rank[it.id] ?: 999 }, { -it.ovr }))
    }

    fun boardProspects(): List<Prospect> = state.board.mapNotNull { prospectsById[it] }
}

class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val _dynasty = MutableStateFlow<Dynasty?>(null)
    val dynasty: StateFlow<Dynasty?> = _dynasty.asStateFlow()

    private val _state = MutableStateFlow(Persisted())
    val state: StateFlow<Persisted> = _state.asStateFlow()

    private val _derived = MutableStateFlow<Derived?>(null)
    val derived: StateFlow<Derived?> = _derived.asStateFlow()

    private var seq = 0

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    init {
        viewModelScope.launch {
            val saved = withContext(Dispatchers.IO) { Repository.loadState(getApplication()) }
            _state.value = saved
            // Nothing is shown until a dynasty has actually been brought in.
            if (saved.dynastySource != "none") {
                // 3,200 prospects is too much JSON for the main thread.
                val d = withContext(Dispatchers.IO) { Repository.loadDynasty(getApplication()) }
                _dynasty.value = d
                _derived.value = Derived(d, saved)
            }
            _loading.value = false
        }
    }

    /** Loads the bundled demo dynasty. Explicit, and clearly not the user's save. */
    fun loadSampleDynasty() {
        viewModelScope.launch {
            _loading.value = true
            val d = withContext(Dispatchers.IO) { Repository.loadDynasty(getApplication()) }
            val next = Repository.seed(d).copy(
                theme = _state.value.theme,
                relayUrl = _state.value.relayUrl,
                relayToken = _state.value.relayToken,
            )
            _dynasty.value = d
            _state.value = next
            _derived.value = Derived(d, next)
            withContext(Dispatchers.IO) { Repository.saveState(getApplication(), next) }
            _loading.value = false
        }
    }

    /** Drops whatever is loaded and returns the app to its empty state. */
    fun clearDynasty() {
        val next = Persisted(
            theme = _state.value.theme,
            relayUrl = _state.value.relayUrl,
            relayToken = _state.value.relayToken,
        )
        _dynasty.value = null
        _derived.value = null
        _state.value = next
        viewModelScope.launch(Dispatchers.IO) { Repository.saveState(getApplication(), next) }
    }

    fun setRelay(url: String, token: String) = update { it.copy(relayUrl = url, relayToken = token) }

    private fun update(persist: Boolean = true, block: (Persisted) -> Persisted) {
        val next = block(_state.value)
        _state.value = next
        _dynasty.value?.let { _derived.value = Derived(it, next) }
        if (persist) viewModelScope.launch(Dispatchers.IO) {
            Repository.saveState(getApplication(), next)
        }
    }

    private fun nextId(): String = "q${System.currentTimeMillis().toString(36)}${(seq++).toString(36)}"

    private fun Persisted.log(text: String, kind: String = "info") =
        (log + LogLine(System.currentTimeMillis(), text, kind)).takeLast(200)

    // ── actions ──────────────────────────────────────────────────────────────

    fun setTheme(theme: String) = update { it.copy(theme = theme) }

    fun setWeek(week: Int) = update { it.copy(week = week.coerceIn(1, 15)) }

    fun addHeat(delta: Int) = update { it.copy(heat = (it.heat + delta).coerceIn(0, 100)) }

    fun setStoryStatus(id: String, status: String) =
        update { it.copy(storyStatus = it.storyStatus + (id to status)) }

    fun enqueue(
        type: String,
        title: String,
        detail: String,
        needsConfirm: Boolean = false,
        applyKind: String = "noop",
        applyPlayerId: String? = null,
        applyOvr: Int? = null,
        applyProspectId: String? = null,
        applyStage: String? = null,
        applyTeamId: String? = null,
        applyPos: String? = null,
        applyOrder: List<String> = emptyList(),
    ) = update {
        val item = QueueItem(
            id = nextId(), type = type, title = title, detail = detail,
            at = System.currentTimeMillis(), needsConfirm = needsConfirm,
            applyKind = applyKind, applyPlayerId = applyPlayerId, applyOvr = applyOvr,
            applyProspectId = applyProspectId, applyStage = applyStage,
            applyTeamId = applyTeamId, applyPos = applyPos, applyOrder = applyOrder,
        )
        it.copy(
            queue = listOf(item) + it.queue,
            log = it.log("queued ${type.lowercase()} — $title", "warn"),
        )
    }

    fun discard(id: String) = update { it.copy(queue = it.queue.filterNot { q -> q.id == id }) }

    /**
     * Only the PC agent drains the queue for real. On the phone this is the same
     * transition so the two apps stay legible to each other.
     */
    fun applyAll() = update { s ->
        val held = s.queue.filter { it.state == "HELD" && !it.needsConfirm }
        if (held.isEmpty()) return@update s

        val players = s.playerOverrides.toMutableMap()
        val prospects = s.prospectOverrides.toMutableMap()
        val depth = s.depthOverrides.toMutableMap()
        for (item in held) when (item.applyKind) {
            "ovr" -> item.applyPlayerId?.let { id ->
                players[id] = (players[id] ?: PlayerPatch()).copy(ovr = item.applyOvr)
            }
            "stage" -> item.applyProspectId?.let { id ->
                prospects[id] = (prospects[id] ?: ProspectPatch()).copy(stage = item.applyStage)
            }
            "depth" -> if (item.applyTeamId != null && item.applyPos != null) {
                depth["${item.applyTeamId}:${item.applyPos}"] = item.applyOrder
            }
        }

        val heldIds = held.map { it.id }.toSet()
        val now = System.currentTimeMillis()
        s.copy(
            gameRunning = false,
            playerOverrides = players,
            prospectOverrides = prospects,
            depthOverrides = depth,
            queue = s.queue.map { if (it.id in heldIds) it.copy(state = "APPLIED") else it },
            log = (s.log +
                LogLine(now, "backup written — restore point", "good") +
                held.map { LogLine(now, "applied ${it.type.lowercase()} — ${it.title}", "good") } +
                LogLine(now, "${held.size} item(s) applied · queue clear", "good")
                ).takeLast(200),
        )
    }

    fun setGameRunning(running: Boolean) = update {
        it.copy(
            gameRunning = running,
            log = it.log(
                if (running) "game launched — save locked, writes held" else "game closed — save unlocked",
                if (running) "warn" else "good",
            ),
        )
    }

    fun toggleBoard(id: String) = update {
        it.copy(board = if (id in it.board) it.board - id else listOf(id) + it.board)
    }

    fun patchPlayer(id: String, patch: PlayerPatch) = update {
        val prev = it.playerOverrides[id] ?: PlayerPatch()
        it.copy(
            playerOverrides = it.playerOverrides + (id to PlayerPatch(
                ovr = patch.ovr ?: prev.ovr,
                dev = patch.dev ?: prev.dev,
                year = patch.year ?: prev.year,
                pos = patch.pos ?: prev.pos,
                redshirt = patch.redshirt ?: prev.redshirt,
            )),
        )
    }

    fun patchProspect(id: String, patch: ProspectPatch) = update {
        val prev = it.prospectOverrides[id] ?: ProspectPatch()
        it.copy(
            prospectOverrides = it.prospectOverrides + (id to ProspectPatch(
                stage = patch.stage ?: prev.stage,
                ovrRevealed = patch.ovrRevealed ?: prev.ovrRevealed,
                topSchools = patch.topSchools ?: prev.topSchools,
            )),
        )
    }

    fun setDepth(teamId: String, pos: String, order: List<String>) = update {
        it.copy(depthOverrides = it.depthOverrides + ("$teamId:$pos" to order))
    }

    fun setConvo(convo: Convo) = update { it.copy(convos = it.convos + (convo.playerId to convo)) }

    fun setLease(holder: String) = update {
        it.copy(leaseHolder = holder, log = it.log("save lease → $holder", "warn"))
    }

    fun addStory(story: Story) = update {
        it.copy(extraStories = listOf(story) + it.extraStories, log = it.log("story posted — ${story.headline}", "good"))
    }

    fun reset() {
        val d = _dynasty.value ?: return clearDynasty()
        Repository.clearState(getApplication())
        update { Repository.seed(d).copy(theme = _state.value.theme) }
    }
}
