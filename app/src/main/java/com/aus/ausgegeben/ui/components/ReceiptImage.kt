package com.aus.ausgegeben.ui.components

import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.size.Size
import com.aus.ausgegeben.R

private const val THUMBNAIL_PX = 168
private const val DIALOG_MAX_HEIGHT_PX = 1200

@Composable
fun ReceiptThumbnail(
    uri: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val model = remember(uri) {
        ImageRequest.Builder(context)
            .data(Uri.parse(uri))
            .size(THUMBNAIL_PX)
            .crossfade(true)
            .build()
    }
    AsyncImage(
        model = model,
        contentDescription = stringResource(R.string.receipt_preview),
        contentScale = ContentScale.Crop,
        modifier = modifier
            .size(56.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
    )
}

@Composable
fun ReceiptImageDialog(uri: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val model = remember(uri) {
        ImageRequest.Builder(context)
            .data(Uri.parse(uri))
            .size(Size(DIALOG_MAX_HEIGHT_PX, DIALOG_MAX_HEIGHT_PX))
            .crossfade(true)
            .build()
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.receipt_title)) },
        text = {
            AsyncImage(
                model = model,
                contentDescription = stringResource(R.string.receipt_image),
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 400.dp)
            )
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_close))
            }
        }
    )
}

@Composable
fun CameraPermissionDenied(
    onRetry: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = stringResource(R.string.camera_permission_title),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onBackground
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.camera_permission_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onRetry) {
            Text(stringResource(R.string.camera_try_again))
        }
        TextButton(onClick = onBack) {
            Text(stringResource(R.string.camera_go_back))
        }
    }
}
