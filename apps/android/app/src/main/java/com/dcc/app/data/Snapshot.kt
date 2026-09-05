package com.dcc.app.data

import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * A dynasty snapshot: everything the desktop app decoded out of the real save,
 * in one JSON document. Mirrors apps/desktop/electron/snapshot.ts.
 *
 * Only the PC can read a save, so the phone has to be handed the data. Today
 * the user moves the file across themselves; when the relay exists it will
 * carry the identical document and nothing here has to change.
 *
 * Every optional field carries a default and the parser ignores unknown keys,
 * so a snapshot written by a newer desktop build still opens on an older phone
 * build — it simply shows the parts this version knows about.
 */
const val SNAPSHOT_VERSION = 4

/**
 * The oldest snapshot this build can still make sense of.
 *
 * Everything added since carries a default, so an older document opens with the
 * newer lists empty rather than being turned away. Raise this only if a change
 * ever makes an old snapshot unreadable rather than merely thinner.
 */
const val MIN_SNAPSHOT_VERSION = 2

@Serializable
data class DynastySnapshot(
    val version: Int,
    val generated: String = "",
    val meta: SnapshotMeta = SnapshotMeta(),
    val teams: List<SnapshotTeam> = emptyList(),
    val games: List<SnapshotGame> = emptyList(),
    val players: List<SnapshotPlayer> = emptyList(),
    val recruits: List<SnapshotRecruit> = emptyList(),
    /**
     * The two things the desktop keeps beside the save rather than in it. The
     * phone cannot build either — the ledger needs two seasons of saves and the
     * conversations need an API key — so they ride along or they do not exist
     * here. Older snapshots have neither key and open with both empty.
     */
    val transfers: List<SnapshotMove> = emptyList(),
    val threads: List<SnapshotThread> = emptyList(),
    /**
     * School name to the colour read out of its own logo, and the schools
     * marked as national champions. Neither is in the save — team colours are
     * not decoded and last season's bracket is not in this season's file — so
     * both are worked out on the PC and travel with the snapshot.
     */
    val schoolColors: Map<String, String> = emptyMap(),
    val champions: List<String> = emptyList(),
)

/** One transfer, already resolved to school names by the desktop. */
@Serializable
data class SnapshotMove(
    val key: String = "",
    val first: String = "",
    val last: String = "",
    val position: String = "",
    val fromSeason: Int = 0,
    val toSeason: Int = 0,
    val from: String = "",
    val to: String = "",
    val overallBefore: Int = 0,
    val overallAfter: Int = 0,
)

/** One tampering conversation, read-only here: sending needs the desktop. */
@Serializable
data class SnapshotThread(
    val key: String = "",
    val first: String = "",
    val last: String = "",
    val position: String = "",
    val overall: Int = 0,
    val team: String = "",
    val interest: Int = 0,
    val resistance: Int = 0,
    val because: List<String> = emptyList(),
    val mood: String = "",
    val committed: Boolean = false,
    val standing: String = "",
    val turns: List<SnapshotTurn> = emptyList(),
)

@Serializable
data class SnapshotTurn(
    val from: String = "",
    val text: String = "",
    val move: Int = 0,
)

@Serializable
data class SnapshotMeta(
    /** The week the save is sitting on: the first with an unplayed user game. */
    val currentWeek: Int? = null,
    val userTeamName: String? = null,
    /** Row in the save's team table — what games refer to a team by. */
    val userTeamIndex: Int? = null,
    /** The team id players carry, which is a different numbering entirely. */
    val userTeamId: Int? = null,
    val ratingNames: List<String> = emptyList(),
    val playerCount: Int = 0,
)

@Serializable
data class SnapshotTeam(
    val index: Int,
    val teamId: Int? = null,
    val name: String,
    val fullName: String? = null,
    val abbr: String? = null,
    val nickname: String? = null,
    val conference: String? = null,
    val division: String? = null,
    val coach: String? = null,
    val wins: Int = 0,
    val losses: Int = 0,
)

@Serializable
data class SnapshotGame(
    /** Row in the save's game table, and the only stable id a game has. */
    val row: Int,
    val week: Int = 0,
    val month: Int = 0,
    val day: Int = 0,
    /** Minutes after midnight; 2047 is the schema's "unset". */
    val kickoff: Int = 0,
    val attendance: Int = 0,
    val temperatureF: Int = 0,
    val weather: Int = -1,
    val windMph: Int = 0,
    val homeIndex: Int = -1,
    val awayIndex: Int = -1,
    val home: String? = null,
    val away: String? = null,
    val homeScore: Int = 0,
    val awayScore: Int = 0,
    val homeQ: List<Int> = emptyList(),
    val awayQ: List<Int> = emptyList(),
    val homeOT: Int = 0,
    val awayOT: Int = 0,
    val played: Boolean = false,
    /** The user played this one rather than simulating it. */
    val userPlayed: Boolean = false,
    val overtime: Boolean = false,
    /** December rows are bowls; the season's own weeks run August to November. */
    val postseason: Boolean = false,
)

@Serializable
data class SnapshotPlayer(
    /** Row in the save's roster table — unique, and the only id worth keying on. */
    val index: Int,
    val playerId: Int = 0,
    val first: String = "",
    val last: String = "",
    /** The team id, not the team-table index the games use. */
    val team: Int = UNASSIGNED_TEAM,
    val position: String = "",
    val overall: Int = 0,
    val year: String? = null,
    val dev: String? = null,
    val archetype: String? = null,
    val heightIn: Int? = null,
    val weightLb: Int? = null,
    val redshirt: Boolean = false,
    val hometown: String = "",
    val state: String? = null,
    val stars: Int? = null,
    val nilK: Int? = null,
    val assetId: String? = null,
    /** Only the user's own roster carries these; everyone else omits them. */
    val ratings: Map<String, Int>? = null,
)

@Serializable
data class SnapshotRecruit(
    val index: Int,
    val playerId: Int = 0,
    val first: String = "",
    val last: String = "",
    val team: Int = UNASSIGNED_TEAM,
    val position: String = "",
    val overall: Int = 0,
    val year: String? = null,
    val dev: String? = null,
    val archetype: String? = null,
    val heightIn: Int? = null,
    val weightLb: Int? = null,
    val redshirt: Boolean = false,
    val hometown: String = "",
    val state: String? = null,
    val stars: Int? = null,
    val nilK: Int? = null,
    val assetId: String? = null,
    val pipeline: String? = null,
    val dealbreaker: String? = null,
    val idealPitch: String? = null,
    /**
     * The same fifty-two ratings a roster row carries, so scouting a recruit has
     * something to give up beyond the overall. Snapshots written before the
     * desktop started sending them simply have no key here, and an empty map
     * rather than a missing field keeps those opening on this build.
     */
    val ratings: Map<String, Int> = emptyMap(),
)

/** The recruit and portal pool sits on this team id rather than a real roster. */
const val UNASSIGNED_TEAM = 255

val SnapshotPlayer.name: String get() = "$first $last".trim()
val SnapshotMove.name: String get() = "$first $last".trim()
val SnapshotThread.name: String get() = "$first $last".trim()
val SnapshotRecruit.name: String get() = "$first $last".trim()

/** The badge takes a two-letter mark; the save's abbreviation is the closest thing. */
val SnapshotTeam.monogram: String get() = (abbr ?: name).take(2).uppercase()

/**
 * Labels for the save's own enumerations, mirroring
 * apps/desktop/electron/gameEnums.ts so both apps read a game the same way.
 */
object SaveLabels {

    /** `Weather`, four bits in a game row. Values past the list are unset. */
    val WEATHER = listOf(
        "Clear", "Overcast", "Partly cloudy", "Windy", "Light rain", "Rain", "Heavy rain",
        "Light snow", "Snow", "Heavy snow", "Dynamic rain", "Dynamic snow", "Random",
    )

    private val MONTHS = listOf(
        "", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    )

    /**
     * Where a player came from, as a schema name. Only transfers carry one — a
     * player recruited out of the roster's own class leaves the field unset.
     */
    /**
     * The class, shortened the way a roster writes it. The long names are what
     * the desktop sends; older snapshots carry the mislabelled ones, which are
     * mapped to the class they actually meant rather than shown as junior
     * college.
     */
    private val CLASS_YEARS = mapOf(
        "Freshman" to "FR",
        "Sophomore" to "SO",
        "Junior" to "JR",
        "Senior" to "SR",
        "HighSchool" to "FR",
        "JuniorCollege_Sophomore" to "SO",
        "JuniorCollege_Junior" to "JR",
    )

    fun weather(v: Int): String? = WEATHER.getOrNull(v)

    /** Kickoff is minutes after midnight; anything outside a day is unset. */
    fun kickoff(minutes: Int): String? {
        if (minutes < 0 || minutes >= 1440) return null
        val h = minutes / 60
        val m = minutes % 60
        val h12 = if (h % 12 == 0) 12 else h % 12
        return "$h12:${m.toString().padStart(2, '0')} ${if (h < 12) "AM" else "PM"}"
    }

    fun date(month: Int, day: Int): String =
        MONTHS.getOrNull(month)?.takeIf { it.isNotEmpty() }?.let { "$it $day" }.orEmpty()

    fun year(year: String?): String? = year?.let { CLASS_YEARS[it] ?: it }

    fun height(inches: Int?): String =
        inches?.let { "${it / 12}'${it % 12}\"" }.orEmpty()

    /** Thousands separators without a locale dependency, for attendance. */
    fun grouped(n: Int): String = n.toString().reversed().chunked(3).joinToString(",").reversed()

    private val GENERATED = DateTimeFormatter.ofPattern("d MMM yyyy · HH:mm")

    /**
     * When the desktop wrote the snapshot, in the phone's own time zone. The
     * raw ISO string stands in if it is not one this build can parse.
     */
    fun generated(iso: String): String = runCatching {
        GENERATED.format(Instant.parse(iso).atZone(ZoneId.systemDefault()))
    }.getOrDefault(iso)
}
