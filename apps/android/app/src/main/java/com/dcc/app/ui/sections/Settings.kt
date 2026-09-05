package com.dcc.app.ui.sections

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.dcc.app.BuildConfig
import com.dcc.app.data.Dynasty
import com.dcc.app.data.Persisted
import com.dcc.app.data.SaveLabels
import com.dcc.app.state.AppViewModel
import com.dcc.app.state.SnapshotView
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc
import com.dcc.app.update.Updater
import kotlinx.coroutines.launch

@Composable
fun SettingsSection(
    vm: AppViewModel,
    state: Persisted,
    dynasty: Dynasty?,
    snapshot: SnapshotView?,
    busy: String?,
    importError: String?,
) {
    val c = Dcc.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var update by remember { mutableStateOf<Updater.State>(Updater.State.Idle) }
    var relayUrl by remember(state.relayUrl) { mutableStateOf(state.relayUrl) }
    var relayToken by remember(state.relayToken) { mutableStateOf(state.relayToken) }
    var githubRepo by remember(state.githubRepo) { mutableStateOf(state.githubRepo) }
    var githubToken by remember(state.githubToken) { mutableStateOf(state.githubToken) }

    // The route that last worked is the one offered first, because it is nearly
    // always the one that will work again.
    var route by remember(state.snapshotSource) {
        mutableStateOf(state.snapshotSource.ifBlank { "file" })
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) vm.importSnapshot(uri)
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        SectionHeader(
            title = "Settings",
            sub = { MetaText("VERSION ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})") },
        )

        // ── snapshot ─────────────────────────────────────────────────────────
        DccCard {
            Kicker("Dynasty snapshot")
            Spacer(Modifier.height(9.dp))
            if (snapshot != null) {
                val s = snapshot.snapshot
                MonoLabel(
                    "SNAPSHOT LOADED — ${(snapshot.userTeam?.name ?: "NO TEAM PICKED").uppercase()}",
                    c.good, 10,
                )
                Spacer(Modifier.height(7.dp))
                MetaText(
                    "EXPORTED ${SaveLabels.generated(s.generated)}${arrivalNote(state.snapshotSource)}",
                    c.ink3, 10, maxLines = 2,
                )
                Spacer(Modifier.height(5.dp))
                MetaText(
                    "${s.teams.size} teams · ${s.games.size} games · " +
                        "${s.players.size} players · ${s.recruits.size} recruits",
                    c.ink3, 10, maxLines = 3,
                )
            } else {
                MetaText("NO SNAPSHOT IMPORTED", c.ink3, 10)
                Spacer(Modifier.height(7.dp))
                BodySerif(
                    "The Windows app reads your real save and writes it out as one document. " +
                        "It can reach this phone three ways: copied across as a file, asked for " +
                        "over your home Wi-Fi, or fetched from your own GitHub when you are out. " +
                        "Team and Recruit then show your dynasty instead of the sample.",
                )
            }

            when (busy) {
                "file" -> {
                    Spacer(Modifier.height(9.dp))
                    MonoLabel("READING THE FILE…", c.warn, 10)
                }
                "wifi" -> {
                    Spacer(Modifier.height(9.dp))
                    MonoLabel("ASKING THE DESKTOP…", c.warn, 10)
                }
                "github" -> {
                    Spacer(Modifier.height(9.dp))
                    MonoLabel("FETCHING FROM GITHUB…", c.warn, 10)
                }
            }
            importError?.let {
                Spacer(Modifier.height(9.dp))
                MonoLabel(it.uppercase(), c.accent, 10)
            }

            // One tap to catch up once a route has worked, with nothing to type
            // again — the everyday case, since the desktop moves the dynasty on
            // and the phone only ever wants the newest one.
            if (canRefresh(state)) {
                Spacer(Modifier.height(11.dp))
                DccButton(
                    if (state.snapshotSource == "wifi") "Refresh over Wi-Fi" else "Refresh from GitHub",
                    Modifier.fillMaxWidth(),
                    BtnStyle.PRIMARY,
                    enabled = busy == null,
                ) { vm.refreshSnapshot() }
            }

            Spacer(Modifier.height(13.dp))
            MetaText("BRING ONE IN", c.ink4, 9)
            Spacer(Modifier.height(7.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DccChip("From a file", route == "file") { route = "file" }
                DccChip("Over Wi-Fi", route == "wifi") { route = "wifi" }
                DccChip("From GitHub", route == "github") { route = "github" }
            }
            Spacer(Modifier.height(10.dp))

            when (route) {
                "wifi" -> {
                    BodySerif(
                        "Switch the server on in the Windows app and it shows an address and a " +
                            "code. Type both here, with this phone on the same Wi-Fi. The code " +
                            "is made fresh every time the server is switched on.",
                    )
                    Spacer(Modifier.height(11.dp))
                    MetaText("DESKTOP ADDRESS", c.ink3, 9)
                    Spacer(Modifier.height(5.dp))
                    DccField(relayUrl, "http://192.168.1.42:7327") { relayUrl = it }
                    Spacer(Modifier.height(8.dp))
                    MetaText("CODE", c.ink3, 9)
                    Spacer(Modifier.height(5.dp))
                    DccField(relayToken, "shown beside the address", secret = true) { relayToken = it }
                    Spacer(Modifier.height(10.dp))
                    DccButton(
                        "Fetch over Wi-Fi",
                        Modifier.fillMaxWidth(),
                        BtnStyle.PRIMARY,
                        enabled = busy == null,
                    ) { vm.fetchOverWifi(relayUrl.trim(), relayToken.trim()) }
                }
                "github" -> {
                    BodySerif(
                        "Away from home the PC cannot be reached, so the Windows app publishes " +
                            "the snapshot to a repository you own — private is fine — and this " +
                            "fetches it from there. The token needs repo access to that one " +
                            "repository and nothing else.",
                    )
                    Spacer(Modifier.height(11.dp))
                    MetaText("REPOSITORY", c.ink3, 9)
                    Spacer(Modifier.height(5.dp))
                    DccField(githubRepo, "your-name/dcc-dynasty") { githubRepo = it }
                    Spacer(Modifier.height(8.dp))
                    MetaText("GITHUB TOKEN", c.ink3, 9)
                    Spacer(Modifier.height(5.dp))
                    DccField(githubToken, "github_pat_…", secret = true) { githubToken = it }
                    Spacer(Modifier.height(10.dp))
                    DccButton(
                        "Fetch from GitHub",
                        Modifier.fillMaxWidth(),
                        BtnStyle.PRIMARY,
                        enabled = busy == null,
                    ) { vm.fetchFromGitHub(githubRepo.trim(), githubToken.trim()) }
                }
                else -> {
                    BodySerif(
                        "The Windows app writes dcc-snapshot.json out of your save. Copy that " +
                            "file to this phone — by cable, by chat, however it gets here — and " +
                            "pick it below.",
                    )
                    Spacer(Modifier.height(11.dp))
                    DccButton(
                        if (snapshot != null) "Import another snapshot" else "Import snapshot",
                        Modifier.fillMaxWidth(),
                        BtnStyle.PRIMARY,
                        enabled = busy == null,
                    ) {
                        // Providers disagree about what a .json file is — some report
                        // application/json, some octet-stream — and a filtered picker
                        // that guesses wrong hides the file completely.
                        picker.launch(arrayOf("*/*"))
                    }
                }
            }

            if (snapshot != null) {
                Spacer(Modifier.height(8.dp))
                DccButton("Use the sample dynasty instead", Modifier.fillMaxWidth()) { vm.useSampleInstead() }
                Spacer(Modifier.height(8.dp))
                DccButton("Remove snapshot", Modifier.fillMaxWidth(), BtnStyle.ACCENT) { vm.clearSnapshot() }
            }
        }

        Spacer(Modifier.height(10.dp))

        // ── dynasty ──────────────────────────────────────────────────────────
        DccCard {
            Kicker("Dynasty")
            Spacer(Modifier.height(9.dp))
            when (state.dynastySource) {
                "sample" -> {
                    MonoLabel("SAMPLE DYNASTY LOADED — INVENTED DATA, NOT YOUR SAVE", c.warn, 10)
                    if (snapshot != null) {
                        Spacer(Modifier.height(5.dp))
                        MetaText("YOUR SNAPSHOT IS SHOWN INSTEAD WHEREVER IT HAS THE DATA", c.ink4, 9)
                    }
                    Spacer(Modifier.height(7.dp))
                    dynasty?.let {
                        MetaText(
                            "Season ${it.meta.season} · ${it.teams.size} programs · " +
                                "${it.prospects.size} prospects",
                            c.ink3,
                        )
                    }
                    Spacer(Modifier.height(11.dp))
                    DccButton("Clear dynasty", Modifier.fillMaxWidth(), BtnStyle.ACCENT) { vm.clearDynasty() }
                }
                else -> {
                    MetaText("NO DYNASTY LOADED", c.ink3, 10)
                    Spacer(Modifier.height(7.dp))
                    BodySerif(
                        "Your dynasty arrives from the Windows app by way of the relay. Neither " +
                            "exists yet, so nothing can come in. The sample below is invented " +
                            "data for looking at the screens.",
                    )
                    Spacer(Modifier.height(11.dp))
                    DccButton("Load sample dynasty", Modifier.fillMaxWidth()) { vm.loadSampleDynasty() }
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        // ── relay ────────────────────────────────────────────────────────────
        DccCard {
            Kicker("Relay")
            Spacer(Modifier.height(9.dp))
            BodySerif(
                "The relay is the Windows app itself: while its server is on, this phone reads " +
                    "the dynasty straight off that machine and nothing leaves the house. Its " +
                    "address and code are entered under Dynasty snapshot, above, because " +
                    "fetching one is the only thing they do so far.",
            )
            Spacer(Modifier.height(11.dp))
            MetaText(
                if (state.relayUrl.isBlank()) "NO DESKTOP ADDRESS SAVED" else "DESKTOP ${state.relayUrl}",
                if (state.relayUrl.isBlank()) c.warn else c.ink3,
            )
            Spacer(Modifier.height(8.dp))
            MonoLabel("EDITS QUEUED HERE STILL STAY ON THE PHONE", c.warn, 9)
        }

        Spacer(Modifier.height(10.dp))

        // ── appearance ───────────────────────────────────────────────────────
        DccCard {
            Kicker("Appearance")
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DccChip("Night Wire", state.theme == "night", accent = true) { vm.setTheme("night") }
                DccChip("Field Office", state.theme == "field", accent = true) { vm.setTheme("field") }
            }
            Spacer(Modifier.height(9.dp))
            MetaText("Night Wire is the default. The choice is saved on this device.", c.ink3, 10, maxLines = 3)
        }

        Spacer(Modifier.height(10.dp))

        // ── updates ──────────────────────────────────────────────────────────
        DccCard {
            Kicker("Updates")
            Spacer(Modifier.height(9.dp))
            MetaText(
                "New versions install over this one — Android keeps your data because every " +
                    "build is signed with the same key. You never have to uninstall first.",
                c.ink3, 10, maxLines = 4,
            )
            Spacer(Modifier.height(10.dp))

            when (val u = update) {
                is Updater.State.Checking -> MonoLabel("CHECKING…", c.warn, 10)
                is Updater.State.Current -> MonoLabel("UP TO DATE — ${u.version}", c.good, 10)
                is Updater.State.Available -> {
                    MonoLabel("VERSION ${u.version} AVAILABLE", c.warn, 10)
                    if (u.notes.isNotBlank()) {
                        Spacer(Modifier.height(7.dp))
                        BodySerif(u.notes.lines().take(12).joinToString("\n"))
                    }
                }
                is Updater.State.Downloading -> {
                    MonoLabel("DOWNLOADING ${u.percent}%", c.warn, 10)
                    Spacer(Modifier.height(6.dp))
                    DccTrack(u.percent, color = c.warn)
                }
                is Updater.State.Ready -> MonoLabel("READY TO INSTALL — ${u.version}", c.good, 10)
                is Updater.State.Failed -> MonoLabel(u.message.uppercase(), c.accent, 10)
                Updater.State.Idle -> Unit
            }

            Spacer(Modifier.height(10.dp))

            when (val u = update) {
                is Updater.State.Available -> DccButton("Download ${u.version}", Modifier.fillMaxWidth(), BtnStyle.PRIMARY) {
                    scope.launch {
                        update = Updater.State.Downloading(0)
                        update = Updater.download(context, u) { p -> update = Updater.State.Downloading(p) }
                    }
                }
                is Updater.State.Ready -> DccButton("Install ${u.version}", Modifier.fillMaxWidth(), BtnStyle.PRIMARY) {
                    // Android needs one-time consent before this app can hand an
                    // APK to the installer.
                    if (Updater.canInstall(context)) Updater.install(context, u.file)
                    else Updater.requestInstallPermission(context)
                }
                else -> DccButton("Check for updates", Modifier.fillMaxWidth()) {
                    scope.launch {
                        update = Updater.State.Checking
                        update = Updater.check()
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            DccButton("Release notes", Modifier.fillMaxWidth()) { Updater.openReleases(context) }
        }

        Spacer(Modifier.height(24.dp))
    }
}

/** How the snapshot on the phone got here, appended to the export time. */
private fun arrivalNote(source: String): String = when (source) {
    "wifi" -> " · CAME IN OVER WI-FI"
    "github" -> " · CAME IN FROM GITHUB"
    "file" -> " · IMPORTED FROM A FILE"
    else -> ""
}

/**
 * Whether one tap can fetch again. A file cannot be re-read without the picker,
 * and a route is only offered once its details have actually worked.
 */
private fun canRefresh(state: Persisted): Boolean = when (state.snapshotSource) {
    "wifi" -> state.relayUrl.isNotBlank() && state.relayToken.isNotBlank()
    "github" -> state.githubRepo.isNotBlank() && state.githubToken.isNotBlank()
    else -> false
}
