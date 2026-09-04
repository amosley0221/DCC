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
fun SettingsSection(vm: AppViewModel, state: Persisted, dynasty: Dynasty) {
    val c = Dcc.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var update by remember { mutableStateOf<Updater.State>(Updater.State.Idle) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        SectionHeader(
            title = "Settings",
            sub = { MetaText("VERSION ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})") },
        )

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

        DccCard {
            Kicker("Updates")
            Spacer(Modifier.height(9.dp))
            MetaText(
                "New versions install over this one — Android keeps your data because every build is " +
                    "signed with the same key. You never have to uninstall first.",
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

        Spacer(Modifier.height(10.dp))

        DccCard {
            Kicker("Data")
            Spacer(Modifier.height(9.dp))
            MetaText(
                "Season ${dynasty.meta.season} · ${dynasty.teams.size} programs · " +
                    "${dynasty.prospects.size} prospects",
                c.ink3, 10,
            )
            Spacer(Modifier.height(10.dp))
            DccButton("Reset local state", Modifier.fillMaxWidth(), BtnStyle.ACCENT) { vm.reset() }
        }

        Spacer(Modifier.height(24.dp))
    }
}
