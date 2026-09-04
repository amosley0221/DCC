package com.dcc.app.ui.sections

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
import com.dcc.app.state.AppViewModel
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc
import com.dcc.app.update.Updater
import kotlinx.coroutines.launch

@Composable
fun SettingsSection(vm: AppViewModel, state: Persisted, dynasty: Dynasty?) {
    val c = Dcc.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var update by remember { mutableStateOf<Updater.State>(Updater.State.Idle) }
    var relayUrl by remember(state.relayUrl) { mutableStateOf(state.relayUrl) }
    var relayToken by remember(state.relayToken) { mutableStateOf(state.relayToken) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        SectionHeader(
            title = "Settings",
            sub = { MetaText("VERSION ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})") },
        )

        // ── dynasty ──────────────────────────────────────────────────────────
        DccCard {
            Kicker("Dynasty")
            Spacer(Modifier.height(9.dp))
            when (state.dynastySource) {
                "sample" -> {
                    MonoLabel("SAMPLE DYNASTY LOADED — INVENTED DATA, NOT YOUR SAVE", c.warn, 10)
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
                "The home server that holds the dynasty, the shared queue and the media. The " +
                    "Windows app pushes to it; this phone reads from it.",
            )
            Spacer(Modifier.height(11.dp))
            MetaText("SERVER ADDRESS", c.ink3, 9)
            Spacer(Modifier.height(5.dp))
            DccField(relayUrl, "http://den-server.local:8080") { relayUrl = it }
            Spacer(Modifier.height(8.dp))
            MetaText("PAIRING TOKEN", c.ink3, 9)
            Spacer(Modifier.height(5.dp))
            DccField(relayToken, "from the Windows app") { relayToken = it }
            Spacer(Modifier.height(10.dp))
            DccButton("Save", Modifier.fillMaxWidth()) { vm.setRelay(relayUrl.trim(), relayToken.trim()) }
            Spacer(Modifier.height(8.dp))
            MonoLabel("RELAY SERVICE NOT BUILT YET — NOTHING TO CONNECT TO", c.warn, 9)
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
