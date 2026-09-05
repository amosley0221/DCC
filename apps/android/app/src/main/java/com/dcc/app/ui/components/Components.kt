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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
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
 * School badge. Real marks are licensed art the app cannot ship, so this is a
 * fictional monogram — the same slot an extracted logo would fill later.
 */
@Composable
fun SchoolBadge(monogram: String, name: String, isUser: Boolean, size: Dp = 22.dp) {
    val c = Dcc.colors
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
