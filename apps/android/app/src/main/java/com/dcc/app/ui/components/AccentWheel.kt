package com.dcc.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.toSize
import com.dcc.app.ui.theme.Dcc
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The accent picker: a hue/saturation wheel with a brightness bar under it.
 *
 * Only one colour is stored, so this is the whole of the theme's colour
 * configuration — every border, rule and wash is mixed from whatever comes out
 * of here. A wheel rather than a row of swatches because the point is that any
 * hue works, not four blessed ones.
 *
 * Angle is hue, distance from the centre is saturation, and the bar is value.
 * Tapping or dragging anywhere inside the circle picks; outside it clamps to
 * the rim rather than doing nothing, which is what makes it usable with a
 * thumb.
 */
@Composable
fun AccentWheel(
    hex: String,
    onPick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = Dcc.colors
    val start = remember(hex) { hsvOf(parseHex(hex) ?: c.accent) }
    var hue by remember(hex) { mutableStateOf(start[0]) }
    var sat by remember(hex) { mutableStateOf(start[1]) }
    var value by remember(hex) { mutableStateOf(start[2]) }

    fun emit() = onPick(hexOf(Color.hsv(hue, sat, value)))

    Column(modifier) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1f)
                .pointerInput(Unit) {
                    fun pick(p: Offset, s: Size) {
                        val r = min(s.width, s.height) / 2f
                        val dx = p.x - s.width / 2f
                        val dy = p.y - s.height / 2f
                        val d = hypot(dx, dy)
                        // Outside the rim clamps rather than ignoring: a thumb
                        // that overshoots should still set the hue it aimed at.
                        sat = (d / r).coerceIn(0f, 1f)
                        hue = ((Math.toDegrees(atan2(dy, dx).toDouble()).toFloat() + 360f) % 360f)
                        emit()
                    }
                    detectTapGestures { pick(it, size.toSize()) }
                }
                .pointerInput(Unit) {
                    detectDragGestures { change, _ ->
                        val s = size.toSize()
                        val r = min(s.width, s.height) / 2f
                        val dx = change.position.x - s.width / 2f
                        val dy = change.position.y - s.height / 2f
                        sat = (hypot(dx, dy) / r).coerceIn(0f, 1f)
                        hue = ((Math.toDegrees(atan2(dy, dx).toDouble()).toFloat() + 360f) % 360f)
                        emit()
                    }
                },
        ) {
            Canvas(Modifier.fillMaxWidth().aspectRatio(1f)) {
                val r = min(size.width, size.height) / 2f
                val centre = Offset(size.width / 2f, size.height / 2f)
                // Hue around, saturation outward, value as a flat multiply so
                // the wheel dims with the bar instead of lying about the pick.
                drawCircle(
                    brush = Brush.sweepGradient(
                        (0..360 step 30).map { Color.hsv(it % 360f, 1f, value) },
                        center = centre,
                    ),
                    radius = r,
                    center = centre,
                )
                drawCircle(
                    brush = Brush.radialGradient(
                        listOf(Color.hsv(0f, 0f, value), Color.hsv(0f, 0f, value).copy(alpha = 0f)),
                        center = centre,
                        radius = r,
                    ),
                    radius = r,
                    center = centre,
                )
                // Where the current colour sits.
                val a = Math.toRadians(hue.toDouble())
                val knob = Offset(
                    centre.x + (cos(a) * r * sat).toFloat(),
                    centre.y + (sin(a) * r * sat).toFloat(),
                )
                drawCircle(Color.White, radius = 11f, center = knob)
                drawCircle(Color.hsv(hue, sat, value), radius = 8f, center = knob)
            }
        }

        Spacer(Modifier.height(14.dp))

        // Brightness. Black to the fully saturated hue, so the whole range of
        // the chosen colour is one swipe.
        Box(
            Modifier
                .fillMaxWidth()
                .height(28.dp)
                .clip(RoundedCornerShape(Dcc.shapes.button))
                .pointerInput(Unit) {
                    fun pick(x: Float, w: Float) { value = (x / w).coerceIn(0.06f, 1f); emit() }
                    detectTapGestures { pick(it.x, size.width.toFloat()) }
                }
                .pointerInput(Unit) {
                    detectDragGestures { change, _ ->
                        value = (change.position.x / size.width.toFloat()).coerceIn(0.06f, 1f); emit()
                    }
                },
        ) {
            Canvas(Modifier.fillMaxWidth().height(28.dp)) {
                drawRect(
                    Brush.horizontalGradient(
                        listOf(Color.hsv(hue, sat, 0.06f), Color.hsv(hue, sat, 1f)),
                    ),
                )
                val x = (value * size.width).coerceIn(2f, size.width - 2f)
                drawRect(
                    Color.White,
                    topLeft = Offset(x - 1.5f, 0f),
                    size = Size(3f, size.height),
                )
            }
        }

        Spacer(Modifier.height(14.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .padding(0.dp),
            ) {
                Canvas(Modifier.size(34.dp)) { drawCircle(Color.hsv(hue, sat, value)) }
            }
            Spacer(Modifier.size(12.dp))
            MetaText(hexOf(Color.hsv(hue, sat, value)).uppercase(), c.ink2, 12)
        }
    }
}

/** The four seeded presets, as a row of swatches. */
@Composable
fun AccentSwatches(hex: String, onPick: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        for (a in com.dcc.app.ui.theme.DccAccents) {
            val on = hexOf(a.dark).equals(hex.trim(), ignoreCase = true)
            Box(
                Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .pointerInput(a.id) { detectTapGestures { onPick(hexOf(a.dark)) } },
            ) {
                Canvas(Modifier.size(32.dp)) {
                    drawCircle(a.dark)
                    if (on) drawCircle(Color.White, radius = size.minDimension / 2f, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 5f))
                }
            }
        }
    }
}

private fun parseHex(hex: String): Color? {
    val clean = hex.trim().removePrefix("#")
    val n = clean.toLongOrNull(16) ?: return null
    return if (clean.length == 6) Color(0xFF000000 or n) else null
}

fun hexOf(c: Color): String {
    fun ch(v: Float) = (v * 255f).roundToInt().coerceIn(0, 255).toString(16).padStart(2, '0')
    return "#${ch(c.red)}${ch(c.green)}${ch(c.blue)}"
}

/** Hue, saturation and value of a colour, as the wheel needs them. */
private fun hsvOf(c: Color): FloatArray {
    val max = maxOf(c.red, c.green, c.blue)
    val min = minOf(c.red, c.green, c.blue)
    val d = max - min
    val h = when {
        d == 0f -> 0f
        max == c.red -> (60f * (((c.green - c.blue) / d) % 6f) + 360f) % 360f
        max == c.green -> 60f * (((c.blue - c.red) / d) + 2f)
        else -> 60f * (((c.red - c.green) / d) + 4f)
    }
    return floatArrayOf(h, if (max == 0f) 0f else d / max, max)
}
