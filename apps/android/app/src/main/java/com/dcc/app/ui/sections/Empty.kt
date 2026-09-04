package com.dcc.app.ui.sections

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dcc.app.data.Persisted
import com.dcc.app.ui.components.*
import com.dcc.app.ui.theme.Dcc

/**
 * What every section shows before a dynasty exists. The app holds no data of
 * its own: it shows the user's save, or it shows nothing.
 */
@Composable
fun NoDynasty(section: String, state: Persisted, onOpenSettings: () -> Unit) {
    val c = Dcc.colors
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        SectionHeader(
            title = section,
            sub = { MetaText("NO DYNASTY LOADED", c.ink3) },
        )

        DccCard {
            Kicker("Waiting on your save")
            Spacer(Modifier.height(8.dp))
            BodySerif(
                "This app shows your dynasty and nothing else, so it stays empty until your " +
                    "save reaches it. The Windows app reads the save on your gaming PC and " +
                    "sends the parsed data to the relay on your home server; this phone picks " +
                    "it up from there.",
            )
            Spacer(Modifier.height(12.dp))
            MetaText(
                if (state.relayUrl.isBlank()) "RELAY NOT CONFIGURED" else "RELAY ${state.relayUrl}",
                if (state.relayUrl.isBlank()) c.warn else c.ink3,
            )
            Spacer(Modifier.height(12.dp))
            DccButton("Open settings", Modifier.fillMaxWidth(), BtnStyle.PRIMARY) { onOpenSettings() }
        }

        Spacer(Modifier.height(10.dp))

        DccCard {
            Kicker("Not built yet", c.ink3)
            Spacer(Modifier.height(8.dp))
            BodySerif(
                "The relay service and the PC save agent do not exist yet, so there is no way " +
                    "for real data to arrive. Until they do, Settings can load a sample dynasty " +
                    "so you can see how the screens work — it is invented data, not your save.",
            )
        }

        Spacer(Modifier.height(24.dp))
    }
}
