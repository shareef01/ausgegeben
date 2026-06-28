package com.aus.ausgegeben.ui

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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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
import com.aus.ausgegeben.ui.components.AppButton
import com.aus.ausgegeben.ui.components.AppIconButton
import com.aus.ausgegeben.ui.components.AppTextButton
import com.aus.ausgegeben.ui.components.smoothClickable
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.financeExpenseColor
import com.aus.ausgegeben.ui.theme.financeIncomeColor
import com.aus.ausgegeben.ui.theme.inputFocusedBorderColor
import com.aus.ausgegeben.ui.theme.inputUnfocusedBorderColor

@Composable
fun AuthScreen(
    viewModel: AuthViewModel,
    onAuthenticated: () -> Unit,
    onDismiss: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val expenseColor = financeExpenseColor()
    val incomeColor = financeIncomeColor()

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
                    AppIconButton(
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
                            AppIconButton(
                                onClick = viewModel::onTogglePasswordVisibility,
                                icon = if (uiState.passwordVisible) {
                                    Icons.Rounded.VisibilityOff
                                } else {
                                    Icons.Rounded.Visibility
                                },
                                contentDescription = stringResource(R.string.auth_toggle_password),
                                modifier = Modifier.size(36.dp)
                            )
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
                            AppTextButton(
                                onClick = viewModel::sendPasswordReset,
                                text = stringResource(R.string.auth_forgot_password),
                                enabled = !uiState.isLoading,
                                contentColor = MaterialTheme.colorScheme.primary
                            )
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

                    AppButton(
                        onClick = { viewModel.submit(onAuthenticated) },
                        enabled = !uiState.isLoading,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (uiState.isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.background,
                            )
                            Spacer(modifier = Modifier.size(AppSpacing.sm))
                            Text(
                                text = uiState.loadingMessage.orEmpty(),
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.background,
                            )
                        } else {
                            Text(
                                text = if (uiState.selectedTab == AuthTab.SIGN_IN) {
                                    stringResource(R.string.auth_sign_in)
                                } else {
                                    stringResource(R.string.auth_create_account)
                                },
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.background,
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(AppSpacing.md))

            AppButton(
                onClick = { viewModel.continueOffline(onAuthenticated) },
                enabled = !uiState.isLoading,
                modifier = Modifier.fillMaxWidth(),
                containerColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f),
                contentColor = MaterialTheme.colorScheme.onBackground
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
            focusedBorderColor = inputFocusedBorderColor(),
            unfocusedBorderColor = inputUnfocusedBorderColor(),
            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.22f),
            focusedLabelColor = inputFocusedBorderColor(),
            cursorColor = inputFocusedBorderColor(),
        ),
    )
}
