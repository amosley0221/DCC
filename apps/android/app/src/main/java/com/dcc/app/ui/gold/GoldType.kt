package com.dcc.app.ui.gold

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import com.dcc.app.ui.theme.Dcc

/*
 * The type roles, per theme/fonts.md.
 *
 * Bodoni carries every headline and every number read as data; Manrope carries
 * everything functional. The shared components put numbers in the mono slot,
 * which under Gold Standard is Manrope — right for a label, wrong for a score —
 * so the numeric styles are spelled out here and every gold screen uses these
 * four rather than reaching for the shared ones.
 */

/** A headline. */
@Composable
internal fun Display(text: String, size: Int, color: Color, modifier: Modifier = Modifier, maxLines: Int = 3) = Text(
    text,
    modifier = modifier,
    maxLines = maxLines,
    overflow = TextOverflow.Ellipsis,
    style = TextStyle(
        fontFamily = Dcc.fonts.serif, fontWeight = FontWeight.SemiBold,
        fontSize = size.sp, lineHeight = (size * 1.15).sp, color = color,
    ),
)

/** A number the user reads as data: Bodoni, always. */
@Composable
internal fun GoldNum(text: String, size: Int, color: Color, modifier: Modifier = Modifier) = Text(
    text,
    modifier = modifier,
    maxLines = 1,
    style = TextStyle(
        fontFamily = Dcc.fonts.serif, fontWeight = FontWeight.SemiBold,
        fontSize = size.sp, lineHeight = size.sp, color = color,
    ),
)

/** A tracked-out label: kickers, column heads, tab names. */
@Composable
internal fun Label(text: String, size: Double, color: Color, tracking: Double = 2.0, modifier: Modifier = Modifier) = Text(
    text,
    modifier = modifier,
    maxLines = 1,
    overflow = TextOverflow.Ellipsis,
    style = TextStyle(
        fontFamily = Dcc.fonts.sans, fontWeight = FontWeight.Medium,
        fontSize = size.sp, letterSpacing = tracking.sp, color = color,
    ),
)

/** Running text and names. */
@Composable
internal fun Ui(
    text: String,
    size: Double,
    color: Color,
    weight: FontWeight = FontWeight.Normal,
    modifier: Modifier = Modifier,
    maxLines: Int = 3,
) = Text(
    text,
    modifier = modifier,
    maxLines = maxLines,
    overflow = TextOverflow.Ellipsis,
    style = TextStyle(
        fontFamily = Dcc.fonts.sans, fontWeight = weight,
        fontSize = size.sp, lineHeight = (size * 1.5).sp, color = color,
    ),
)
