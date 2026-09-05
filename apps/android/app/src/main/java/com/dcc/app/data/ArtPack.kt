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
        val bytes: Long = 0,
    )

    private fun root(context: Context) = File(context.filesDir, "art")
    private fun manifestFile(context: Context) = File(root(context), "manifest.json")

    /**
     * Unpacks a pack, replacing whatever was there.
     *
     * Replacing rather than merging: a new pack is the answer to "what does this
     * dynasty need", and a player who has left should not keep his face on the
     * phone forever. Entries are checked against the two folders the desktop
     * writes, so a ZIP from anywhere else cannot write outside this directory.
     */
    fun install(context: Context, bytes: ByteArray): Result<Manifest> = runCatching {
        val dir = root(context)
        dir.deleteRecursively()
        dir.mkdirs()

        var written = 0
        ZipInputStream(bytes.inputStream()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val name = entry.name
                if (entry.isDirectory) continue
                val ok = name == "manifest.json" ||
                    ((name.startsWith("schools/") || name.startsWith("players/")) &&
                        !name.contains("..") && name.count { it == '/' } == 1)
                if (!ok) continue
                val out = File(dir, name)
                out.parentFile?.mkdirs()
                out.outputStream().use { zip.copyTo(it) }
                written++
            }
        }
        if (written == 0) error("that file is not a DCC art pack")

        cache.evictAll()
        val text = manifestFile(context).takeIf { it.exists() }?.readText()
            ?: error("that pack has no manifest")
        Repository.json.decodeFromString(Manifest.serializer(), text)
    }

    /** What is installed, or null when nothing is. */
    fun manifest(context: Context): Manifest? =
        manifestFile(context).takeIf { it.exists() }
            ?.let { runCatching { Repository.json.decodeFromString(Manifest.serializer(), it.readText()) }.getOrNull() }

    fun clear(context: Context) {
        root(context).deleteRecursively()
        cache.evictAll()
    }

    /** A school's mark: "logo", "gold", "helmet" or "jersey". */
    fun school(context: Context, name: String?, kind: String): File? {
        if (name.isNullOrBlank()) return null
        return File(root(context), "schools/${safe(name)}__$kind.png").takeIf { it.exists() }
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
