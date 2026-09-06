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
 * How a theme is assembled. The values live in Tokens.kt, generated from
 * shared/tokens.json — edit those there, not here.
 *
 * Gold Standard is the default and the only theme with a mode and a
 * user-chosen accent. It stores one hex: the light-mode accent is the same hue
 * with its luminance dropped, and every border, rule and wash is mixed from
 * whichever of the two is in play. That is what makes an arbitrary pick off the
 * colour wheel safe, and it is the same derivation the desktop does in CSS.
 *
 * Night Wire and Field Office are the working themes and name every colour
 * outright, so nothing about them is derived.
 */

/** What a screen reads. Every field is resolved — no nulls past this point. */
@Immutable
data class DccColors(
    val bg0: Color,
    val bar: Color,
    val surface: Color,
    val surfaceStrong: Color,
    val surfaceLine: Color,
    val line: Color,
    val track: Color,
    val rule: Color,
    val sheet: Color,
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
    /** The two washes behind the page. Transparent in the working themes. */
    val haze: Color,
    val haze2: Color,
)

/** Drops a colour's luminance toward the same hue, for the light ground. */
fun darken(c: Color, amount: Float = 0.42f): Color =
    Color(
        red = c.red * (1f - amount),
        green = c.green * (1f - amount),
        blue = c.blue * (1f - amount),
        alpha = c.alpha,
    )

/** Parses `#RRGGBB`, falling back to the champagne default on anything else. */
fun accentOf(hex: String): Color {
    val clean = hex.trim().removePrefix("#")
    val n = clean.toLongOrNull(16)
    return if (clean.length == 6 && n != null) Color(0xFF000000 or n) else DccAccents.first().dark
}

/**
 * Fills a palette's derived fields from the accent in play.
 *
 * A theme that names a border keeps it; only the nulls — which is to say only
 * Gold Standard — are mixed here, at the same ratios the stylesheet uses.
 */
private fun resolve(p: DccPalette, accent: Color, derived: Boolean): DccColors {
    val line = p.line ?: accent.copy(alpha = if (derived) 0.22f else 1f)
    val lineStrong = p.btn2Line ?: accent.copy(alpha = 0.50f)
    return DccColors(
        bg0 = p.bg0,
        bar = p.bar,
        surface = p.surface,
        surfaceStrong = p.surfaceStrong,
        surfaceLine = p.surfaceLine ?: line,
        line = line,
        track = p.track,
        rule = p.rule ?: line,
        sheet = p.sheet,
        ink = p.ink,
        ink2 = p.ink2,
        ink3 = p.ink3,
        ink4 = p.ink4,
        accent = accent,
        onAccent = p.onAccent,
        good = p.good,
        warn = p.warn,
        btnBg = p.btnBg ?: accent,
        btnInk = p.btnInk,
        btn2Line = lineStrong,
        btn2Ink = p.btn2Ink,
        heroBg = p.heroBg,
        heroInk = p.heroInk,
        heroInk2 = p.heroInk2,
        effectBg = p.effectBg,
        effectInk = p.effectInk,
        heatBoxBg = p.heatBoxBg,
        heatFill = Brush.horizontalGradient(
            if (derived) listOf(accent, p.ink3) else p.heatStops,
        ),
        tones = p.tones,
        // Lighter than the desktop's 14/8 on purpose. Both apps paint the haze
        // as two corner glows, but a phone is narrow enough that the same glow
        // covers proportionally far more of the screen, and a saturated accent
        // at desktop strength stops reading as a wash over black and starts
        // reading as the background colour itself.
        haze = if (derived) accent.copy(alpha = 0.10f) else Color.Transparent,
        haze2 = if (derived) accent.copy(alpha = 0.06f) else Color.Transparent,
    )
}

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

private val BodoniModa = FontFamily(
    Font(R.font.bodoni_moda_500, FontWeight.Medium),
    Font(R.font.bodoni_moda_600, FontWeight.SemiBold),
    Font(R.font.bodoni_moda_700, FontWeight.Bold),
)
private val Manrope = FontFamily(
    Font(R.font.manrope_400, FontWeight.Normal),
    Font(R.font.manrope_500, FontWeight.Medium),
    Font(R.font.manrope_600, FontWeight.SemiBold),
    Font(R.font.manrope_700, FontWeight.Bold),
)

private val NightFonts = DccFonts(serif = Newsreader, mono = IbmPlexMono, sans = PublicSans)
private val FieldFonts = DccFonts(serif = ZillaSlab, mono = CourierPrime, sans = PublicSans)
// Bodoni carries every headline and every number read as data; Manrope carries
// everything functional. Gold Standard has no monospace register, so the mono
// slot is Manrope too.
private val GoldFonts = DccFonts(serif = BodoniModa, mono = Manrope, sans = Manrope)

private val NightShapes = DccRadii.getValue("night")
private val FieldShapes = DccRadii.getValue("field")
private val GoldShapes = DccRadii.getValue("gold")

private val NightWire = resolve(NightWirePalette, NightWirePalette.accent!!, derived = false)

/**
 * Whether a pack's lone helmet faces left rather than right.
 *
 * It rides here because the component that needs it — `SchoolBadge` — is a leaf
 * drawn from eight different screens, and threading a boolean through all of
 * them to reach it would be worse than the problem.
 *
 * Null means nobody has said: the pack's own version decides, in
 * `ArtPack.loneHelmetFacesLeft`. See Persisted.helmetsFlipped.
 */
val LocalFlipHelmets = staticCompositionLocalOf<Boolean?> { null }

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
fun DccTheme(
    theme: String,
    mode: String = "dark",
    accent: String = "",
    flipHelmets: Boolean? = null,
    content: @Composable () -> Unit,
) {
    val colors = when (theme) {
        "field" -> resolve(FieldOfficePalette, FieldOfficePalette.accent!!, derived = false)
        "night" -> NightWire
        else -> {
            val light = mode == "light"
            val picked = accentOf(accent)
            resolve(
                if (light) GoldLightPalette else GoldDarkPalette,
                if (light) darken(picked) else picked,
                derived = true,
            )
        }
    }
    CompositionLocalProvider(
        LocalFlipHelmets provides flipHelmets,
        LocalDccColors provides colors,
        LocalDccFonts provides when (theme) {
            "field" -> FieldFonts
            "night" -> NightFonts
            else -> GoldFonts
        },
        LocalDccShapes provides when (theme) {
            "field" -> FieldShapes
            "night" -> NightShapes
            else -> GoldShapes
        },
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
