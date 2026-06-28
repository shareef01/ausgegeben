package com.aus.ausgegeben.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.components.AppBrandIcon
import com.aus.ausgegeben.ui.components.AppIconButton
import com.aus.ausgegeben.ui.components.premiumClickable
import com.aus.ausgegeben.ui.theme.isAppDarkTheme
import androidx.compose.ui.geometry.Offset

private object AuthAuroraTokens {
    @Composable
    fun background() = MaterialTheme.colorScheme.background

    @Composable
    fun surface() = MaterialTheme.colorScheme.surface

    @Composable
    fun slate() = MaterialTheme.colorScheme.onSurfaceVariant

    @Composable
    fun emerald() = Color(0xFF10B981)

    // Pillar 1: Ambient Aurora Background
    @Composable
    fun auroraBrush() = Brush.radialGradient(
        colors = listOf(emerald().copy(alpha = if (isAppDarkTheme()) 0.15f else 0.08f), Color.Transparent),
        radius = 1200f,
        center = Offset(x = 0f, y = 0f)
    )

    // Pillar 2: Adaptive Glassmorphism
    @Composable
    fun glassBase() = if (isAppDarkTheme()) {
        Color(0xFFFFFFFF).copy(alpha = 0.03f)
    } else {
        Color(0xFF000000).copy(alpha = 0.03f)
    }

    @Composable
    fun specularBorder() = if (isAppDarkTheme()) {
        Brush.linearGradient(
            colors = listOf(Color.White.copy(alpha = 0.2f), Color.Transparent),
            start = Offset(0f, 0f),
            end = Offset(100f, 100f)
        )
    } else {
        Brush.linearGradient(
            colors = listOf(Color.Black.copy(alpha = 0.1f), Color.Transparent),
            start = Offset(0f, 0f),
            end = Offset(100f, 100f)
        )
    }

    @Composable
    fun labelStyle() = TextStyle(
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.5.sp,
        color = slate()
    )
}

@Composable
fun AuthScreen(
    viewModel: AuthViewModel,
    onAuthenticated: () -> Unit,
    onDismiss: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val emerald = AuthAuroraTokens.emerald()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(AuthAuroraTokens.background())
    ) {
        // Pillar 1: Ambient Background
        Box(modifier = Modifier.fillMaxSize().background(AuthAuroraTokens.auroraBrush()))

        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                AuthTopBar(onDismiss = onDismiss)
            }
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .imePadding()
                    .navigationBarsPadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                // Branding Anchor - Refined with dedicated component
                AppBrandIcon(size = 72)

                Spacer(modifier = Modifier.height(24.dp))
                
                // Minimalist lowercase title
                Text(
                    text = stringResource(R.string.app_name).lowercase(),
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontWeight = FontWeight.Light,
                        letterSpacing = (-0.5).sp
                    ),
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(32.dp))

                // Pillar 2: Hero Glassmorphic Auth Card
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(28.dp))
                        .background(AuthAuroraTokens.glassBase())
                        .border(
                            width = 1.dp,
                            brush = AuthAuroraTokens.specularBorder(),
                            shape = RoundedCornerShape(28.dp)
                        )
                        .padding(24.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        // Dynamic Tab Selector
                        AuthTabSelector(
                            selectedTab = uiState.selectedTab,
                            onTabSelected = viewModel::onTabSelected
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        AuthTextField(
                            value = uiState.email,
                            onValueChange = viewModel::onEmailChange,
                            label = stringResource(R.string.auth_email_label),
                            icon = Icons.Rounded.Mail,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                        )

                        AuthTextField(
                            value = uiState.password,
                            onValueChange = viewModel::onPasswordChange,
                            label = stringResource(R.string.auth_password_label),
                            icon = Icons.Rounded.Lock,
                            isPassword = true,
                            passwordVisible = uiState.passwordVisible,
                            onToggleVisibility = viewModel::onTogglePasswordVisibility,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                        )

                        if (uiState.selectedTab == AuthTab.SIGN_UP) {
                            AuthTextField(
                                value = uiState.confirmPassword,
                                onValueChange = viewModel::onConfirmPasswordChange,
                                label = stringResource(R.string.auth_confirm_password_label),
                                icon = Icons.Rounded.VerifiedUser,
                                isPassword = true,
                                passwordVisible = uiState.passwordVisible,
                                onToggleVisibility = viewModel::onTogglePasswordVisibility,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                            )
                        }

                        if (uiState.errorMessage != null) {
                            Text(
                                text = uiState.errorMessage!!,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }

                        // Premium CTA Button
                        Button(
                            onClick = { viewModel.submit(onAuthenticated) },
                            enabled = !uiState.isLoading,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp)
                                .shadow(
                                    elevation = if (uiState.isLoading) 0.dp else 12.dp,
                                    shape = RoundedCornerShape(16.dp),
                                    spotColor = emerald
                                ),
                            shape = RoundedCornerShape(16.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = emerald,
                                contentColor = Color.White,
                                disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant
                            ),
                            elevation = ButtonDefaults.buttonElevation(0.dp)
                        ) {
                            if (uiState.isLoading) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                            } else {
                                Text(
                                    text = if (uiState.selectedTab == AuthTab.SIGN_IN) 
                                        stringResource(R.string.auth_sign_in).uppercase() 
                                        else stringResource(R.string.auth_create_account).uppercase(),
                                    style = TextStyle(fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                                )
                            }
                        }

                        if (uiState.selectedTab == AuthTab.SIGN_IN) {
                            TextButton(
                                onClick = viewModel::sendPasswordReset,
                                modifier = Modifier.align(Alignment.CenterHorizontally)
                            ) {
                                Text(
                                    stringResource(R.string.auth_forgot_password),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = AuthAuroraTokens.slate()
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                // Secondary Action: Offline Mode
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .premiumClickable { viewModel.continueOffline(onAuthenticated) }
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Rounded.CloudOff, null, tint = AuthAuroraTokens.slate(), modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.auth_continue_offline).uppercase(),
                            style = AuthAuroraTokens.labelStyle().copy(color = MaterialTheme.colorScheme.onSurface)
                        )
                    }
                    Text(
                        text = stringResource(R.string.auth_continue_offline_subtitle),
                        style = MaterialTheme.typography.labelSmall,
                        color = AuthAuroraTokens.slate()
                    )
                }
            }
        }
    }
}

@Composable
private fun AuthTopBar(onDismiss: (() -> Unit)?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (onDismiss != null) {
            AppIconButton(
                onClick = onDismiss,
                icon = Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

@Composable
private fun AuthTabSelector(
    selectedTab: AuthTab,
    onTabSelected: (AuthTab) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f))
            .padding(4.dp)
    ) {
        AuthTabItem(
            label = stringResource(R.string.auth_tab_sign_in),
            isSelected = selectedTab == AuthTab.SIGN_IN,
            modifier = Modifier.weight(1f),
            onClick = { onTabSelected(AuthTab.SIGN_IN) }
        )
        AuthTabItem(
            label = stringResource(R.string.auth_tab_sign_up),
            isSelected = selectedTab == AuthTab.SIGN_UP,
            modifier = Modifier.weight(1f),
            onClick = { onTabSelected(AuthTab.SIGN_UP) }
        )
    }
}

@Composable
private fun AuthTabItem(
    label: String,
    isSelected: Boolean,
    modifier: Modifier,
    onClick: () -> Unit
) {
    val background by animateColorAsState(
        targetValue = if (isSelected) MaterialTheme.colorScheme.surface else Color.Transparent,
        animationSpec = tween(250),
        label = "tabBg"
    )

    Box(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(10.dp))
            .background(background)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label.uppercase(),
            style = TextStyle(
                fontSize = 11.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                letterSpacing = 1.sp,
                color = if (isSelected) MaterialTheme.colorScheme.onSurface else AuthAuroraTokens.slate()
            )
        )
    }
}

@Composable
private fun AuthTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    icon: ImageVector,
    isPassword: Boolean = false,
    passwordVisible: Boolean = false,
    onToggleVisibility: (() -> Unit)? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label, style = MaterialTheme.typography.bodyMedium) },
        leadingIcon = { Icon(icon, null, modifier = Modifier.size(20.dp)) },
        trailingIcon = if (isPassword) {
            {
                IconButton(onClick = onToggleVisibility!!) {
                    Icon(
                        if (passwordVisible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                        null,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        } else null,
        visualTransformation = if (isPassword && !passwordVisible) PasswordVisualTransformation() else VisualTransformation.None,
        singleLine = true,
        keyboardOptions = keyboardOptions,
        shape = RoundedCornerShape(16.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = AuthAuroraTokens.emerald().copy(alpha = 0.5f),
            unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f),
            focusedContainerColor = MaterialTheme.colorScheme.surface,
            unfocusedContainerColor = Color.Transparent,
            cursorColor = AuthAuroraTokens.emerald()
        )
    )
}
