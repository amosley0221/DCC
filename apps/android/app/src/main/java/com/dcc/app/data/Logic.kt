package com.dcc.app.data

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Shared rules, mirroring apps/desktop/src/logic.ts so the two apps agree on
 * interest, trade legality and how a tampering exchange scores.
 */
object Rules {

    val STAGES = listOf(
        "TOP 8", "TOP 5", "TOP 3", "SOFT COMMIT",
        "COMMITTED", "HARD COMMIT", "SIGNED", "DECOMMITTED",
    )

    val POSITIONS = listOf("QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "DT", "LB", "CB", "S", "K", "P")
    val DEV_TRAITS = listOf("Normal", "Impact", "Star", "Elite")
    val CLASSES = listOf("FR", "FR (RS)", "SO", "JR", "SR")
    val ROLES = listOf("Backup", "Rotational", "Day-One Starter", "Featured Playmaker")
    val PROMISES = listOf("Guaranteed reps", "NFL development plan", "His jersey number", "Collective intro")

    const val ROSTER_LIMIT = 85
    const val HEAT_THRESHOLD = 80
    const val TAMPER_OPENS_WEEK = 11
    const val PLEDGE_INTEREST = 70
    const val FIRST_CONTACT_HEAT = 3
    const val BURNED_HEAT = 12

    private val COMMITTED = setOf("SOFT COMMIT", "COMMITTED", "HARD COMMIT", "SIGNED")
    private val STAGE_SIZE = mapOf("TOP 8" to 8, "TOP 5" to 5, "TOP 3" to 3)

    enum class Tone { GOOD, WARN, ACCENT, INK3, INK4 }

    data class Interest(val text: String, val tone: Tone, val inRange: Boolean)

    /**
     * The interest line only appears when the user's program is inside the cut
     * the recruit is actually at — being #6 on a TOP 3 board is not interest.
     */
    fun interestFor(p: Prospect, myTeamId: String): Interest {
        val idx = p.topSchools.indexOf(myTeamId)
        if (p.stage in COMMITTED) {
            return if (idx == 0) Interest("COMMITTED TO YOU — ${p.stage}", Tone.GOOD, true)
            else Interest("COMMITTED ELSEWHERE", Tone.ACCENT, false)
        }
        if (p.stage == "DECOMMITTED") return Interest("DECOMMITTED — BOARD OPEN", Tone.ACCENT, false)
        if (idx == -1) return Interest("NOT ON HIS BOARD", Tone.INK4, false)

        val size = STAGE_SIZE[p.stage] ?: p.topSchools.size
        val n = idx + 1
        return if (n <= size) Interest("INTERESTED — YOU #$n OF THEIR TOP $size", Tone.GOOD, true)
        else Interest("NOT INTERESTED — YOU #$n, OUTSIDE THEIR TOP $size", Tone.INK4, false)
    }

    fun stageTone(stage: String): Tone = when (stage) {
        "SIGNED", "HARD COMMIT", "COMMITTED" -> Tone.GOOD
        "SOFT COMMIT" -> Tone.WARN
        "DECOMMITTED" -> Tone.ACCENT
        else -> Tone.INK3
    }

    fun stars(n: Int): String = "★".repeat(n) + "☆".repeat(5 - n)

    // ── trade ────────────────────────────────────────────────────────────────

    fun playerValue(p: Player): Int = (max(0, p.ovr - 55).toDouble().pow(1.7)).roundToInt()

    fun countTone(n: Int): Tone = when {
        n > ROSTER_LIMIT -> Tone.ACCENT
        n == ROSTER_LIMIT -> Tone.WARN
        else -> Tone.GOOD
    }

    data class Verdict(val text: String, val tone: Tone, val balance: Float)

    fun tradeVerdict(mine: List<Player>, theirs: List<Player>): Verdict {
        val a = mine.sumOf { playerValue(it) }
        val b = theirs.sumOf { playerValue(it) }
        val total = a + b
        val balance = if (total == 0) 0.5f else b.toFloat() / total
        val gap = b - a
        val tol = max(40.0, total * 0.08)
        return when {
            abs(gap) <= tol -> Verdict("BALANCED", Tone.INK3, balance)
            gap > 0 -> Verdict("YOU WIN THIS ONE", Tone.GOOD, balance)
            else -> Verdict("YOU GIVE UP MORE", Tone.WARN, balance)
        }
    }

    // ── tampering ────────────────────────────────────────────────────────────

    fun nilVerdict(offer: Int, current: Int): Pair<String, Tone> = when {
        offer <= current -> "NOT A RAISE" to Tone.ACCENT
        offer < current * 1.3 -> "A RAISE" to Tone.WARN
        else -> "INTERESTED" to Tone.GOOD
    }

    fun standing(interest: Int): Pair<String, Tone> = when {
        interest >= 70 -> "LEADING" to Tone.GOOD
        interest >= 35 -> "IN THE MIX" to Tone.WARN
        else -> "NOT IN IT YET" to Tone.INK3
    }

    private val DEALBREAKER_CUES = mapOf(
        "Championship Contender" to listOf("title", "championship", "ring", "natty", "playoff", "contend", "win it"),
        "Immediate Playing Time" to listOf("start", "snap", "reps", "day one", "play right away", "rotation", "field"),
        "NFL Pipeline" to listOf("nfl", "draft", "league", "pro", "combine", "scout"),
        "Close To Home" to listOf("home", "family", "mom", "close", "drive", "hometown"),
        "Scheme Fit" to listOf("scheme", "system", "fit", "offense", "defense", "role", "usage"),
    )

    private val COLD = listOf(
        "who is this",
        "idk man i’m good where i’m at",
        "we can talk i guess. not making moves rn tho",
        "heard that before ngl",
    )
    private val WARMING = listOf(
        "ok that’s different. keep going",
        "ngl that part matters to me",
        "aight i’m listening",
        "my people would want to hear that too",
    )
    private val HOT = listOf(
        "fr? that changes things",
        "ok now we talking. what’s the timeline",
        "i’d have to tell my coach but yeah",
        "send it to my guy and let’s set something up",
    )
    private val EMPTY = listOf(
        "that’s just words tho",
        "everybody says that",
        "ok but what’s the actual offer",
        "cool story lol",
    )
    private val OFFENDED = listOf("nah don’t do that", "you got me messed up", "i’m done talking")

    val TALKING_POINTS = listOf(
        "you’d start week one",
        "we put three at your spot in the league",
        "your family can drive to every home game",
        "the collective is ready for you",
        "we’re playing for a title this year",
    )

    data class CallResult(
        val reply: String,
        val interestDelta: Int,
        val heatDelta: Int,
        val note: String,
        val burned: Boolean,
    )

    private val INSULTS = Regex("\\b(trash|scrub|bench|nobody|washed|overrated)\\b")

    /**
     * Local call engine. The relay's model writes richer prose, but the app has
     * to work with the server off, so the same signals are scored here: whether
     * the dealbreaker was addressed, whether the money is a real raise, and
     * whether the promised role beats where he already sits on the depth chart.
     */
    fun scoreExchange(player: Player, convo: Convo, text: String): CallResult {
        val lower = text.lowercase()
        val cues = DEALBREAKER_CUES[player.dealbreaker].orEmpty()
        val hitsDealbreaker = cues.any { lower.contains(it) }
        val insulting = INSULTS.containsMatchIn(lower)
        val (moneyText, _) = nilVerdict(convo.nilOffer, player.nil)
        val roleIdx = ROLES.indexOf(convo.role)
        val roleUpgrade = roleIdx >= 2 && player.depth > 1

        var delta = 0
        val bits = mutableListOf<String>()

        if (hitsDealbreaker) {
            delta += 9
            bits += "hit his dealbreaker (${player.dealbreaker.lowercase()})"
        } else if (text.trim().length > 12) {
            delta += 1
        }

        when (moneyText) {
            "INTERESTED" -> { delta += 7; bits += "the money is real" }
            "A RAISE" -> { delta += 3; bits += "the money is a step up" }
            else -> { delta -= 3; bits += "the money is not a raise" }
        }

        if (roleUpgrade) {
            delta += 5
            bits += "a starting job beats ${player.pos}${player.depth}"
        } else if (roleIdx <= 1) {
            delta -= 2
            bits += "the role you offered is a lateral move"
        }

        delta += min(4, convo.promises.size * 2)
        if (insulting) delta -= 16
        delta = delta.coerceIn(-15, 20)

        val burned = insulting && convo.interest < 30
        val heatDelta = if (burned) BURNED_HEAT
        else (if (convo.contacted) 0 else FIRST_CONTACT_HEAT) + (if (delta < 0) 2 else 1)

        val next = (convo.interest + delta).coerceIn(0, 100)
        val bank = when {
            burned || insulting -> OFFENDED
            next >= 70 -> HOT
            next >= 35 -> WARMING
            delta <= 0 -> EMPTY
            else -> COLD
        }
        // Deterministic pick, so the same exchange always reads the same way.
        val reply = bank[(convo.messages.size * 7 + text.length) % bank.size]

        return CallResult(
            reply = reply,
            interestDelta = delta,
            heatDelta = heatDelta,
            note = if (bits.isEmpty()) "Coach's read: nothing landed."
            else "Coach's read: ${bits.joinToString("; ")}.",
            burned = burned,
        )
    }
}
