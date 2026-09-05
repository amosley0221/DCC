package com.dcc.app.data

import com.dcc.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
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
    private const val API = "https://api.github.com"
    private const val API_VERSION = "2022-11-28"

    /** "owner/name", the same shape the desktop app validates before publishing. */
    private val REPO = Regex("""^[\w.-]+/[\w.-]+$""")

    // Long enough for six megabytes over a tired hotel connection, short enough
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
    private fun assetUrl(repo: String, token: String): String {
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
            .firstOrNull { it["name"]?.jsonPrimitive?.content == ASSET_NAME }
            ?.get("url")?.jsonPrimitive?.content
            ?: throw Refused("that release has no $ASSET_NAME — publish again from the desktop app")
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
                    // Six megabytes of JSON compresses to well under one, which
                    // is the whole reason the desktop gzips it.
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
