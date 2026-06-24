package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.ui.theme.AccentCoral

@Composable
fun RedFab(
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    contentDescription: String? = null
) {
    FloatingActionButton(
        onClick = onClick,
        modifier = modifier
            .shadow(20.dp, CircleShape, ambientColor = AccentCoral.copy(alpha = 0.45f))
            .size(60.dp),
        containerColor = AccentCoral,
        contentColor = Color.White,
        elevation = FloatingActionButtonDefaults.elevation(0.dp, 0.dp),
        shape = CircleShape
    ) {
        Icon(imageVector = icon, contentDescription = contentDescription, modifier = Modifier.size(28.dp))
    }
}
