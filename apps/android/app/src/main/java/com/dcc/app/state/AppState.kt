package com.dcc.app.state

import android.app.Application
import android.net.Uri
import java.io.File
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

/**
 * The imported snapshot with every join and sort the screens need already done.
 *
 * A snapshot is five thousand players, eleven thousand recruits and nine
 * hundred games, so none of this can happen while a list scrolls. It is built
 * once, on the IO thread that parsed the file, and the screens only read it.
 */
class SnapshotView(val snapshot: DynastySnapshot) {

    val meta: SnapshotMeta = snapshot.meta

    /** Best record first, which is the nearest thing the save has to a ranking. */
    val teams: List<SnapshotTeam> = snapshot.teams
        .sortedWith(compareByDescending<SnapshotTeam> { it.wins }.thenBy { it.losses }.thenBy { it.name })

    val teamsByIndex: Map<Int, SnapshotTeam> = snapshot.teams.associateBy { it.index }

    // The team table and the team ids players carry are two different
    // orderings, so a screen holding one has to be able to reach the other.
    private val indexByTeamId: Map<Int, Int> =
        snapshot.teams.mapNotNull { t -> t.teamId?.let { it to t.index } }.toMap()

    val userTeam: SnapshotTeam? = meta.userTeamIndex?.let { teamsByIndex[it] }
        ?: meta.userTeamId?.let { id -> indexByTeamId[id]?.let { teamsByIndex[it] } }

    /**
     * Every rostered player by their row in the save, so anything holding an
     * index — the Heisman shortlist, most of all — can find the player it is
     * naming rather than showing his initials.
     */
    val playerByIndex: Map<Int, SnapshotPlayer> = snapshot.players.associateBy { it.index }

    private val rosters: Map<Int, List<SnapshotPlayer>> = snapshot.players
        .groupBy { it.team }
        .mapValues { (_, list) -> list.sortedByDescending { it.overall } }

    private val schedules: Map<Int, List<SnapshotGame>> = buildMap<Int, MutableList<SnapshotGame>> {
        for (g in snapshot.games) {
            if (g.homeIndex >= 0) getOrPut(g.homeIndex) { mutableListOf() }.add(g)
            if (g.awayIndex >= 0 && g.awayIndex != g.homeIndex) {
                getOrPut(g.awayIndex) { mutableListOf() }.add(g)
            }
        }
    }.mapValues { (_, list) -> list.sortedWith(compareBy({ it.postseason }, { it.week }, { it.row })) }

    private val byWeek: Map<Int, List<SnapshotGame>> = snapshot.games
        .filterNot { it.postseason }
        .groupBy { it.week }
        .mapValues { (_, list) -> list.sortedBy { it.row } }

    val weeks: List<Int> = byWeek.keys.sorted()

    /**
     * The first week the user has not played. The game simulates the rest of
     * the country before the user's own game and keeps those scores out of
     * sight until it is played, so everything from here on is a spoiler.
     */
    val holdFrom: Int = meta.currentWeek ?: Int.MAX_VALUE

    /**
     * The game's own order where the save gives it: national rank, which the
     * game puts on its own board. Prospects with no record fall in behind by
     * stars, which is what this list was before the board could be read.
     */
    val recruits: List<SnapshotRecruit> = snapshot.recruits
        .sortedWith(
            compareBy<SnapshotRecruit> { it.nationalRank ?: Int.MAX_VALUE }
                .thenByDescending { it.stars ?: 0 }
                .thenByDescending { it.overall },
        )

    /**
     * The same pool by stars and then name, for while the overalls are hidden.
     * Ordering by a hidden number would give it away — the best recruits would
     * sit at the top whether or not their number is on screen — and stars are
     * public in the game anyway. Sorted here with everything else so flipping
     * the toggle never puts eleven thousand rows through a sort on the main
     * thread.
     */
    val recruitsByName: List<SnapshotRecruit> = snapshot.recruits
        .sortedWith(
            compareBy<SnapshotRecruit> { it.nationalRank ?: Int.MAX_VALUE }
                .thenByDescending { it.stars ?: 0 }
                .thenBy { it.last }
                .thenBy { it.first },
        )

    val recruitPositions: List<String> = snapshot.recruits.map { it.position }.distinct()
        .sortedBy { SaveLabels.POSITION_RANK[it] ?: Int.MAX_VALUE }

    fun rosterOf(index: Int): List<SnapshotPlayer> =
        teamsByIndex[index]?.teamId?.let { rosters[it] }.orEmpty()

    fun scheduleOf(index: Int): List<SnapshotGame> = schedules[index].orEmpty()

    fun gamesIn(week: Int): List<SnapshotGame> = byWeek[week].orEmpty()

    fun isUserGame(g: SnapshotGame): Boolean {
        val team = userTeam ?: return false
        return g.homeIndex == team.index || g.awayIndex == team.index
    }

    /** The spoiler rule, matching the desktop app's schedule exactly. */
    fun holds(g: SnapshotGame, spoilers: Boolean): Boolean =
        !spoilers && g.played && !g.postseason && g.week >= holdFrom && !isUserGame(g)
}

class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val _dynasty = MutableStateFlow<Dynasty?>(null)
    val dynasty: StateFlow<Dynasty?> = _dynasty.asStateFlow()

    private val _state = MutableStateFlow(Persisted())
    val state: StateFlow<Persisted> = _state.asStateFlow()

    private val _derived = MutableStateFlow<Derived?>(null)
    val derived: StateFlow<Derived?> = _derived.asStateFlow()

    /** The real dynasty, imported from the desktop app. It outranks the sample. */
    private val _snapshot = MutableStateFlow<SnapshotView?>(null)
    val snapshot: StateFlow<SnapshotView?> = _snapshot.asStateFlow()

    /**
     * The route a snapshot is coming in on right now — "file", "wifi" or
     * "github" — and null when nothing is in flight. One flow rather than a
     * flag per route, because only one import can be running at a time and the
     * screen has to say which one it is waiting on.
     */
    private val _busy = MutableStateFlow<String?>(null)
    val busy: StateFlow<String?> = _busy.asStateFlow()

    private val _importError = MutableStateFlow<String?>(null)
    val importError: StateFlow<String?> = _importError.asStateFlow()

    private var seq = 0

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    init {
        viewModelScope.launch {
            val saved = withContext(Dispatchers.IO) { Repository.loadState(getApplication()) }
            _state.value = saved
            // Nine megabytes of snapshot is far too much JSON for the main thread.
            _snapshot.value = withContext(Dispatchers.IO) {
                Repository.loadSnapshot(getApplication())?.let { SnapshotView(it) }
            }
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
            val next = Repository.seed(d).keepingSettings()
            _dynasty.value = d
            _state.value = next
            _derived.value = Derived(d, next)
            withContext(Dispatchers.IO) { Repository.saveState(getApplication(), next) }
            _loading.value = false
        }
    }

    /**
     * The one path a snapshot takes in, whichever route carried it. Reading,
     * parsing and the six megabytes of JSON all happen off the main thread, and
     * a document that does not parse never reaches disk — so a bad payload
     * leaves the phone showing the snapshot it already had, and every screen
     * picks up a good one on its own.
     */
    private fun bringIn(route: String, load: suspend () -> Result<DynastySnapshot>) {
        viewModelScope.launch {
            _busy.value = route
            _importError.value = null
            val result = withContext(Dispatchers.IO) { load().map { SnapshotView(it) } }
            result
                .onSuccess {
                    _snapshot.value = it
                    update { s -> s.copy(snapshotSource = route) }
                }
                .onFailure { _importError.value = it.message ?: "that snapshot could not be read" }
            _busy.value = null
        }
    }

    /** Hands a document that arrived over the network to the file import's own path. */
    private fun accept(fetched: SnapshotFetch.Fetched): Result<DynastySnapshot> = when (fetched) {
        is SnapshotFetch.Fetched.Ok -> Repository.acceptSnapshot(getApplication(), fetched.document)
        is SnapshotFetch.Fetched.Failed -> Result.failure(IllegalArgumentException(fetched.message))
    }

    /** Imports a snapshot the user picked with the document picker. */
    fun importSnapshot(uri: Uri) = bringIn("file") {
        Repository.importSnapshot(getApplication(), uri)
    }

    /**
     * Asks the desktop for the snapshot over the home network. The address and
     * code are saved first, so a fetch that fails on a stale code still leaves
     * the user with one field to correct rather than two to retype.
     */
    fun fetchOverWifi(url: String, token: String) {
        update { it.copy(relayUrl = url, relayToken = token) }
        bringIn("wifi") { accept(SnapshotFetch.overWifi(url, token)) }
    }

    /**
     * Sends every held edit that names a real row to the desktop.
     *
     * The phone cannot write a save and should not try: the writer that refuses
     * unless an edit lands exactly on its own bits lives on the PC, and this
     * asks it to do the work. Items raised against the sample dynasty carry no
     * row and are left where they are rather than sent as nonsense.
     *
     * Nothing is marked done on a promise. An item only leaves HELD when the
     * desktop says it wrote it, and the snapshot is re-read afterwards so the
     * screens show the save rather than what was asked for.
     */
    fun sendQueue() {
        val s = _state.value
        if (s.relayUrl.isBlank() || s.relayToken.isBlank()) {
            update { it.copy(log = it.log("no desktop address saved — fetch over Wi-Fi once first", "bad")) }
            return
        }
        val sending = s.queue.filter { it.state == "HELD" && it.applyIndex != null && it.applyKind != "noop" }
        if (sending.isEmpty()) {
            update { it.copy(log = it.log("nothing queued that names a row in the save", "warn")) }
            return
        }

        val quoted = { v: String -> "\"" + v.replace("\"", "") + "\"" }
        val players = sending.filter { it.applyKind == "ovr" || it.applyKind == "player" }
            .joinToString(",") { q ->
                val parts = mutableListOf("\"index\":${q.applyIndex}")
                q.applyOvr?.let { parts += "\"overall\":$it" }
                q.applyStars?.let { parts += "\"stars\":$it" }
                q.applyDev?.let { parts += "\"devTrait\":" + quoted(it) }
                q.applyDealbreaker?.let { parts += "\"dealbreaker\":" + quoted(it) }
                q.applyPitch?.let { parts += "\"idealPitch\":" + quoted(it) }
                if (q.applyRatings.isNotEmpty()) {
                    parts += "\"ratings\":{" +
                        q.applyRatings.entries.joinToString(",") { (k, v) -> quoted(k) + ":" + v } + "}"
                }
                "{" + parts.joinToString(",") + "}"
            }
        val recruits = sending.filter { it.applyKind == "stage" }.joinToString(",") { q ->
            val parts = mutableListOf("\"playerIndex\":${q.applyIndex}")
            q.applyStage?.let { parts += "\"stage\":\"$it\"" }
            q.applyCommit?.let { parts += "\"commitScore\":$it" }
            "{" + parts.joinToString(",") + "}"
        }
        val body = buildString {
            append("{")
            if (players.isNotEmpty()) append("\"players\":[").append(players).append("],\"playerCount\":")
                .append(_snapshot.value?.snapshot?.meta?.playerCount ?: 0)
                .append(",")
            if (recruits.isNotEmpty()) append("\"recruits\":[").append(recruits).append("],")
            if (endsWith(",")) setLength(length - 1)
            append("}")
        }

        viewModelScope.launch {
            _busy.value = "send"
            val res = withContext(Dispatchers.IO) { SnapshotFetch.sendEdits(s.relayUrl, s.relayToken, body) }
            when (res) {
                is SnapshotFetch.Fetched.Ok -> {
                    val ids = sending.map { it.id }.toSet()
                    update { st ->
                        st.copy(
                            queue = st.queue.map { if (it.id in ids) it.copy(state = "APPLIED") else it },
                            log = st.log(
                                "the PC wrote ${sending.size} edit" + if (sending.size == 1) "" else "s",
                                "good",
                            ),
                        )
                    }
                    refreshSnapshot()
                }
                is SnapshotFetch.Fetched.Failed ->
                    update { it.copy(log = it.log("the PC refused: " + res.message, "bad")) }
            }
            _busy.value = null
        }
    }

    /** Reads the snapshot the desktop published, for when the phone is not at home. */
    fun fetchFromGitHub(repo: String, token: String) {
        update { it.copy(githubRepo = repo, githubToken = token) }
        bringIn("github") { accept(SnapshotFetch.fromGitHub(repo, token)) }
    }

    /**
     * Fetches again by whichever route last worked. This is the everyday case —
     * the desktop has moved the dynasty on a week and the phone wants to catch
     * up — so it asks for nothing that has already been typed once.
     */
    fun refreshSnapshot() {
        val s = _state.value
        when (s.snapshotSource) {
            "wifi" -> fetchOverWifi(s.relayUrl, s.relayToken)
            "github" -> fetchFromGitHub(s.githubRepo, s.githubToken)
        }
    }

    // ── the art pack ────────────────────────────────────────────────────────

    private val _art = MutableStateFlow<ArtPack.Manifest?>(null)
    val art: StateFlow<ArtPack.Manifest?> = _art.asStateFlow()

    /** Loads what is already installed, so the screen can say what it has. */
    fun loadArt() {
        viewModelScope.launch(Dispatchers.IO) {
            val m = ArtPack.manifest(getApplication())
            withContext(Dispatchers.Main) { _art.value = m }
        }
    }

    /**
     * Brings a pack in, whichever route carried it.
     *
     * The same shape as a snapshot import and for the same reason: a pack that
     * does not unpack leaves the phone with whatever pictures it already had,
     * and the message says what went wrong rather than the screen going blank.
     */
    private fun bringArt(route: String, load: suspend () -> Result<ArtPack.Manifest>) {
        viewModelScope.launch {
            _busy.value = "art-$route"
            _importError.value = null
            val result = withContext(Dispatchers.IO) {
                // The scratch file goes whatever happens, including a download
                // that died partway and left half a pack behind.
                try { load() } finally { packScratch().delete() }
            }
            result
                .onSuccess { _art.value = it }
                .onFailure { _importError.value = it.message ?: "that art pack could not be read" }
            _busy.value = null
        }
    }

    /**
     * A scratch file for a pack on its way in.
     *
     * In the cache directory, because it is worthless the moment it is unpacked
     * and Android may delete it whenever it likes. It is deleted here anyway,
     * whichever way the import ends.
     */
    private fun packScratch(): File =
        File(getApplication<Application>().cacheDir, "art-incoming.zip")

    private fun installFrom(downloaded: SnapshotFetch.Downloaded): Result<ArtPack.Manifest> =
        when (downloaded) {
            is SnapshotFetch.Downloaded.Ok -> ArtPack.install(getApplication(), downloaded.file)
            is SnapshotFetch.Downloaded.Failed ->
                Result.failure(IllegalArgumentException(downloaded.message))
        }

    /**
     * Imports a pack the user picked, copying it through a file rather than
     * reading it whole: the document could be a hundred megabytes.
     */
    fun importArt(uri: Uri) = bringArt("file") {
        runCatching {
            val scratch = packScratch()
            getApplication<Application>().contentResolver.openInputStream(uri)?.use { input ->
                scratch.outputStream().buffered().use { input.copyTo(it) }
            } ?: error("that file could not be opened")
            ArtPack.install(getApplication(), scratch).getOrThrow()
        }
    }

    fun fetchArtOverWifi() {
        val s = _state.value
        bringArt("wifi") {
            installFrom(SnapshotFetch.artOverWifi(s.relayUrl, s.relayToken, packScratch()))
        }
    }

    fun fetchArtFromGitHub() {
        val s = _state.value
        bringArt("github") {
            installFrom(SnapshotFetch.artFromGitHub(s.githubRepo, s.githubToken, packScratch()))
        }
    }

    fun clearArt() {
        viewModelScope.launch(Dispatchers.IO) {
            ArtPack.clear(getApplication())
            withContext(Dispatchers.Main) { _art.value = null }
        }
    }

    /** Takes the real dynasty back off the phone. The PC still has the file. */
    fun clearSnapshot() {
        _snapshot.value = null
        _importError.value = null
        viewModelScope.launch(Dispatchers.IO) { Repository.clearSnapshot(getApplication()) }
    }

    /**
     * Drops the imported snapshot and loads the bundled demo. The snapshot wins
     * wherever it is present, so asking for the sample means letting go of it.
     */
    fun useSampleInstead() {
        clearSnapshot()
        loadSampleDynasty()
    }

    /** Drops whatever is loaded and returns the app to its empty state. */
    fun clearDynasty() {
        val next = Persisted().keepingSettings()
        _dynasty.value = null
        _derived.value = null
        _state.value = next
        viewModelScope.launch(Dispatchers.IO) { Repository.saveState(getApplication(), next) }
    }

    /**
     * Carries across the settings that describe this phone rather than the
     * dynasty on it: the theme, and everything about how a snapshot gets here.
     * Clearing a dynasty should not cost the user an address and two tokens
     * typed in again to get back to where they already were. Which recruits have
     * been scouted comes too, because it belongs to the snapshot and none of
     * these paths take the snapshot away.
     */
    private fun Persisted.keepingSettings(): Persisted {
        val kept = _state.value
        return copy(
            theme = kept.theme,
            relayUrl = kept.relayUrl,
            relayToken = kept.relayToken,
            githubRepo = kept.githubRepo,
            githubToken = kept.githubToken,
            snapshotSource = kept.snapshotSource,
            revealedRecruits = kept.revealedRecruits,
            revealAllRecruits = kept.revealAllRecruits,
        )
    }

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
    fun setMode(mode: String) = update { it.copy(mode = mode) }
    fun setAccent(accent: String) = update { it.copy(accent = accent) }

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
        applyIndex: Int? = null,
        applyCommit: Int? = null,
        applyRatings: Map<String, Int> = emptyMap(),
        applyStars: Int? = null,
        applyDev: String? = null,
        applyDealbreaker: String? = null,
        applyPitch: String? = null,
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
            applyIndex = applyIndex, applyCommit = applyCommit,
            applyRatings = applyRatings, applyStars = applyStars, applyDev = applyDev,
            applyDealbreaker = applyDealbreaker, applyPitch = applyPitch,
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

    /**
     * Scouts one recruit, or puts him back. His overall is in the snapshot
     * either way — this only decides whether the screen shows it.
     */
    fun toggleRecruitReveal(playerId: Int) = update {
        val scouted = it.revealedRecruits
        it.copy(
            revealedRecruits = if (playerId in scouted) scouted - playerId else scouted + playerId,
        )
    }

    /**
     * Hiding the overalls again forgets the recruits scouted one at a time too,
     * so hidden means hidden rather than hidden except the handful already
     * opened and since forgotten about.
     */
    fun setRevealAllRecruits(on: Boolean) = update {
        it.copy(
            revealAllRecruits = on,
            revealedRecruits = if (on) it.revealedRecruits else emptyList(),
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
        update { Repository.seed(d).keepingSettings() }
    }
}
