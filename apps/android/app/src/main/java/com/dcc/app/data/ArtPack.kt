package com.dcc.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import kotlinx.serialization.Serializable
import java.io.File
import java.util.zip.ZipInputStream

/**
 * The pictures, once they have reached the phone.
 *
 * The desktop builds a ZIP of the art this dynasty actually uses — every
 * school's logo, helmet, jersey and gold mark, plus the faces it was asked for —
 * shrunk to the size a phone draws them at. This unpacks it into the app's own
 * files and hands out the images.
 *
 * Unpacked to disk rather than kept in memory: a pack is megabytes, an app is
 * killed and restarted whenever the phone feels like it, and a file that is
 * already a PNG is something `BitmapFactory` opens directly. The decoded
 * bitmaps are cached, because a roster grid asks for the same crest eighty-five
 * times in one frame.
 */
object ArtPack {

    /** Names inside the pack, which the desktop writes with the same rule. */
    fun safe(s: String): String = s.replace(Regex("[^A-Za-z0-9._-]+"), "_")

    @Serializable
    data class Manifest(
        val version: Int = 0,
        val built: String = "",
        val schools: Map<String, List<String>> = emptyMap(),
        val players: List<String> = emptyList(),
        /** Named art that is not a school: "trophy:heisman", "playoff:round1". */
        val awards: List<String> = emptyList(),
        /** How the jersey sits on the portrait, as lined up on the PC. */
        val fit: Fit = Fit(),
        val bytes: Long = 0,
    )

    @Serializable
    data class Fit(val jerseyScale: Float = 1f, val jerseyDrop: Float = 0f)

    private fun root(context: Context) = File(context.filesDir, "art")
    private fun manifestFile(context: Context) = File(root(context), "manifest.json")

    /**
     * Unpacks a pack, replacing whatever was there.
     *
     * Replacing rather than merging: a new pack is the answer to "what does this
     * dynasty need", and a player who has left should not keep his face on the
     * phone forever. Entries are checked against the two folders the desktop
     * writes, so a ZIP from anywhere else cannot write outside this directory.
     *
     * Reads from a file, never from a byte array. A pack of every face in the
     * country is a hundred megabytes, and holding it in memory while also
     * writing it out is what Android was killing the app for.
     */
    fun install(context: Context, pack: File): Result<Manifest> = runCatching {
        val dir = root(context)
        dir.deleteRecursively()
        dir.mkdirs()

        var written = 0
        ZipInputStream(pack.inputStream().buffered()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val name = entry.name
                if (entry.isDirectory) continue
                val ok = name == "manifest.json" ||
                    ((name.startsWith("schools/") || name.startsWith("players/") ||
                        name.startsWith("awards/")) &&
                        !name.contains("..") && name.count { it == '/' } == 1)
                if (!ok) continue
                val out = File(dir, name)
                out.parentFile?.mkdirs()
                out.outputStream().buffered().use { zip.copyTo(it) }
                written++
            }
        }
        if (written == 0) error("that file is not a DCC art pack")

        cache.evictAll()
        fitCache = null
        val text = manifestFile(context).takeIf { it.exists() }?.readText()
            ?: error("that pack has no manifest")
        Repository.json.decodeFromString(Manifest.serializer(), text)
    }.onFailure {
        // A half-unpacked pack is worse than none: it is megabytes the phone
        // cannot draw from and the screen would report as nothing installed.
        root(context).deleteRecursively()
    }

    /** What is installed, or null when nothing is. */
    fun manifest(context: Context): Manifest? =
        manifestFile(context).takeIf { it.exists() }
            ?.let { runCatching { Repository.json.decodeFromString(Manifest.serializer(), it.readText()) }.getOrNull() }

    /**
     * The pack's jersey alignment, read once and held.
     *
     * Every card and every avatar asks for it while drawing, and parsing a
     * manifest per frame is not something to do to a scrolling grid.
     */
    @Volatile private var fitCache: Fit? = null

    fun fit(context: Context): Fit {
        fitCache?.let { return it }
        val f = manifest(context)?.fit ?: Fit()
        fitCache = f
        return f
    }

    fun clear(context: Context) {
        fitCache = null
        root(context).deleteRecursively()
        cache.evictAll()
    }

    /**
     * A school's mark: "logo", "gold", "helmet", "helmetRight", "jersey" — or
     * "stadium", which is the one that is not the game's art at all and is only
     * there if the PC fetched or was given a photograph of the ground.
     */
    fun school(context: Context, name: String?, kind: String): File? {
        if (name.isNullOrBlank()) return null
        // Every mark is a PNG except the stadium, which is a photograph and
        // travels as a JPEG — a pack of hundred-and-forty megabyte PNGs is not
        // a thing anyone would send over a phone's Wi-Fi. Both are tried rather
        // than switching on the kind, so a pack written either way still reads.
        val base = File(root(context), "schools/${safe(name)}__$kind")
        return listOf("png", "jpg")
            .map { File("${base.path}.$it") }
            .firstOrNull { it.exists() }
    }

    /**
     * Whether this pack actually holds the right-facing helmets.
     *
     * Packs built before the two were split carry only one, and the old
     * behaviour was to hand that one back for either request — so both sides of
     * a matchup drew the same art and faced the same way, and no amount of
     * choosing between them made any difference. The caller mirrors the left
     * helmet instead, which at least makes the pair meet, and rebuilding the
     * pack on the PC replaces it with the real thing.
     */
    fun hasSplitHelmets(context: Context, name: String?): Boolean =
        school(context, name, "helmetRight") != null

    /**
     * Whether a lone `helmet` in this pack can be trusted to face right.
     *
     * From pack version 2 on, `helmet` is always the game's `lt` art — the left
     * helmet of the pair, which faces right. Version 1 packs were built when one
     * pattern matched both `lthelmets` and `rthelmets` and whichever the scan
     * reached last won, so a version 1 pack's single helmet may face either way
     * and nothing here can tell which.
     *
     * That matters because the alternative to knowing is guessing, and a guess
     * is what put both sides of a matchup facing outward: the phone mirrored a
     * helmet it could not identify. When the answer is unknown the caller draws
     * the same art on both sides instead — a pair facing the same way reads as
     * a choice, a pair facing apart reads as a bug — and rebuilding the pack on
     * the PC replaces it with the real thing.
     */
    fun helmetFacesRight(context: Context): Boolean =
        (manifest(context)?.version ?: 0) >= 2

    /**
     * A trophy, bowl crest, playoff mark or conference championship.
     *
     * Keyed "kind:name" the way the PC keys it — the colon becomes a double
     * underscore in the file, which is a name this side rebuilds rather than
     * being told.
     */
    fun award(context: Context, key: String?): File? {
        if (key.isNullOrBlank()) return null
        val kind = key.substringBefore(':')
        val name = key.substringAfter(':', "")
        if (name.isBlank()) return null
        return File(root(context), "awards/${safe(kind)}__${safe(name)}.png").takeIf { it.exists() }
    }

    fun player(context: Context, assetId: String?): File? {
        if (assetId.isNullOrBlank()) return null
        return File(root(context), "players/${safe(assetId)}.png").takeIf { it.exists() }
    }

    /**
     * Decoded bitmaps, by path.
     *
     * A quarter of what the app is allowed, which is the usual share for images.
     * The pack's own images are already small, so this holds a lot of them.
     */
    private val cache = object : LruCache<String, Bitmap>(
        (Runtime.getRuntime().maxMemory() / 4).coerceAtMost(48L * 1024 * 1024).toInt(),
    ) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }

    fun bitmap(file: File): Bitmap? {
        val key = file.path
        cache.get(key)?.let { return it }
        val bmp = runCatching { BitmapFactory.decodeFile(key) }.getOrNull() ?: return null
        cache.put(key, bmp)
        return bmp
    }
}
