package com.dcc.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dcc.app.state.AppViewModel
import com.dcc.app.ui.components.*
import com.dcc.app.ui.sections.*
import com.dcc.app.ui.theme.Dcc
import com.dcc.app.ui.theme.DccTheme

private val SECTIONS = listOf("WIRE", "NATIONAL", "RECRUIT", "TEAM", "TAMPER", "COACH", "QUEUE", "SETTINGS")

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            val vm: AppViewModel = viewModel()
            val state by vm.state.collectAsState()
            val dynasty by vm.dynasty.collectAsState()
            val derived by vm.derived.collectAsState()
            val snapshot by vm.snapshot.collectAsState()
            val busy by vm.busy.collectAsState()
            val importError by vm.importError.collectAsState()
            val loading by vm.loading.collectAsState()

            DccTheme(state.theme) {
                val c = Dcc.colors
                val d = derived
                val dy = dynasty
                val snap = snapshot

                Box(Modifier.fillMaxSize().background(c.bg0)) {
                    if (loading) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            MonoLabel("LOADING…", c.ink4, 11)
                        }
                    } else {
                        var section by rememberSaveable { mutableStateOf(SECTIONS[0]) }
                        var callTarget by rememberSaveable { mutableStateOf<String?>(null) }

                        Row(Modifier.fillMaxSize().safeDrawingPadding()) {
                            // Left nav rail — the unfolded fold is the design target,
                            // and the rail keeps the reading column intact.
                            Column(
                                Modifier
                                    .width(72.dp)
                                    .fillMaxHeight()
                                    .background(c.bar)
                                    .verticalScroll(rememberScrollState()),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Spacer(Modifier.height(12.dp))
                                SECTIONS.forEach { s ->
                                    val active = section == s
                                    val held = state.queue.count { it.state == "HELD" }
                                    Box(
                                        Modifier
                                            .fillMaxWidth()
                                            .heightIn(min = 52.dp)
                                            .clickable { section = s; callTarget = null },
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            MonoLabel(s, if (active) c.ink else c.ink4, 9)
                                            if (active) {
                                                Spacer(Modifier.height(4.dp))
                                                Box(
                                                    Modifier.width(22.dp).height(2.dp).background(c.accent),
                                                )
                                            }
                                            if (s == "QUEUE" && held > 0) {
                                                Spacer(Modifier.height(3.dp))
                                                Box(
                                                    Modifier.clip(CircleShape).background(c.accent)
                                                        .padding(horizontal = 5.dp, vertical = 1.dp),
                                                ) { MonoLabel("$held", c.onAccent, 8) }
                                            }
                                        }
                                    }
                                }
                                Spacer(Modifier.weight(1f))
                                // Heat is pinned at the rail bottom.
                                Column(
                                    Modifier.padding(bottom = 14.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    MonoLabel("HEAT", c.ink4, 8)
                                    NumText(
                                        if (dy == null) "—" else "${state.heat}",
                                        if (dy != null && state.heat >= 80) c.accent else c.ink,
                                        16,
                                        androidx.compose.ui.text.font.FontWeight.SemiBold,
                                    )
                                }
                            }

                            Box(
                                Modifier
                                    .weight(1f)
                                    .fillMaxHeight()
                                    .padding(horizontal = 16.dp, vertical = 14.dp),
                            ) {
                                // Settings is always reachable, and the two
                                // sections the snapshot fills stand on their own
                                // — the real dynasty outranks the sample and
                                // does not need it loaded. Everything else still
                                // needs a dynasty to have something to show.
                                if (section == "SETTINGS") {
                                    SettingsSection(vm, state, dy, snap, busy, importError)
                                } else if (section == "TEAM" && snap != null) {
                                    TeamSnapshotSection(snap)
                                } else if (section == "RECRUIT" && snap != null) {
                                    RecruitSnapshotSection(snap)
                                } else if (dy == null || d == null) {
                                    NoDynasty(section.lowercase().replaceFirstChar { it.uppercase() }, state) {
                                        section = "SETTINGS"
                                    }
                                } else {
                                    when (section) {
                                        "WIRE" -> WireSection(vm, state, d)
                                        "NATIONAL" -> NationalSection(dy, d, snap)
                                        "RECRUIT" -> RecruitSection(vm, state, d, dy.meta.userTeamId)
                                        "TEAM" -> TeamSection(vm, dy, state, d) { id ->
                                            callTarget = id
                                            section = "TAMPER"
                                        }
                                        "TAMPER" -> TamperSection(vm, dy, state, d, callTarget) { callTarget = it }
                                        "COACH" -> CoachSection(vm, dy)
                                        else -> QueueSection(vm, state)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
