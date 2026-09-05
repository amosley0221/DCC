package com.dcc.app.data

import android.content.Context
import android.net.Uri
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Loads the seed dynasty from assets, imports the real dynasty snapshot the
 * desktop app exports, and persists everything the user changes to filesDir,
 * which survives an in-place app update.
 */
object Repository {

    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    private const val STATE_FILE = "dcc-state.json"
    private const val SNAPSHOT_FILE = "dcc-snapshot.json"

    fun loadDynasty(context: Context): Dynasty =
        context.assets.open("dcc-data.json").use { stream ->
            json.decodeFromString(Dynasty.serializer(), stream.readBytes().decodeToString())
        }

    fun loadState(context: Context): Persisted {
        val file = File(context.filesDir, STATE_FILE)
        if (!file.exists()) return Persisted()
        return runCatching { json.decodeFromString(Persisted.serializer(), file.readText()) }
            // A state file written by an older build should never brick the app;
            // starting empty beats refusing to start.
            .getOrElse { Persisted() }
    }

    fun saveState(context: Context, state: Persisted) {
        runCatching {
            File(context.filesDir, STATE_FILE)
                .writeText(json.encodeToString(Persisted.serializer(), state))
        }
    }

    fun clearState(context: Context) {
        File(context.filesDir, STATE_FILE).delete()
    }

    // ── dynasty snapshot ─────────────────────────────────────────────────────

    /** The imported snapshot, or null when none has been brought in yet. */
    fun loadSnapshot(context: Context): DynastySnapshot? {
        val file = File(context.filesDir, SNAPSHOT_FILE)
        if (!file.exists()) return null
        // A file this build cannot read is not worth crashing over; the app
        // falls back to whatever else it has, and Settings offers a re-import.
        return runCatching { decodeSnapshot(file.readText()) }.getOrNull()
    }

    /**
     * Keeps the snapshot exactly as the desktop wrote it rather than re-encoding
     * the parsed object — re-encoding would quietly drop every field this build
     * does not know about, and a later build should still find them there.
     */
    fun saveSnapshot(context: Context, document: String) {
        runCatching { File(context.filesDir, SNAPSHOT_FILE).writeText(document) }
    }

    fun clearSnapshot(context: Context) {
        File(context.filesDir, SNAPSHOT_FILE).delete()
    }

    /**
     * Reads a snapshot the user picked with the document picker. Nothing is
     * written until the document has parsed, so a wrong or damaged file leaves
     * the phone showing the dynasty it already had.
     */
    fun importSnapshot(context: Context, uri: Uri): Result<DynastySnapshot> = runCatching {
        val document = context.contentResolver.openInputStream(uri)
            ?.use { it.readBytes().decodeToString() }
            ?: error("that file could not be opened")
        val snapshot = decodeSnapshot(document)
        saveSnapshot(context, document)
        snapshot
    }

    /**
     * A newer snapshot is allowed through: added fields are ignored, and a
     * version that genuinely broke the shape fails on its missing fields
     * anyway. An older one is refused, because those fields are simply gone.
     */
    private fun decodeSnapshot(document: String): DynastySnapshot {
        val snapshot = runCatching { json.decodeFromString(DynastySnapshot.serializer(), document) }
            .getOrElse { throw IllegalArgumentException("that file is not a DCC snapshot") }
        if (snapshot.version < SNAPSHOT_VERSION) {
            throw IllegalArgumentException(
                "snapshot version ${snapshot.version} — export it again from the desktop app",
            )
        }
        return snapshot
    }

    /** Starting state for the bundled sample dynasty. */
    fun seed(dynasty: Dynasty) = Persisted(
        dynastySource = "sample",
        week = dynasty.meta.currentWeek,
        heat = 62,
        leaseHolder = dynasty.devices.holder,
        board = dynasty.seededBoard,
        log = listOf(LogLine(System.currentTimeMillis(), "relay connected — save verified on the PC", "good")),
    )
}
