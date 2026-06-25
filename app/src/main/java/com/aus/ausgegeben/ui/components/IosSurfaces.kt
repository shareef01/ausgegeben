package com.aus.ausgegeben.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.ui.theme.AppColorSpring
import com.aus.ausgegeben.ui.theme.AppSpring
import com.aus.ausgegeben.ui.theme.AppSpringSnappy
import com.aus.ausgegeben.ui.theme.CapsuleShape
import com.aus.ausgegeben.ui.theme.GlassShape
import com.aus.ausgegeben.ui.theme.GroupedShape
import com.aus.ausgegeben.ui.theme.SurfaceElevatedDark

@Composable
fun Modifier.appCard(
    shape: Shape = GroupedShape,
    horizontalPadding: Dp = 0.dp
): Modifier {
    val outline = MaterialTheme.colorScheme.outline.copy(alpha = 0.14f)
    return this
        .then(if (horizontalPadding > 0.dp) Modifier.padding(horizontal = horizontalPadding) else Modifier)
        .clip(shape)
        .background(MaterialTheme.colorScheme.surface)
        .border(0.5.dp, outline, shape)
}

@Composable
fun ScreenTitle(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .padding(top = 6.dp, bottom = 10.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge.copy(letterSpacing = (-0.3).sp),
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() }
        )
        if (subtitle != null) {
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
    }
}

@Composable
fun BrandedScreenHeader(
    accentLetter: Char,
    titleRest: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier
) {
    ScreenTitle(
        title = accentLetter + titleRest,
        subtitle = subtitle,
        modifier = modifier
    )
}

@Composable
fun GroupedSection(
    modifier: Modifier = Modifier,
    horizontalPadding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .appCard(shape = GroupedShape, horizontalPadding = horizontalPadding),
        content = content
    )
}

@Composable
fun GroupedSectionLabel(
    text: String,
    modifier: Modifier = Modifier
) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp)
    )
}

@Composable
fun IosSeparator(modifier: Modifier = Modifier, insetStart: Dp = 68.dp) {
    HorizontalDivider(
        modifier = modifier.padding(start = insetStart),
        thickness = 0.5.dp,
        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)
    )
}

@Composable
fun GlassFloatingBar(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp)
                .shadow(28.dp, GlassShape, ambientColor = Color.Black.copy(alpha = 0.5f))
                .clip(GlassShape)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color(0xFF2A2A32).copy(alpha = 0.92f),
                            Color(0xFF1A1A20).copy(alpha = 0.96f)
                        )
                    )
                )
                .border(
                    width = 0.5.dp,
                    brush = Brush.verticalGradient(
                        listOf(Color.White.copy(alpha = 0.14f), Color.White.copy(alpha = 0.04f))
                    ),
                    shape = GlassShape
                )
                .padding(horizontal = 6.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically,
            content = content
        )
    }
}

@Composable
fun IosSegmentedControl(
    options: List<String>,
    selectedIndex: Int,
    onSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val trackShape = RoundedCornerShape(12.dp)
    val trackColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f)
    val trackBorder = MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(trackShape)
            .background(trackColor)
            .border(0.5.dp, trackBorder, trackShape)
            .padding(3.dp)
    ) {
        options.forEachIndexed { index, label ->
            val selected = selectedIndex == index
            val bg = if (selected) {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
            } else {
                Color.Transparent
            }
            val shape = RoundedCornerShape(10.dp)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(shape)
                    .background(bg)
                    .then(
                        if (selected) {
                            Modifier.border(
                                0.5.dp,
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.25f),
                                shape
                            )
                        } else Modifier
                    )
                    .smoothClickable { onSelected(index) }
                    .padding(vertical = 11.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                    color = if (selected) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
fun Modifier.smoothClickable(
    enabled: Boolean = true,
    onClick: () -> Unit
): Modifier {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.94f else 1f,
        animationSpec = AppSpringSnappy,
        label = "pressScale"
    )
    return this
        .scale(scale)
        .clickable(
            interactionSource = interactionSource,
            indication = null,
            enabled = enabled,
            onClick = onClick
        )
}

@Composable
fun SmoothIconButton(
    onClick: () -> Unit,
    icon: ImageVector,
    contentDescription: String?,
    tint: Color = MaterialTheme.colorScheme.onBackground,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .size(44.dp)
            .clip(CapsuleShape)
            .smoothClickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        androidx.compose.material3.Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(22.dp)
        )
    }
}

@Composable
fun IosLargeTitle(
    title: String,
    accentLetter: Char? = null,
    subtitle: String? = null,
    modifier: Modifier = Modifier
) {
    ScreenTitle(
        title = if (accentLetter != null) accentLetter + title else title,
        subtitle = subtitle,
        modifier = modifier
    )
}
