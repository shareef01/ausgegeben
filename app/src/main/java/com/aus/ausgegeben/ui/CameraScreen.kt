package com.aus.ausgegeben.ui

import android.content.Context
import android.net.Uri
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.components.AppButton
import com.aus.ausgegeben.ui.components.AppIconButton
import com.aus.ausgegeben.ui.components.AppTextButton
import com.aus.ausgegeben.ui.components.CameraCaptureButton
import com.aus.ausgegeben.ui.components.appGlassCard
import com.aus.ausgegeben.ui.theme.AppAurora
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.contrastColorOn
import com.aus.ausgegeben.util.ReceiptFileUtils
import com.aus.ausgegeben.util.rememberAppHaptics
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import androidx.compose.ui.geometry.Offset

@Composable
fun CameraScreen(
    onImageCaptured: (Uri) -> Unit,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val imageCapture = remember { ImageCapture.Builder().build() }
    val previewView = remember { PreviewView(context) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var errorKind by remember { mutableStateOf<CameraErrorKind?>(null) }
    var cameraSessionKey by remember { mutableIntStateOf(0) }
    var isCapturing by remember { mutableStateOf(false) }
    val haptics = rememberAppHaptics()
    val cameraStartFailed = stringResource(R.string.camera_start_failed)
    val cameraCaptureFailed = stringResource(R.string.camera_capture_failed)

    BackHandler(onBack = onBack)

    DisposableEffect(Unit) {
        onDispose { cameraExecutor.shutdown() }
    }

    LaunchedEffect(cameraSessionKey) {
        errorMessage = null
        errorKind = null
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    lifecycleOwner,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    imageCapture
                )
            } catch (e: Exception) {
                errorMessage = cameraStartFailed
                errorKind = CameraErrorKind.START
            }
        }, ContextCompat.getMainExecutor(context))
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(AppAurora.background())
    ) {
        // Pillar 1: Ambient Overlay
        Box(modifier = Modifier.fillMaxSize().background(AppAurora.brush(opacity = 0.15f, center = Offset(1000f, 0f))))

        AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())

        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .statusBarsPadding()
                .padding(16.dp)
                .appGlassCard(CircleShape),
        ) {
            AppIconButton(
                onClick = onBack,
                icon = Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = stringResource(R.string.action_back),
                tint = MaterialTheme.colorScheme.onSurface,
            )
        }

        errorMessage?.let { message ->
            CameraErrorOverlay(
                message = message,
                showRetry = errorKind != null,
                onRetry = {
                    haptics.light()
                    when (errorKind) {
                        CameraErrorKind.START -> cameraSessionKey++
                        CameraErrorKind.CAPTURE -> {
                            errorMessage = null
                            errorKind = null
                        }
                        null -> Unit
                    }
                },
                onBack = {
                    haptics.light()
                    onBack()
                },
                modifier = Modifier.align(Alignment.Center),
            )
        }

        if (errorMessage == null) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 32.dp)
                    .navigationBarsPadding(),
                contentAlignment = Alignment.Center
            ) {
                if (isCapturing) {
                    Box(
                        modifier = Modifier.size(72.dp).appGlassCard(CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(28.dp),
                            strokeWidth = 3.dp,
                        )
                    }
                }
                CameraCaptureButton(
                    enabled = !isCapturing,
                    onClick = {
                        haptics.medium()
                        isCapturing = true
                        takePhoto(context, imageCapture, cameraExecutor, { uri ->
                            isCapturing = false
                            onImageCaptured(uri)
                        }) {
                            isCapturing = false
                            errorMessage = cameraCaptureFailed
                            errorKind = CameraErrorKind.CAPTURE
                        }
                    },
                    contentDescription = stringResource(R.string.camera_capture),
                )
            }
        }
    }
}

private enum class CameraErrorKind { START, CAPTURE }

@Composable
private fun CameraErrorOverlay(
    message: String,
    showRetry: Boolean,
    onRetry: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberAppHaptics()
    Box(
        modifier = modifier
            .padding(24.dp)
            .fillMaxWidth()
            .semantics {
                liveRegion = LiveRegionMode.Assertive
                contentDescription = message
            }
            .appGlassCard(shape = RoundedCornerShape(AppRadius.cardLarge))
            .padding(24.dp),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = Icons.Rounded.ErrorOutline,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(40.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(20.dp))
            if (showRetry) {
                AppButton(
                    onClick = {
                        haptics.success()
                        onRetry()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = contrastColorOn(MaterialTheme.colorScheme.primary),
                ) {
                    Text(stringResource(R.string.camera_try_again))
                }
                Spacer(Modifier.height(8.dp))
            }
            AppTextButton(
                onClick = onBack,
                text = stringResource(R.string.camera_go_back),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun takePhoto(
    context: Context,
    imageCapture: ImageCapture,
    executor: ExecutorService,
    onImageCaptured: (Uri) -> Unit,
    onError: () -> Unit
) {
    val outputDirectory = getOutputDirectory(context)
    val photoFile = File(
        outputDirectory,
        SimpleDateFormat("yyyy-MM-dd-HH-mm-ss-SSS", Locale.US).format(System.currentTimeMillis()) + ".jpg"
    )

    val outputOptions = ImageCapture.OutputFileOptions.Builder(photoFile).build()

    imageCapture.takePicture(
        outputOptions,
        executor,
        object : ImageCapture.OnImageSavedCallback {
            override fun onError(exception: ImageCaptureException) {
                onError()
            }

            override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    photoFile
                )
                onImageCaptured(uri)
            }
        }
    )
}

private fun getOutputDirectory(context: Context): File =
    ReceiptFileUtils.receiptOutputDirectory(context)
