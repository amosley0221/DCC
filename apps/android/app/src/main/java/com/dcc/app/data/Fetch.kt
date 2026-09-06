package com.dcc.app.data

import com.dcc.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

/**
 * Brings a dynasty snapshot in over the network, by either route the desktop
 * app offers: its own small server on the home Wi-Fi
 * (apps/desktop/electron/relay.ts), or a release asset it publishes to a
 * repository the user owns (apps/desktop/electron/publish.ts).
 *
 * Both hand back the identical document the file import already reads, so
 * nothing downstream changes — the same parse, the same file on disk, the same
 * screens. Only the way the bytes arrive is new.
 *
 * HttpURLConnection does all of it. Two requests and a gzip stream do not earn
 * a networking library in an APK the user side-loads over their own data plan.
 *
 * Every failure comes back as a sentence the user can act on. Tokens are the
 * whole access control on both routes, so they are never put in a message and
 * never logged.
 */
object SnapshotFetch {

    /** What the desktop names the release and the asset it publishes. */
    private const val RELEASE_TAG = "dynasty-snapshot"
    private const val ASSET_NAME = "dcc-snapshot.json.gz"
    /** The art pack, in the same release beside the snapshot. */
    private const val ART_ASSET_NAME = "dcc-art.zip"
    private const val API = "https://api.github.com"
    private const val API_VERSION = "2022-11-28"

    /** "owner/name", the same shape the desktop app validates before publishing. */
    private val REPO = Regex("""^[\w.-]+/[\w.-]+$""")

    // Long enough for nine megabytes over a tired hotel connection, short enough
    // that a wrong address gives up while the user is still looking at the screen.
    private const val CONNECT_MS = 10_000
    private const val READ_MS = 45_000

    /** GitHub hands the download to storage that signs its own links; a couple of hops. */
    private const val MAX_HOPS = 5

    sealed interface Fetched {
        /** The snapshot document, exactly as the desktop wrote it. */
        data class Ok(val document: String) : Fetched
        data class Failed(val message: String) : Fetched
    }

    /**
     * A failure already phrased for the user. It is an IOException so that one
     * catch covers both it and the network giving out; the callers only have to
     * pass the message on.
     */
    private class Refused(message: String) : IOException(message)

    // ── over the home Wi-Fi ──────────────────────────────────────────────────

    /**
     * Asks the desktop directly. The address and the code are both read off the
     * desktop screen, and the code changes every time that server is switched
     * on, so a refusal is far more often a stale code than a wrong one.
     */
    suspend fun overWifi(base: String, token: String): Fetched = withContext(Dispatchers.IO) {
        val root = baseUrl(base)
            ?: return@withContext Fetched.Failed("that address should look like http://192.168.1.42:7327")
        if (token.isBlank()) {
            return@withContext Fetched.Failed("the desktop shows a code beside the address — it goes here")
        }

        try {
            val conn = open("$root/snapshot", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $token")
            try {
                when (val code = conn.responseCode) {
                    200 -> Fetched.Ok(conn.inputStream.bufferedReader().readText())
                    401 -> Fetched.Failed(
                        "the desktop refused that code — it is made fresh each time the server is switched on",
                    )
                    else -> Fetched.Failed(explained(conn, code))
                }
            } finally {
                conn.disconnect()
            }
        } catch (e: IOException) {
            // A wrong address, a sleeping PC, the server switched off and a phone
            // that has dropped to mobile data all arrive here the same way.
            Fetched.Failed(
                "nothing answered at $root — check the desktop is showing that address and " +
                    "that this phone is on the same Wi-Fi",
            )
        }
    }

    // ── from GitHub ──────────────────────────────────────────────────────────

    /**
     * Sends queued edits to the desktop, which is the only thing allowed to
     * write a save.
     *
     * The phone never touches the file. It says what it wants changed and the
     * desktop's own writer decides — the same writer, with the same refusals,
     * that the Windows app uses when you edit there. So a bad edit is refused on
     * the PC rather than trusted here, and the answer comes back as the
     * desktop's own words.
     */
    suspend fun sendEdits(base: String, token: String, body: String): Fetched =
        withContext(Dispatchers.IO) {
            val root = baseUrl(base) ?: return@withContext Fetched.Failed(
                "that does not look like an address — it should read like http://192.168.1.42:7327",
            )
            try {
                val conn = open("$root/edits", "application/json")
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("authorization", "Bearer $token")
                conn.setRequestProperty("content-type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                val code = conn.responseCode
                val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()?.use { it.readText() } ?: ""
                if (code in 200..299) Fetched.Ok(text)
                else Fetched.Failed(explained(conn, code).ifBlank { "the PC answered $code" })
            } catch (e: IOException) {
                Fetched.Failed(e.message ?: "the PC could not be reached")
            }
        }

    /**
     * Reads the snapshot the desktop published. The token is the user's own and
     * needs repo access to that one repository, which is usually private.
     */
    suspend fun fromGitHub(repo: String, token: String): Fetched = withContext(Dispatchers.IO) {
        val target = repo.trim()
        if (!REPO.matches(target)) {
            return@withContext Fetched.Failed("name the repository as owner/name, the way the desktop app has it")
        }
        if (token.isBlank()) {
            return@withContext Fetched.Failed("a GitHub token is needed — the same one the desktop app publishes with")
        }

        try {
            Fetched.Ok(download(assetUrl(target, token), token))
        } catch (e: Refused) {
            Fetched.Failed(e.message.orEmpty())
        } catch (e: IOException) {
            Fetched.Failed("GitHub could not be reached — this phone looks to be offline")
        }
    }

    /** Finds the one asset in the reusable release that holds the snapshot. */
    private fun assetUrl(repo: String, token: String, asset: String = ASSET_NAME): String {
        val conn = github("$API/repos/$repo/releases/tags/$RELEASE_TAG", token, "application/vnd.github+json")
        val body = try {
            when (val code = conn.responseCode) {
                200 -> conn.inputStream.bufferedReader().readText()
                401, 403 -> throw Refused("GitHub refused that token — it needs repo access to $repo")
                404 -> throw Refused("nothing published at $repo yet — publish from the desktop app first")
                else -> throw Refused("GitHub answered $code looking for the snapshot")
            }
        } finally {
            conn.disconnect()
        }

        val assets = runCatching { Repository.json.parseToJsonElement(body).jsonObject["assets"]?.jsonArray }
            .getOrElse { throw Refused("GitHub's answer was not the release this app expects") }
            .orEmpty()

        return assets.map { it.jsonObject }
            .firstOrNull { it["name"]?.jsonPrimitive?.content == asset }
            ?.get("url")?.jsonPrimitive?.content
            ?: throw Refused("that release has no $asset — publish again from the desktop app")
    }

    /**
     * Downloads and unzips the asset. The redirect is followed by hand, with the
     * token dropped at the hop, because GitHub redirects to storage that signs
     * the link itself and refuses a request carrying a second set of credentials.
     */
    private fun download(assetUrl: String, token: String): String {
        var target = assetUrl
        var credentialed = true
        repeat(MAX_HOPS) {
            val conn = if (credentialed) {
                github(target, token, "application/octet-stream", follow = false)
            } else {
                open(target, "application/octet-stream", follow = false)
            }
            try {
                val code = conn.responseCode
                if (code in 300..399) {
                    val next = conn.getHeaderField("Location")
                        ?: throw Refused("GitHub redirected the download to nowhere")
                    target = URL(URL(target), next).toString()
                    credentialed = false
                    return@repeat
                }
                return when (code) {
                    // Nine megabytes of JSON compresses to a megabyte and a half,
                    // which is the whole reason the desktop gzips it.
                    200 -> GZIPInputStream(conn.inputStream).bufferedReader().readText()
                    401, 403 -> throw Refused("GitHub refused the download — the token may have expired")
                    404 -> throw Refused("the published snapshot has gone — publish it again from the desktop app")
                    else -> throw Refused("GitHub answered $code downloading the snapshot")
                }
            } finally {
                conn.disconnect()
            }
        }
        throw Refused("GitHub sent the download round in circles")
    }

    // ── the art pack ────────────────────────────────────────────────────────

    sealed interface Downloaded {
        /** Where the pack landed. The caller owns the file and deletes it. */
        data class Ok(val file: File) : Downloaded
        data class Failed(val message: String) : Downloaded
    }

    /**
     * The pictures, over the same two routes as the dynasty — straight to disk.
     *
     * Never into memory. A pack of every face in the country is a hundred
     * megabytes, `readBytes` doubles its buffer as it grows, and Android killed
     * the app outright: "Dynasty Command Center keeps stopping". Copied through
     * to a file, the largest thing alive at any moment is an eight-kilobyte
     * buffer, and the size of the pack stops mattering.
     *
     * It is not gzipped on the way, either: a ZIP of PNGs is already compressed
     * and gzipping it again would only make it slightly bigger.
     */
    suspend fun artOverWifi(base: String, token: String, into: File): Downloaded =
        withContext(Dispatchers.IO) {
            val root = baseUrl(base)
                ?: return@withContext Downloaded.Failed(
                    "that address should look like http://192.168.1.42:7327",
                )
            if (token.isBlank()) {
                return@withContext Downloaded.Failed(
                    "the desktop shows a code beside the address — it goes here",
                )
            }
            try {
                val conn = open("$root/art", "application/zip")
                conn.setRequestProperty("Authorization", "Bearer $token")
                try {
                    when (val code = conn.responseCode) {
                        200 -> { drain(conn, into); Downloaded.Ok(into) }
                        401 -> Downloaded.Failed(
                            "the desktop refused that code — it is made fresh each time",
                        )
                        409 -> Downloaded.Failed(
                            "build the art pack on the desktop first, under Devices",
                        )
                        else -> Downloaded.Failed("the desktop answered $code for the art pack")
                    }
                } finally {
                    conn.disconnect()
                }
            } catch (e: IOException) {
                Downloaded.Failed(
                    "nothing answered at $root — check the desktop is showing that address",
                )
            }
        }

    suspend fun artFromGitHub(repo: String, token: String, into: File): Downloaded =
        withContext(Dispatchers.IO) {
            val target = repo.trim()
            if (!REPO.matches(target)) {
                return@withContext Downloaded.Failed(
                    "name the repository as owner/name, the way the desktop app has it",
                )
            }
            if (token.isBlank()) {
                return@withContext Downloaded.Failed(
                    "a GitHub token is needed — the same one the desktop publishes with",
                )
            }
            try {
                downloadTo(assetUrl(target, token, ART_ASSET_NAME), token, into)
                Downloaded.Ok(into)
            } catch (e: Refused) {
                Downloaded.Failed(e.message.orEmpty())
            } catch (e: IOException) {
                Downloaded.Failed("GitHub could not be reached — this phone looks to be offline")
            }
        }

    /** The redirect dance again, writing the body straight through to the file. */
    private fun downloadTo(assetUrl: String, token: String, into: File) {
        var target = assetUrl
        var credentialed = true
        repeat(MAX_HOPS) {
            val conn = if (credentialed) {
                github(target, token, "application/octet-stream", follow = false)
            } else {
                open(target, "application/octet-stream", follow = false)
            }
            try {
                val code = conn.responseCode
                if (code in 300..399) {
                    val next = conn.getHeaderField("Location")
                        ?: throw Refused("GitHub redirected the download to nowhere")
                    target = URL(URL(target), next).toString()
                    credentialed = false
                    return@repeat
                }
                when (code) {
                    200 -> { drain(conn, into); return }
                    401, 403 -> throw Refused("GitHub refused the download — the token may have expired")
                    404 -> throw Refused("the published art pack has gone — build it again on the desktop")
                    else -> throw Refused("GitHub answered $code downloading the art pack")
                }
            } finally {
                conn.disconnect()
            }
        }
        throw Refused("GitHub sent the download round in circles")
    }

    /** Response body to file, eight kilobytes at a time. */
    private fun drain(conn: HttpURLConnection, into: File) {
        into.parentFile?.mkdirs()
        conn.inputStream.use { input -> into.outputStream().use { out -> input.copyTo(out) } }
    }

    // ── plumbing ─────────────────────────────────────────────────────────────

    private fun open(url: String, accept: String, follow: Boolean = true): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_MS
            readTimeout = READ_MS
            instanceFollowRedirects = follow
            setRequestProperty("Accept", accept)
            setRequestProperty("User-Agent", "DynastyCommandCenter/${BuildConfig.VERSION_NAME}")
        }

    private fun github(url: String, token: String, accept: String, follow: Boolean = true): HttpURLConnection =
        open(url, accept, follow).apply {
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("X-GitHub-Api-Version", API_VERSION)
        }

    /**
     * The user types what the desktop shows, which may arrive without a scheme
     * or with a slash on the end. Anything that is still not a URL is turned
     * away here rather than at the socket.
     */
    private fun baseUrl(typed: String): String? {
        val text = typed.trim().trimEnd('/')
        if (text.isEmpty()) return null
        val full = if (text.startsWith("http://") || text.startsWith("https://")) text else "http://$text"
        return full.takeIf { runCatching { URL(it).host }.getOrNull()?.isNotBlank() == true }
    }

    /** The relay says what went wrong in the body; a bare status code does not help anyone. */
    private fun explained(conn: HttpURLConnection, code: Int): String {
        val body = runCatching { conn.errorStream?.bufferedReader()?.readText() }.getOrNull().orEmpty()
        val message = runCatching {
            Repository.json.parseToJsonElement(body).jsonObject["message"]?.jsonPrimitive?.content
        }.getOrNull()
        return message?.takeIf { it.isNotBlank() } ?: "the desktop answered $code"
    }
}
