package com.aus.ausgegeben.ui

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.MailOutline
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aus.ausgegeben.R
import com.aus.ausgegeben.ui.components.GroupedSection
import com.aus.ausgegeben.ui.components.IosSegmentedControl
import com.aus.ausgegeben.ui.components.SmoothIconButton
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.financeExpenseColor
import com.aus.ausgegeben.ui.theme.financeIncomeColor
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException

@Composable
fun AuthScreen(
    viewModel: AuthViewModel,
    onAuthenticated: () -> Unit,
    onDismiss: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val expenseColor = financeExpenseColor()
    val incomeColor = financeIncomeColor()
    val webClientId = remember {
        val resId = context.resources.getIdentifier(
            "default_web_client_id",
            "string",
            context.packageName,
        )
        if (resId != 0) context.getString(resId) else null
    }

    val googleSignInClient = remember(webClientId) {
        webClientId?.let { clientId ->
            val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(clientId)
                .requestEmail()
                .build()
            GoogleSignIn.getClient(context, options)
        }
    }

    val googleLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode != Activity.RESULT_OK) return@rememberLauncherForActivityResult
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        runCatching { task.getResult(ApiException::class.java) }
            .onSuccess { account ->
                account.idToken?.let { token ->
                    viewModel.signInWithGoogle(token, onAuthenticated)
                }
            }
            .onFailure {
                // Google sign-in cancelled or failed silently
            }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = AppSpacing.xs, vertical = AppSpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (onDismiss != null) {
                    SmoothIconButton(
                        onClick = onDismiss,
                        icon = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = stringResource(R.string.action_back),
                    )
                } else {
                    Spacer(modifier = Modifier.size(48.dp))
                }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = AppSpacing.sm),
                ) {
                    Text(
                        text = stringResource(R.string.app_name),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = stringResource(R.string.auth_tagline),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(
                                listOf(
                                    expenseColor.copy(alpha = 0.2f),
                                    incomeColor.copy(alpha = 0.25f),
                                ),
                            ),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("A", fontWeight = FontWeight.Bold, color = expenseColor)
                }
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .imePadding()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = AppSpacing.md),
        ) {
            Text(
                text = stringResource(R.string.auth_headline),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(top = AppSpacing.sm),
            )
            Text(
                text = stringResource(R.string.auth_subheadline),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = AppSpacing.xxs, bottom = AppSpacing.md),
            )

            GroupedSection {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(AppSpacing.md),
                    verticalArrangement = Arrangement.spacedBy(AppSpacing.sm),
                ) {
                    if (googleSignInClient != null) {
                        OutlinedButton(
                            onClick = { googleLauncher.launch(googleSignInClient.signInIntent) },
                            enabled = !uiState.isLoading,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            shape = RoundedCornerShape(AppRadius.pill),
                        ) {
                            Icon(
                                painter = painterResource(R.drawable.ic_google),
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                                tint = Color.Unspecified,
                            )
                            Spacer(modifier = Modifier.size(AppSpacing.sm))
                            Text(
                                text = stringResource(R.string.auth_continue_google),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                        AuthOrDivider()
                    }

                    IosSegmentedControl(
                        options = listOf(
                            stringResource(R.string.auth_tab_sign_in),
                            stringResource(R.string.auth_tab_sign_up),
                        ),
                        selectedIndex = if (uiState.selectedTab == AuthTab.SIGN_IN) 0 else 1,
                        onSelected = { index ->
                            viewModel.onTabSelected(if (index == 0) AuthTab.SIGN_IN else AuthTab.SIGN_UP)
                        },
                    )

                    AuthTextField(
                        value = uiState.email,
                        onValueChange = viewModel::onEmailChange,
                        label = stringResource(R.string.auth_email_label),
                        leading = { Icon(Icons.Rounded.MailOutline, contentDescription = null) },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next,
                        ),
                    )

                    AuthTextField(
                        value = uiState.password,
                        onValueChange = viewModel::onPasswordChange,
                        label = stringResource(R.string.auth_password_label),
                        leading = { Icon(Icons.Rounded.Lock, contentDescription = null) },
                        trailing = {
                            IconButton(onClick = viewModel::onTogglePasswordVisibility) {
                                Icon(
                                    imageVector = if (uiState.passwordVisible) {
                                        Icons.Rounded.VisibilityOff
                                    } else {
                                        Icons.Rounded.Visibility
                                    },
                                    contentDescription = stringResource(R.string.auth_toggle_password),
                                )
                            }
                        },
                        visualTransformation = if (uiState.passwordVisible) {
                            VisualTransformation.None
                        } else {
                            PasswordVisualTransformation()
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = if (uiState.selectedTab == AuthTab.SIGN_UP) {
                                ImeAction.Next
                            } else {
                                ImeAction.Done
                            },
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                if (uiState.selectedTab == AuthTab.SIGN_IN) {
                                    viewModel.submit(onAuthenticated)
                                }
                            },
                        ),
                    )

                    if (uiState.selectedTab == AuthTab.SIGN_UP) {
                        AuthTextField(
                            value = uiState.confirmPassword,
                            onValueChange = viewModel::onConfirmPasswordChange,
                            label = stringResource(R.string.auth_confirm_password_label),
                            leading = { Icon(Icons.Rounded.Lock, contentDescription = null) },
                            visualTransformation = if (uiState.passwordVisible) {
                                VisualTransformation.None
                            } else {
                                PasswordVisualTransformation()
                            },
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Password,
                                imeAction = ImeAction.Done,
                            ),
                            keyboardActions = KeyboardActions(
                                onDone = { viewModel.submit(onAuthenticated) },
                            ),
                        )
                    }

                    if (uiState.selectedTab == AuthTab.SIGN_IN) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                            TextButton(
                                onClick = viewModel::sendPasswordReset,
                                enabled = !uiState.isLoading,
                            ) {
                                Text(stringResource(R.string.auth_forgot_password))
                            }
                        }
                    }

                    if (uiState.errorMessage != null) {
                        Text(
                            text = uiState.errorMessage.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    if (uiState.infoMessage != null) {
                        Text(
                            text = uiState.infoMessage.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = incomeColor,
                        )
                    }

                    Button(
                        onClick = { viewModel.submit(onAuthenticated) },
                        enabled = !uiState.isLoading,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(AppRadius.pill),
                    ) {
                        if (uiState.isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimary,
                            )
                            Spacer(modifier = Modifier.size(AppSpacing.sm))
                            Text(
                                text = uiState.loadingMessage.orEmpty(),
                                fontWeight = FontWeight.Medium,
                            )
                        } else {
                            Text(
                                text = if (uiState.selectedTab == AuthTab.SIGN_IN) {
                                    stringResource(R.string.auth_sign_in)
                                } else {
                                    stringResource(R.string.auth_create_account)
                                },
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(AppSpacing.md))

            OutlinedButton(
                onClick = { viewModel.continueOffline(onAuthenticated) },
                enabled = !uiState.isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(AppRadius.pill),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = MaterialTheme.colorScheme.onBackground,
                ),
            ) {
                Icon(Icons.Rounded.CloudOff, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.size(AppSpacing.sm))
                Text(
                    text = stringResource(R.string.auth_continue_offline),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Medium,
                )
            }

            Text(
                text = stringResource(R.string.auth_continue_offline_subtitle),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = AppSpacing.xs, bottom = AppSpacing.lg),
            )
        }
    }
}

@Composable
private fun AuthTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    leading: @Composable (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        leadingIcon = leading,
        trailingIcon = trailing,
        singleLine = true,
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        shape = RoundedCornerShape(AppRadius.md),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f),
            unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f),
        ),
    )
}

@Composable
private fun AuthOrDivider() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm),
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f))
        Text(
            text = stringResource(R.string.auth_or),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        HorizontalDivider(modifier = Modifier.weight(1f))
    }
}
