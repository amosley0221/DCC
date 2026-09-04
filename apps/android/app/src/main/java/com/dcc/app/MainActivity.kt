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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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

            DccTheme(state.theme) {
                val c = Dcc.colors
                val d = derived
                val dy = dynasty

                Box(Modifier.fillMaxSize().background(c.bg0)) {
                    if (dy == null || d == null) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            MonoLabel("LOADING DYNASTY…", c.ink4, 11)
                        }
                    } else {
                        var section by rememberSaveable { mutableStateOf(SECTIONS[0]) }
                        var callTarget by rememberSaveable { mutableStateOf<String?>(null) }

                        Row(Modifier.fillMaxSize().safeDrawingPadding()) {
                            // Left nav rail — the unfolded fold is the design target,
                            // and the rail keeps the reading column intact.
                            Column(
                                Modifier
                                    .width(64.dp)
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
                                            MonoLabel(
                                                s.take(7),
                                                if (active) c.ink else c.ink4,
                                                9,
                                            )
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
                                        "${state.heat}",
                                        if (state.heat >= 80) c.accent else c.ink,
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
                                when (section) {
                                    "WIRE" -> WireSection(vm, state, d)
                                    "NATIONAL" -> NationalSection(dy, d)
                                    "RECRUIT" -> RecruitSection(vm, state, d, dy.meta.userTeamId)
                                    "TEAM" -> TeamSection(vm, dy, state, d) { id ->
                                        callTarget = id
                                        section = "TAMPER"
                                    }
                                    "TAMPER" -> TamperSection(vm, dy, state, d, callTarget) { callTarget = it }
                                    "COACH" -> CoachSection(vm, dy)
                                    "QUEUE" -> QueueSection(vm, state)
                                    else -> SettingsSection(vm, state, dy)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Suppress("unused")
private val transparent = Color.Transparent
