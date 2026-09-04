package com.dcc.app.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.dcc.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Checks this repo's GitHub Releases for a newer APK, downloads it, and hands
 * it to the system package installer.
 *
 * Every release APK is signed with the same key (see apps/android/keystore),
 * so the installer upgrades the existing app in place — the user never has to
 * uninstall first, and app data is kept.
 */
object Updater {

    private const val OWNER = "amosley0221"
    private const val REPO = "DCC"
    private const val LATEST = "https://api.github.com/repos/$OWNER/$REPO/releases/latest"
    const val RELEASES_URL = "https://github.com/$OWNER/$REPO/releases"

    private val json = Json { ignoreUnknownKeys = true }

    sealed interface State {
        data object Idle : State
        data object Checking : State
        data class Current(val version: String) : State
        data class Available(val version: String, val notes: String, val url: String, val size: Long) : State
        data class Downloading(val percent: Int) : State
        data class Ready(val version: String, val file: File) : State
        data class Failed(val message: String) : State
    }

    /** Compares dotted versions numerically so 0.10.0 beats 0.9.0. */
    fun isNewer(remote: String, local: String): Boolean {
        fun parts(v: String) = v.trimStart('v').split('.', '-')
            .map { it.toIntOrNull() ?: 0 }
        val r = parts(remote)
        val l = parts(local)
        for (i in 0 until maxOf(r.size, l.size)) {
            val a = r.getOrElse(i) { 0 }
            val b = l.getOrElse(i) { 0 }
            if (a != b) return a > b
        }
        return false
    }

    suspend fun check(): State = withContext(Dispatchers.IO) {
        runCatching {
            val body = request(LATEST) ?: return@runCatching State.Failed("No release found")
            val release = json.parseToJsonElement(body).jsonObject
            val tag = release["tag_name"]?.jsonPrimitive?.content.orEmpty()
            val version = tag.trimStart('v')
            val notes = release["body"]?.jsonPrimitive?.content.orEmpty()

            val asset = release["assets"]?.jsonArray
                ?.map { it.jsonObject }
                ?.firstOrNull { it["name"]?.jsonPrimitive?.content?.endsWith(".apk") == true }
                ?: return@runCatching State.Failed("That release has no APK attached")

            val url = asset["browser_download_url"]?.jsonPrimitive?.content.orEmpty()
            val size = asset["size"]?.jsonPrimitive?.content?.toLongOrNull() ?: 0L

            if (version.isNotEmpty() && isNewer(version, BuildConfig.VERSION_NAME)) {
                State.Available(version, notes, url, size)
            } else {
                State.Current(BuildConfig.VERSION_NAME)
            }
        }.getOrElse { State.Failed(it.message ?: "Could not reach GitHub") }
    }

    suspend fun download(
        context: Context,
        available: State.Available,
        onProgress: (Int) -> Unit,
    ): State = withContext(Dispatchers.IO) {
        runCatching {
            val dir = File(context.getExternalFilesDir(null) ?: context.filesDir, "updates")
            dir.mkdirs()
            // Only the APK being installed is kept, so downloads never pile up.
            dir.listFiles()?.forEach { it.delete() }
            val out = File(dir, "dcc-${available.version}.apk")

            val conn = (URL(available.url).openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = true
                connectTimeout = 20_000
                readTimeout = 60_000
                setRequestProperty("Accept", "application/octet-stream")
            }
            conn.inputStream.use { input ->
                out.outputStream().use { sink ->
                    val total = if (available.size > 0) available.size else conn.contentLengthLong
                    val buffer = ByteArray(64 * 1024)
                    var read = 0L
                    var last = -1
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        sink.write(buffer, 0, n)
                        read += n
                        if (total > 0) {
                            val pct = ((read * 100) / total).toInt().coerceIn(0, 100)
                            if (pct != last) { last = pct; onProgress(pct) }
                        }
                    }
                }
            }
            conn.disconnect()
            State.Ready(available.version, out)
        }.getOrElse { State.Failed(it.message ?: "Download failed") }
    }

    /** True once the user has allowed this app to install packages. */
    fun canInstall(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    fun requestInstallPermission(context: Context) {
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
            .setData(Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    fun install(context: Context, apk: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    fun openReleases(context: Context) {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(RELEASES_URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    private fun request(url: String): String? {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "DynastyCommandCenter/${BuildConfig.VERSION_NAME}")
        }
        return try {
            if (conn.responseCode !in 200..299) null else conn.inputStream.bufferedReader().readText()
        } finally {
            conn.disconnect()
        }
    }
}
