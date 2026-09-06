package com.dcc.app.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.Image
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.dcc.app.data.ArtPack
import java.io.File
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dcc.app.data.Rules
import com.dcc.app.ui.theme.Dcc
import com.dcc.app.ui.theme.LocalFlipHelmets
import com.dcc.app.ui.theme.initialsOf
import com.dcc.app.ui.theme.toneFor

// ── type roles ───────────────────────────────────────────────────────────────

@Composable
fun ScreenTitle(text: String, modifier: Modifier = Modifier) = Text(
    text,
    modifier = modifier,
    style = TextStyle(
        fontFamily = Dcc.fonts.serif, fontWeight = FontWeight.SemiBold,
        fontSize = 26.sp, lineHeight = 26.sp, color = Dcc.colors.ink,
    ),
)

@Composable
fun Kicker(text: String, color: Color = Dcc.colors.accent, modifier: Modifier = Modifier) = Text(
    text.uppercase(),
    modifier = modifier,
    style = TextStyle(
        fontFamily = Dcc.fonts.mono, fontWeight = FontWeight.SemiBold,
        fontSize = 10.sp, letterSpacing = 2.sp, color = color,
    ),
)

@Composable
fun MetaText(
    text: String,
    color: Color = Dcc.colors.ink3,
    size: Int = 10,
    modifier: Modifier = Modifier,
    maxLines: Int = 2,
) = Text(
    text,
    modifier = modifier,
    maxLines = maxLines,
    overflow = TextOverflow.Ellipsis,
    style = TextStyle(
        fontFamily = Dcc.fonts.mono, fontWeight = FontWeight.Normal,
        fontSize = size.sp, letterSpacing = 0.8.sp, color = color,
    ),
)

@Composable
fun MonoLabel(
    text: String,
    color: Color = Dcc.colors.ink2,
    size: Int = 10,
    modifier: Modifier = Modifier,
) = Text(
    text,
    modifier = modifier,
    style = TextStyle(
        fontFamily = Dcc.fonts.mono, fontWeight = FontWeight.SemiBold,
        fontSize = size.sp, letterSpacing = 1.4.sp, color = color,
    ),
)

@Composable
fun Headline(text: String, color: Color = Dcc.colors.ink, size: Int = 17, modifier: Modifier = Modifier) = Text(
    text,
    modifier = modifier,
    style = TextStyle(
        fontFamily = Dcc.fonts.serif, fontWeight = FontWeight.Medium,
        fontSize = size.sp, lineHeight = (size * 1.3).sp, color = color,
    ),
)

@Composable
fun RowTitle(text: String, color: Color = Dcc.colors.ink, size: Int = 15, modifier: Modifier = Modifier) = Text(
    text,
    modifier = modifier,
    maxLines = 1,
    overflow = TextOverflow.Ellipsis,
    style = TextStyle(
        fontFamily = Dcc.fonts.serif, fontWeight = FontWeight.Medium,
        fontSize = size.sp, color = color,
    ),
)

@Composable
fun BodySerif(text: String, color: Color = Dcc.colors.ink2, modifier: Modifier = Modifier) = Text(
    text,
    modifier = modifier,
    style = TextStyle(
        fontFamily = Dcc.fonts.serif, fontWeight = FontWeight.Normal,
        fontSize = 13.5.sp, lineHeight = 21.8.sp, color = color,
    ),
)

@Composable
fun NumText(
    text: String,
    color: Color = Dcc.colors.ink2,
    size: Int = 13,
    weight: FontWeight = FontWeight.Normal,
    modifier: Modifier = Modifier,
) = Text(
    text,
    modifier = modifier,
    maxLines = 1,
    style = TextStyle(fontFamily = Dcc.fonts.mono, fontWeight = weight, fontSize = size.sp, color = color),
)

// ── containers ───────────────────────────────────────────────────────────────

@Composable
fun DccCard(
    modifier: Modifier = Modifier,
    borderColor: Color = Dcc.colors.surfaceLine,
    background: Color = Dcc.colors.surface,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Dcc.shapes.card))
            .background(background)
            .border(1.dp, borderColor, RoundedCornerShape(Dcc.shapes.card))
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)
            .padding(horizontal = 16.dp, vertical = 13.dp),
        content = content,
    )
}

@Composable
fun SectionHeader(title: String, sub: (@Composable () -> Unit)? = null, right: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(bottom = 14.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                ScreenTitle(title)
                if (sub != null) Spacer(Modifier.height(7.dp))
                sub?.invoke()
            }
            right?.invoke()
        }
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().height(2.dp).background(Dcc.colors.rule))
    }
}

@Composable
fun EmptyState(text: String) = MetaText(text, Dcc.colors.ink4, 11, Modifier.padding(vertical = 24.dp))

/** A hairline between two blocks inside a card. */
@Composable
fun Rule() = Box(
    Modifier
        .fillMaxWidth()
        .height(1.dp)
        .background(Dcc.colors.line),
)

// ── controls ─────────────────────────────────────────────────────────────────

enum class BtnStyle { PRIMARY, SECONDARY, ACCENT, DEAD }

@Composable
fun DccButton(
    text: String,
    modifier: Modifier = Modifier,
    style: BtnStyle = BtnStyle.SECONDARY,
    enabled: Boolean = true,
    small: Boolean = false,
    onClick: () -> Unit = {},
) {
    val c = Dcc.colors
    val bg = when (style) {
        BtnStyle.PRIMARY -> c.btnBg
        BtnStyle.ACCENT -> c.accent
        else -> Color.Transparent
    }
    val ink = when (style) {
        BtnStyle.PRIMARY -> c.btnInk
        BtnStyle.ACCENT -> c.onAccent
        BtnStyle.DEAD -> c.ink4
        else -> c.btn2Ink
    }
    val border = if (style == BtnStyle.SECONDARY || style == BtnStyle.DEAD) c.btn2Line else Color.Transparent
    val clickable = enabled && style != BtnStyle.DEAD

    Box(
        modifier
            // Touch targets stay at or above 44dp; small chips sit inside a
            // larger row so the tappable area is still comfortable.
            .heightIn(min = if (small) 32.dp else 44.dp)
            .clip(RoundedCornerShape(Dcc.shapes.button))
            .background(if (clickable) bg else bg.copy(alpha = 0.38f))
            .border(1.dp, border, RoundedCornerShape(Dcc.shapes.button))
            .then(if (clickable) Modifier.clickable { onClick() } else Modifier)
            .padding(horizontal = if (small) 10.dp else 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text.uppercase(),
            style = TextStyle(
                fontFamily = Dcc.fonts.mono, fontWeight = FontWeight.SemiBold,
                fontSize = if (small) 10.sp else 12.sp, letterSpacing = 1.5.sp,
                color = if (clickable) ink else ink.copy(alpha = 0.5f),
            ),
        )
    }
}

@Composable
fun DccChip(
    text: String,
    selected: Boolean = false,
    accent: Boolean = false,
    modifier: Modifier = Modifier,
    onClick: () -> Unit = {},
) {
    val c = Dcc.colors
    val bg = if (!selected) Color.Transparent else if (accent) c.accent else c.btnBg
    val ink = if (!selected) c.ink3 else if (accent) c.onAccent else c.btnInk
    Box(
        modifier
            .heightIn(min = 30.dp)
            .clip(CircleShape)
            .background(bg)
            .border(1.dp, if (selected) bg else c.surfaceLine, CircleShape)
            .clickable { onClick() }
            .padding(horizontal = 11.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text.uppercase(),
            maxLines = 1,
            style = TextStyle(
                fontFamily = Dcc.fonts.mono, fontWeight = FontWeight.SemiBold,
                fontSize = 9.5.sp, letterSpacing = 1.sp, color = ink,
            ),
        )
    }
}

@Composable
fun StagePill(text: String, color: Color, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Box(
        modifier
            .heightIn(min = 24.dp)
            .clip(CircleShape)
            .border(1.dp, color, CircleShape)
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)
            .padding(horizontal = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            maxLines = 1,
            style = TextStyle(
                fontFamily = Dcc.fonts.mono, fontWeight = FontWeight.SemiBold,
                fontSize = 9.5.sp, letterSpacing = 1.sp, color = color,
            ),
        )
    }
}

@Composable
fun DccField(
    value: String,
    placeholder: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    /** Masks what is typed, for the tokens that are the whole access control. */
    secret: Boolean = false,
    onValueChange: (String) -> Unit,
) {
    val c = Dcc.colors
    Box(
        modifier
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(Dcc.shapes.button))
            .background(c.bar)
            .border(1.dp, c.surfaceLine, RoundedCornerShape(Dcc.shapes.button))
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty()) MetaText(placeholder, c.ink4, 11, maxLines = 1)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            singleLine = true,
            visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
            // A token is neither a word nor a sentence, so the keyboard should
            // not be trying to help with either.
            keyboardOptions = KeyboardOptions(
                keyboardType = if (secret) KeyboardType.Password else KeyboardType.Text,
            ),
            cursorBrush = SolidColor(c.accent),
            textStyle = TextStyle(
                fontFamily = Dcc.fonts.mono, fontSize = 12.sp, letterSpacing = 0.6.sp, color = c.ink,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
fun Stepper(value: Int, min: Int, max: Int, step: Int = 1, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        DccButton("−", small = true, enabled = value > min) { onChange((value - step).coerceAtLeast(min)) }
        NumText(
            value.toString(), Dcc.colors.ink, 16, FontWeight.SemiBold,
            Modifier.widthIn(min = 52.dp),
        )
        DccButton("+", small = true, enabled = value < max) { onChange((value + step).coerceAtMost(max)) }
    }
}

@Composable
fun DccToggle(on: Boolean, label: String, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.heightIn(min = 44.dp).clickable { onChange(!on) },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier.width(32.dp).height(18.dp).clip(CircleShape)
                .background(if (on) Dcc.colors.good else Dcc.colors.line),
            contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart,
        ) {
            Box(
                Modifier.padding(horizontal = 2.dp).size(14.dp).clip(CircleShape)
                    .background(if (on) Dcc.colors.bg0 else Dcc.colors.ink4),
            )
        }
        MetaText(label)
    }
}

// ── status ───────────────────────────────────────────────────────────────────

@Composable
fun DccTrack(value: Int, max: Int = 100, brush: Brush? = null, color: Color? = null, height: Dp = 4.dp) {
    val c = Dcc.colors
    Box(Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(3.dp)).background(c.track)) {
        Box(
            Modifier
                .fillMaxWidth(if (max <= 0) 0f else (value.toFloat() / max).coerceIn(0f, 1f))
                .fillMaxHeight()
                .clip(RoundedCornerShape(3.dp))
                .then(
                    when {
                        color != null -> Modifier.background(color)
                        brush != null -> Modifier.background(brush)
                        else -> Modifier.background(c.accent)
                    },
                ),
        )
    }
}

@Composable
fun HeatMeter(heat: Int, compact: Boolean = false) {
    val c = Dcc.colors
    val past = heat >= Rules.HEAT_THRESHOLD
    Column(Modifier.widthIn(min = if (compact) 110.dp else 160.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            MonoLabel("HEAT", c.ink3, 9)
            NumText(heat.toString(), if (past) c.accent else c.ink, if (compact) 16 else 20, FontWeight.SemiBold)
        }
        Spacer(Modifier.height(4.dp))
        DccTrack(heat, brush = c.heatFill)
        Spacer(Modifier.height(3.dp))
        MetaText("THRESHOLD ${Rules.HEAT_THRESHOLD}", c.ink3, 9)
    }
}

@Composable
fun SyncDot(visible: Boolean) {
    if (!visible) return
    MonoLabel("● QUEUED", Dcc.colors.warn, 9)
}

@Composable
fun StateTag(state: String) {
    val c = Dcc.colors
    MonoLabel(
        state,
        when (state) {
            "APPLIED" -> c.good
            "FAILED" -> c.accent
            else -> c.warn
        },
        9,
    )
}

@Composable
fun toneColor(tone: Rules.Tone): Color = when (tone) {
    Rules.Tone.GOOD -> Dcc.colors.good
    Rules.Tone.WARN -> Dcc.colors.warn
    Rules.Tone.ACCENT -> Dcc.colors.accent
    Rules.Tone.INK3 -> Dcc.colors.ink3
    Rules.Tone.INK4 -> Dcc.colors.ink4
}

// ── identity marks ───────────────────────────────────────────────────────────

/**
 * Player portrait. With no image provider the initials fallback is the finished
 * state, not a placeholder — every screen has to look complete without media.
 */
@Composable
fun Portrait(name: String, size: Dp = 32.dp, generating: Boolean = false) {
    val c = Dcc.colors
    if (generating) {
        val transition = rememberInfiniteTransition(label = "portrait")
        val alpha by transition.animateFloat(
            initialValue = 0.4f, targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(1200), RepeatMode.Reverse),
            label = "dots",
        )
        Box(
            Modifier.size(size).clip(CircleShape).border(1.5.dp, c.ink4, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "···",
                style = TextStyle(
                    fontFamily = Dcc.fonts.mono, fontWeight = FontWeight.SemiBold,
                    fontSize = (size.value * 0.34).sp, color = c.ink4.copy(alpha = alpha),
                ),
            )
        }
        return
    }
    Box(
        Modifier.size(size).clip(CircleShape).background(toneFor(name, c.tones))
            .border(1.dp, c.surfaceLine, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initialsOf(name),
            style = TextStyle(
                fontFamily = Dcc.fonts.serif, fontWeight = FontWeight.Medium,
                fontSize = (size.value * 0.36).sp, color = c.ink,
            ),
        )
    }
}

/**
 * A school, wherever one is named: its own mark when the art pack has it, and
 * the two-letter disc when it does not.
 *
 * Every screen that names a school already went through here, so teaching this
 * one composable to look in the art pack put logos on all of them at once —
 * standings, scores, the recruiting board, the transfer list. The first version
 * of the pack shipped with a `SchoolMark` composable that nothing called, which
 * is why 143 schools of art arrived on the phone and none of it appeared.
 */
@Composable
fun SchoolBadge(
    monogram: String,
    name: String,
    isUser: Boolean,
    size: Dp = 22.dp,
    kind: String = "logo",
) {
    val c = Dcc.colors
    val context = LocalContext.current
    // Which way a helmet looks.
    //
    // A pack built before the helmets were split holds ONE per school, and
    // which of the two it is was never recorded: the old builder matched the
    // game's `lthelmets` and `rthelmets` with a single pattern and kept
    // whichever it reached last. Two releases went on guessing at that — first
    // mirroring the unknown image, then refusing to mirror it at all — and both
    // were coin flips dressed up as reasoning. It is not a guess: a folder walk
    // reaches `helmet/left` before `helmet/right`, so the last write is the
    // right helmet, and that one faces left.
    //
    // `flip` says the lone helmet faces left. Its default is derived from the
    // pack version rather than guessed — see ArtPack.loneHelmetFacesLeft — and
    // Settings can override it, because what the person can see beats a
    // derivation about somebody else's folder order. When it is on, a helmet
    // asked for by its left-hand name is mirrored and the right-hand one is
    // drawn as it is; when off, the other way round.
    //
    // A pack that carries both helmets never mirrors anything: the art is
    // already correct, and rebuilding on the PC is still the real fix.
    val split = remember(name) { ArtPack.hasSplitHelmets(context, name) }
    // Nobody has said, so the pack's own version decides. A version 1 pack holds
    // the right helmet — the walk reaches `helmet/left` before `helmet/right`
    // and the last write won — and that one faces left.
    val flip = LocalFlipHelmets.current ?: remember { ArtPack.loneHelmetFacesLeft(context) }
    val helmet = kind == "helmet" || kind == "helmetRight"
    val mirror = remember(kind, split, flip, helmet) {
        helmet && !split && (if (flip) kind == "helmet" else kind == "helmetRight")
    }
    val file = remember(name, kind, split, helmet) {
        // With one helmet in the pack, both sides draw it; the mirror above is
        // what makes them a pair.
        ArtPack.school(context, name, if (helmet && !split) "helmet" else kind)
    }

    // A logo is drawn as itself, on nothing: these marks carry their own shape,
    // and a coloured disc behind one only makes it harder to read.
    if (file != null) {
        Box(Modifier.size(size), contentAlignment = Alignment.Center) {
            val art = if (mirror) Modifier.size(size).scale(scaleX = -1f, scaleY = 1f) else Modifier.size(size)
            // A `return` here would be a non-local return out of a lambda that
            // is not inline, which does not compile; the flag is the way.
            val drawn = ArtImage(file, art)
            if (!drawn) MonoLabel(monogram, c.ink3, (size.value * 0.34f).toInt().coerceAtLeast(7))
        }
        return
    }

    Box(
        Modifier.size(size).clip(CircleShape)
            .background(if (isUser) c.accent else toneFor(name, c.tones))
            .border(1.dp, if (isUser) c.accent else c.surfaceLine, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            monogram,
            style = TextStyle(
                fontFamily = Dcc.fonts.serif, fontWeight = FontWeight.Medium,
                fontSize = (size.value * 0.42).sp, color = if (isUser) c.onAccent else c.ink,
            ),
        )
    }
}

@Composable
fun StarRow(stars: Int, size: Int = 10) = Text(
    Rules.stars(stars),
    style = TextStyle(fontFamily = Dcc.fonts.mono, fontSize = size.sp, color = Dcc.colors.accent),
)

@Composable
fun BorderCard(
    borderColor: Color,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) = DccCard(modifier, borderColor = borderColor, content = content)

@Composable
fun EffectCallout(text: String) {
    val c = Dcc.colors
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(2.dp)).background(c.effectBg)) {
        Box(Modifier.width(2.dp).heightIn(min = 34.dp).background(c.accent))
        Text(
            text,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
            style = TextStyle(
                fontFamily = Dcc.fonts.mono, fontSize = 10.5.sp,
                letterSpacing = 0.6.sp, lineHeight = 16.sp, color = c.effectInk,
            ),
        )
    }
}

/* ── the art pack ──────────────────────────────────────────────────────────── */

/**
 * An image out of the art pack, or nothing at all.
 *
 * Nothing rather than a placeholder: every caller already draws something when
 * there is no picture — initials for a face, a monogram for a school — and a
 * broken-image box in its place would be worse than the fallback it replaced.
 *
 * The file is decoded off the main thread the first time and cached after, so a
 * grid of eighty-five cards asking for the same crest decodes it once.
 */
@Composable
fun ArtImage(
    file: File?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Fit,
    alpha: Float = 1f,
    alignment: Alignment = Alignment.Center,
): Boolean {
    if (file == null) return false
    val bitmap by produceState<ImageBitmap?>(null, file.path) {
        value = withContext(Dispatchers.IO) { ArtPack.bitmap(file)?.asImageBitmap() }
    }
    val bmp = bitmap ?: return false
    Image(
        bitmap = bmp,
        contentDescription = null,
        modifier = modifier,
        contentScale = contentScale,
        alignment = alignment,
        alpha = alpha,
    )
    return true
}

/**
 * A player in his school's kit, at any size.
 *
 * The portrait and the jersey are drawn into the same box with the same crop,
 * so whatever their own canvases are they stay registered to each other — and
 * the two numbers that line them up ride in the art pack, set once on the PC.
 * Every avatar, card and row uses this, which is what makes a player look the
 * same everywhere instead of once per screen.
 *
 * The jersey goes over the portrait, not under it: the game's renders ship
 * wearing a generic grey shirt, and covering it is the whole job.
 */
@Composable
fun PlayerKit(
    face: File?,
    jersey: File?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val fit = remember { ArtPack.fit(context) }
    Box(modifier) {
        ArtImage(
            face, Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop, alignment = Alignment.TopCenter,
        )
        if (jersey != null) {
            ArtImage(
                jersey,
                Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        scaleX = fit.jerseyScale
                        scaleY = fit.jerseyScale
                        transformOrigin = TransformOrigin(0.5f, 1f)
                        translationY = size.height * fit.jerseyDrop / 100f
                    },
                contentScale = ContentScale.Crop, alignment = Alignment.TopCenter,
            )
        }
    }
}

/**
 * A trophy, bowl crest or playoff mark from the art pack, or nothing.
 *
 * Nothing rather than a placeholder: these sit beside a label that already says
 * what the thing is, so a missing image costs a picture and not a meaning.
 */
@Composable
fun AwardMark(key: String, size: Dp = 24.dp) {
    val context = LocalContext.current
    val file = remember(key) { ArtPack.award(context, key) }
    if (file != null) ArtImage(file, Modifier.size(size))
}

@Composable
fun PlayerFace(
    name: String,
    assetId: String?,
    size: Dp,
    /** The school he plays for, so he wears its jersey rather than a grey shirt. */
    school: String? = null,
    tint: Color? = null,
) {
    val context = LocalContext.current
    val file = remember(assetId) { ArtPack.player(context, assetId) }
    val jersey = remember(school) { ArtPack.school(context, school, "jersey") }
    if (file == null) {
        Portrait(name, size)
        return
    }
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .then(if (tint != null) Modifier.background(tint) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        PlayerKit(file, jersey, Modifier.fillMaxSize())
    }
}
