package com.dcc.app.data

import android.content.Context
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Loads the seed dynasty from assets and persists everything the user changes
 * to filesDir, which survives an in-place app update.
 */
object Repository {

    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

    private const val STATE_FILE = "dcc-state.json"

    fun loadDynasty(context: Context): Dynasty =
        context.assets.open("dcc-data.json").use { stream ->
            json.decodeFromString(Dynasty.serializer(), stream.readBytes().decodeToString())
        }

    fun loadState(context: Context, dynasty: Dynasty): Persisted {
        val file = File(context.filesDir, STATE_FILE)
        if (!file.exists()) return seed(dynasty)
        return runCatching { json.decodeFromString(Persisted.serializer(), file.readText()) }
            // A state file written by an older build should never brick the app;
            // falling back to the seed is better than refusing to start.
            .getOrElse { seed(dynasty) }
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

    fun seed(dynasty: Dynasty) = Persisted(
        week = dynasty.meta.currentWeek,
        leaseHolder = dynasty.devices.holder,
        board = dynasty.seededBoard,
        log = listOf(LogLine(System.currentTimeMillis(), "relay connected — save verified on the PC", "good")),
    )
}
