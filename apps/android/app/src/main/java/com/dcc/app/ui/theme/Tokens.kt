package com.dcc.app.ui.theme

// GENERATED FROM shared/tokens.json BY scripts/generate-theme.mjs — DO NOT EDIT.
// Run `node scripts/generate-theme.mjs` after changing the shared tokens; CI
// fails if this file and the generator disagree.

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** One theme's fixed colours. Gold Standard's accent-derived values are not
 *  here — they are mixed at runtime from whichever accent the user picked. */
@Immutable
data class DccPalette(
    val bg0: Color,
    val bar: Color,
    val surface: Color,
    val surfaceStrong: Color,
    val surfaceLine: Color?,
    val line: Color?,
    val track: Color,
    val rule: Color?,
    val sheet: Color,
    val ink: Color,
    val ink2: Color,
    val ink3: Color,
    val ink4: Color,
    val accent: Color?,
    val onAccent: Color,
    val good: Color,
    val warn: Color,
    val btnBg: Color?,
    val btnInk: Color,
    val btn2Line: Color?,
    val btn2Ink: Color,
    val heroBg: Color,
    val heroInk: Color,
    val heroInk2: Color,
    val effectBg: Color,
    val effectInk: Color,
    val heatBoxBg: Color,
    val heatStops: List<Color>,
    val tones: List<Color>,
)

/** A seeded accent: one hex for the dark ground, one darkened for the light. */
@Immutable
data class DccAccent(val id: String, val label: String, val dark: Color, val light: Color)

@Immutable
data class DccShapes(val button: Dp, val card: Dp, val bubble: Dp)

/** Night Wire. */
val NightWirePalette = DccPalette(
    bg0 = Color(0xFF000000),
    bar = Color(0xFF080808),
    surface = Color(0xFF121212),
    surfaceStrong = Color(0xFF121212),
    surfaceLine = Color(0xFF262626),
    line = Color(0xFF1E1E1E),
    track = Color(0xFF1E1E1E),
    rule = Color(0xFFFFFFFF),
    sheet = Color(0xFF121212),
    ink = Color(0xFFFFFFFF),
    ink2 = Color(0xFFC8C8C8),
    ink3 = Color(0xFF8E8E8E),
    ink4 = Color(0xFF5A5A5A),
    accent = Color(0xFFDC2626),
    onAccent = Color(0xFFFFFFFF),
    good = Color(0xFF5FAF6E),
    warn = Color(0xFFD9A441),
    btnBg = Color(0xFFFFFFFF),
    btnInk = Color(0xFF000000),
    btn2Line = Color(0xFF333333),
    btn2Ink = Color(0xFF9A9A9A),
    heroBg = Color(0xFF121212),
    heroInk = Color(0xFFFFFFFF),
    heroInk2 = Color(0xFFC8C8C8),
    effectBg = Color(0xFF141414),
    effectInk = Color(0xFFD0D0D0),
    heatBoxBg = Color(0xFF160A0A),
    heatStops = listOf(Color(0xFFDC2626)),
    tones = listOf(Color(0xFF1C1C1C), Color(0xFF222222), Color(0xFF191919), Color(0xFF252525), Color(0xFF1F1F1F), Color(0xFF2A2A2A)),
)

/** Field Office. */
val FieldOfficePalette = DccPalette(
    bg0 = Color(0xFF1B241F),
    bar = Color(0xFF141B17),
    surface = Color(0xFF222D26),
    surfaceStrong = Color(0xFF222D26),
    surfaceLine = Color(0xFF34443B),
    line = Color(0xFF34443B),
    track = Color(0xFF141B17),
    rule = Color(0xFFEFE7D5),
    sheet = Color(0xFF222D26),
    ink = Color(0xFFEFE7D5),
    ink2 = Color(0xFFC9C2AC),
    ink3 = Color(0xFF8FA294),
    ink4 = Color(0xFF6D7F72),
    accent = Color(0xFFC4502B),
    onAccent = Color(0xFFEFE7D5),
    good = Color(0xFF7A8F5F),
    warn = Color(0xFFC9873A),
    btnBg = Color(0xFF2A2318),
    btnInk = Color(0xFFEFE7D5),
    btn2Line = Color(0xFF34443B),
    btn2Ink = Color(0xFF8FA294),
    heroBg = Color(0xFFEFE7D5),
    heroInk = Color(0xFF2A2318),
    heroInk2 = Color(0xFF4C4436),
    effectBg = Color(0xFFE3D7BD),
    effectInk = Color(0xFF4C4436),
    heatBoxBg = Color(0xFF141B17),
    heatStops = listOf(Color(0xFF7A8F5F), Color(0xFFC9873A), Color(0xFFC4502B)),
    tones = listOf(Color(0xFF3A4536), Color(0xFF4A3D2E), Color(0xFF37453F), Color(0xFF453231), Color(0xFF3C4030), Color(0xFF31404A)),
)

/** Gold Standard. */
val GoldDarkPalette = DccPalette(
    bg0 = Color(0xFF09090B),
    bar = Color(0xFF050506),
    surface = Color(0x08FFFFFF),
    surfaceStrong = Color(0x12FFFFFF),
    surfaceLine = null,
    line = null,
    track = Color(0xFF1F1D18),
    rule = null,
    sheet = Color(0xFF0F0F12),
    ink = Color(0xFFF4ECD8),
    ink2 = Color(0xFFB3AC9A),
    ink3 = Color(0xFF8E8878),
    ink4 = Color(0xFF6E695C),
    accent = null,
    onAccent = Color(0xFF111111),
    good = Color(0xFF6FBF87),
    warn = Color(0xFFD8B25E),
    btnBg = null,
    btnInk = Color(0xFF111111),
    btn2Line = null,
    btn2Ink = Color(0xFFB3AC9A),
    heroBg = Color(0x12FFFFFF),
    heroInk = Color(0xFFF4ECD8),
    heroInk2 = Color(0xFFB3AC9A),
    effectBg = Color(0x08FFFFFF),
    effectInk = Color(0xFFB3AC9A),
    heatBoxBg = Color(0x12FFFFFF),
    heatStops = listOf(Color(0xFFD4AF5A), Color(0xFFB3AC9A)),
    tones = listOf(Color(0xFF1A1916), Color(0xFF201E1A), Color(0xFF171613), Color(0xFF232019), Color(0xFF1D1B17), Color(0xFF26231C)),
)

/** Gold Standard — light mode. */
val GoldLightPalette = DccPalette(
    bg0 = Color(0xFFF5F1E8),
    bar = Color(0xFFECE7DC),
    surface = Color(0xFFFFFFFF),
    surfaceStrong = Color(0xFFEBE5D8),
    surfaceLine = null,
    line = null,
    track = Color(0xFFE6E0D2),
    rule = null,
    sheet = Color(0xFFFAF7F0),
    ink = Color(0xFF15130F),
    ink2 = Color(0xFF4C4638),
    ink3 = Color(0xFF7A7262),
    ink4 = Color(0xFF9A9182),
    accent = null,
    onAccent = Color(0xFFFFFFFF),
    good = Color(0xFF1F6B3A),
    warn = Color(0xFF8A6B1F),
    btnBg = null,
    btnInk = Color(0xFFFFFFFF),
    btn2Line = null,
    btn2Ink = Color(0xFF4C4638),
    heroBg = Color(0xFFEBE5D8),
    heroInk = Color(0xFF15130F),
    heroInk2 = Color(0xFF4C4638),
    effectBg = Color(0xFFFFFFFF),
    effectInk = Color(0xFF4C4638),
    heatBoxBg = Color(0xFFEBE5D8),
    heatStops = listOf(Color(0xFFD4AF5A), Color(0xFFB3AC9A)),
    tones = listOf(Color(0xFF1A1916), Color(0xFF201E1A), Color(0xFF171613), Color(0xFF232019), Color(0xFF1D1B17), Color(0xFF26231C)),
)

/** The four presets Settings seeds the wheel with. */
val DccAccents = listOf(
    DccAccent("champagne", "Champagne", Color(0xFFD4AF5A), Color(0xFF8A6B1F)),
    DccAccent("crimson", "Crimson", Color(0xFFD63A55), Color(0xFF8F1330)),
    DccAccent("forest", "Forest", Color(0xFF5CB27A), Color(0xFF1F5E37)),
    DccAccent("royal", "Royal", Color(0xFFA78BFA), Color(0xFF4B2A7A)),
)

val DccRadii = mapOf(
    "night" to DccShapes(button = 4.dp, card = 6.dp, bubble = 14.dp),
    "field" to DccShapes(button = 6.dp, card = 6.dp, bubble = 12.dp),
    "gold" to DccShapes(button = 2.dp, card = 8.dp, bubble = 18.dp),
)

/** The theme ids this build knows, in the order Settings lists them. */
val DccThemeIds = listOf("gold", "field", "night")

val DccThemeLabels = mapOf(
    "night" to "Night Wire",
    "field" to "Field Office",
    "gold" to "Gold Standard",
)
