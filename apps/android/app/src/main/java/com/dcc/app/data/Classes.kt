package com.dcc.app.data

/**
 * Which school is winning the recruiting year.
 *
 * A mirror of `recruiting.ts` on the desktop, formula for formula, so the two
 * apps never disagree about who has the best class. The game keeps a class
 * ranking of its own and it is not decoded, so this is DCC's ordering of the
 * commits in your save — which the screens say, because a ranking that looks
 * official and is not is worse than none.
 */
object Classes {

    /** One recruit, as far as a class table cares. */
    data class Commit(
        val school: String,
        val stars: Int,
        val nationalRank: Int,
        /** Signed or hard — a soft commit still counts, and is marked. */
        val firm: Boolean,
    )

    data class Row(
        val school: String,
        val commits: Int,
        /** Of those, the ones who could still flip. */
        val soft: Int,
        /** How many at each star rating, five down to one. */
        val byStar: List<Int>,
        /** The best commit's national rank, which is the class's headline. */
        val best: Int,
        val points: Double,
    )

    private val COMMITTED = setOf("SoftCommitted", "HardCommitted", "Signed")

    fun isCommitted(stage: String?): Boolean = stage in COMMITTED
    fun isFirm(stage: String?): Boolean = stage == "HardCommitted" || stage == "Signed"

    /**
     * What one commit is worth. It falls off with the national rank rather than
     * stepping at the star boundaries, because the gap between the 20th and the
     * 200th recruit is real and both are four stars.
     */
    fun commitPoints(nationalRank: Int, stars: Int): Double =
        1000.0 / (maxOf(1, nationalRank) + 45) + maxOf(0, stars - 1) * 1.5

    /** Every school with a commit, strongest class first. */
    fun table(commits: List<Commit>): List<Row> {
        val rows = LinkedHashMap<String, MutableList<Commit>>()
        for (c in commits) {
            if (c.school.isBlank()) continue
            rows.getOrPut(c.school) { mutableListOf() }.add(c)
        }
        return rows.map { (school, list) ->
            val byStar = MutableList(5) { 0 }
            var points = 0.0
            var best = Int.MAX_VALUE
            for (c in list) {
                val star = c.stars.coerceIn(1, 5)
                byStar[5 - star]++
                points += commitPoints(c.nationalRank, star)
                if (c.nationalRank in 1 until best) best = c.nationalRank
            }
            Row(
                school = school,
                commits = list.size,
                soft = list.count { !it.firm },
                byStar = byStar,
                best = if (best == Int.MAX_VALUE) 0 else best,
                points = points,
            )
        }.sortedWith(
            compareByDescending<Row> { it.points }.thenBy { it.best }.thenBy { it.school },
        )
    }

    /** The table straight off a snapshot's recruits. */
    fun of(recruits: List<SnapshotRecruit>): List<Row> = table(
        recruits.filter { isCommitted(it.stage) }.mapNotNull { r ->
            val school = r.topSchools.maxByOrNull { it.interest }?.school ?: return@mapNotNull null
            Commit(school, r.stars ?: 3, r.nationalRank ?: 0, isFirm(r.stage))
        },
    )
}
