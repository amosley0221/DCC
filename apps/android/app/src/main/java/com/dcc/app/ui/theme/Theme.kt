package com.dcc.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dcc.app.R

/**
 * The token set from shared/tokens.json, expressed as Compose types. Both
 * themes ship; Night Wire is the default and the choice is a user setting.
 */
@Immutable
data class DccColors(
    val bg0: Color,
    val bar: Color,
    val surface: Color,
    val surfaceLine: Color,
    val line: Color,
    val track: Color,
    val rule: Color,
    val ink: Color,
    val ink2: Color,
    val ink3: Color,
    val ink4: Color,
    val accent: Color,
    val onAccent: Color,
    val good: Color,
    val warn: Color,
    val btnBg: Color,
    val btnInk: Color,
    val btn2Line: Color,
    val btn2Ink: Color,
    val heroBg: Color,
    val heroInk: Color,
    val heroInk2: Color,
    val effectBg: Color,
    val effectInk: Color,
    val heatBoxBg: Color,
    val heatFill: Brush,
    val tones: List<Color>,
)

private val NightWire = DccColors(
    bg0 = Color(0xFF131110),
    bar = Color(0xFF0E0C0B),
    surface = Color(0xFF171412),
    surfaceLine = Color(0xFF262220),
    line = Color(0xFF2A2624),
    track = Color(0xFF2A2624),
    rule = Color(0xFFEDE6DA),
    ink = Color(0xFFEDE6DA),
    ink2 = Color(0xFFB5ACA0),
    ink3 = Color(0xFF8D857A),
    ink4 = Color(0xFF6E675E),
    accent = Color(0xFFB33A2B),
    onAccent = Color(0xFFEDE6DA),
    good = Color(0xFF7D8F6A),
    warn = Color(0xFFC9873A),
    btnBg = Color(0xFFEDE6DA),
    btnInk = Color(0xFF131110),
    btn2Line = Color(0xFF3C3733),
    btn2Ink = Color(0xFF8D857A),
    heroBg = Color(0xFF171412),
    heroInk = Color(0xFFEDE6DA),
    heroInk2 = Color(0xFFB5ACA0),
    effectBg = Color(0xFF1E1A17),
    effectInk = Color(0xFFC8BFB2),
    heatBoxBg = Color(0xFF1E1613),
    heatFill = Brush.horizontalGradient(listOf(Color(0xFFB33A2B), Color(0xFFB33A2B))),
    tones = listOf(
        Color(0xFF3D2F2A), Color(0xFF2F3A34), Color(0xFF33313F),
        Color(0xFF3F382A), Color(0xFF2A3340), Color(0xFF3A2A33),
    ),
)

private val FieldOffice = DccColors(
    bg0 = Color(0xFF1B241F),
    bar = Color(0xFF141B17),
    surface = Color(0xFF222D26),
    surfaceLine = Color(0xFF34443B),
    line = Color(0xFF34443B),
    track = Color(0xFF141B17),
    rule = Color(0xFFEFE7D5),
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
    // In this theme the actionable card inverts onto paper.
    heroBg = Color(0xFFEFE7D5),
    heroInk = Color(0xFF2A2318),
    heroInk2 = Color(0xFF4C4436),
    effectBg = Color(0xFFE3D7BD),
    effectInk = Color(0xFF4C4436),
    heatBoxBg = Color(0xFF141B17),
    heatFill = Brush.horizontalGradient(
        listOf(Color(0xFF7A8F5F), Color(0xFFC9873A), Color(0xFFC4502B)),
    ),
    tones = listOf(
        Color(0xFF3A4536), Color(0xFF4A3D2E), Color(0xFF37453F),
        Color(0xFF453231), Color(0xFF3C4030), Color(0xFF31404A),
    ),
)

@Immutable
data class DccFonts(val serif: FontFamily, val mono: FontFamily, val sans: FontFamily)

private val Newsreader = FontFamily(
    Font(R.font.newsreader_400, FontWeight.Normal),
    Font(R.font.newsreader_500, FontWeight.Medium),
    Font(R.font.newsreader_600, FontWeight.SemiBold),
)
private val IbmPlexMono = FontFamily(
    Font(R.font.ibmplex_mono_400, FontWeight.Normal),
    Font(R.font.ibmplex_mono_600, FontWeight.SemiBold),
)
private val PublicSans = FontFamily(
    Font(R.font.public_sans_400, FontWeight.Normal),
    Font(R.font.public_sans_600, FontWeight.SemiBold),
)
private val ZillaSlab = FontFamily(
    Font(R.font.zilla_slab_400, FontWeight.Normal),
    Font(R.font.zilla_slab_500, FontWeight.Medium),
    Font(R.font.zilla_slab_600, FontWeight.SemiBold),
)
private val CourierPrime = FontFamily(
    Font(R.font.courier_prime_400, FontWeight.Normal),
    Font(R.font.courier_prime_700, FontWeight.SemiBold),
)

private val NightFonts = DccFonts(serif = Newsreader, mono = IbmPlexMono, sans = PublicSans)
private val FieldFonts = DccFonts(serif = ZillaSlab, mono = CourierPrime, sans = PublicSans)

@Immutable
data class DccShapes(val button: androidx.compose.ui.unit.Dp, val card: androidx.compose.ui.unit.Dp, val bubble: androidx.compose.ui.unit.Dp)

private val NightShapes = DccShapes(button = 4.dp, card = 6.dp, bubble = 14.dp)
private val FieldShapes = DccShapes(button = 6.dp, card = 6.dp, bubble = 12.dp)

val LocalDccColors = staticCompositionLocalOf { NightWire }
val LocalDccFonts = staticCompositionLocalOf { NightFonts }
val LocalDccShapes = staticCompositionLocalOf { NightShapes }

object Dcc {
    val colors: DccColors
        @Composable @ReadOnlyComposable get() = LocalDccColors.current
    val fonts: DccFonts
        @Composable @ReadOnlyComposable get() = LocalDccFonts.current
    val shapes: DccShapes
        @Composable @ReadOnlyComposable get() = LocalDccShapes.current
}

@Composable
fun DccTheme(theme: String, content: @Composable () -> Unit) {
    val field = theme == "field"
    CompositionLocalProvider(
        LocalDccColors provides if (field) FieldOffice else NightWire,
        LocalDccFonts provides if (field) FieldFonts else NightFonts,
        LocalDccShapes provides if (field) FieldShapes else NightShapes,
        content = content,
    )
}

/** Stable per-person tone so a player always gets the same avatar colour. */
fun toneFor(name: String, tones: List<Color>): Color {
    var h = 0
    for (c in name) h = (h * 31 + c.code) and 0x7fffffff
    return tones[h % tones.size]
}

fun initialsOf(name: String): String {
    val parts = name.trim().split(Regex("\\s+"))
    val first = parts.firstOrNull()?.firstOrNull() ?: ' '
    val last = parts.lastOrNull()?.firstOrNull() ?: ' '
    return "$first$last".uppercase()
}
