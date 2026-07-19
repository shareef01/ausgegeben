package com.aus.ausgegeben.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Backspace
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.*
import kotlinx.coroutines.launch

private object ObsidianTokens {
    @Composable
    fun background() = MaterialTheme.colorScheme.background

    @Composable
    fun surface() = appGlassBase()

    @Composable
    fun slate() = readableSecondaryColor()

    @Composable
    fun voidContent() = navigationInactiveColor()

    @Composable
    fun hairline() = appDividerColor()

    @Composable
    fun income() = financeIncomeColor()

    @Composable
    fun expense() = financeExpenseColor()

    @Composable
    fun transfer() = financeTransferColor()

    @Composable
    fun labelStyle() = TextStyle(
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 1.sp,
        color = slate()
    )

    val TabularValueStyle = TextStyle(
        fontFeatureSettings = "tnum",
        fontWeight = FontWeight.SemiBold
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTransactionScreen(
    viewModel: AddExpenseViewModel,
    categoryViewModel: CategoryViewModel,
    currencyCode: String = "EUR",
    onTransactionSaved: (wasEditing: Boolean) -> Unit,
    onBack: () -> Unit,
    onValidationError: (String) -> Unit,
    onBudgetAlert: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val amountText by viewModel.amount.collectAsState()
    val remarkText by viewModel.note.collectAsState()

    var showManageSheet by remember { mutableStateOf(false) }
    var showEditorDialog by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var showDiscardConfirm by remember { mutableStateOf(false) }

    var editingCategory by remember { mutableStateOf<Category?>(null) }
    var categoryToDelete by remember { mutableStateOf<Category?>(null) }

    val categories by viewModel.categories.collectAsState()
    val selectedCategory by viewModel.selectedCategory.collectAsState()
    val editingExpenseId by viewModel.editingExpenseId.collectAsState()
    val loadedTransactionType by viewModel.loadedTransactionType.collectAsState()
    val dateMillis by viewModel.dateMillis.collectAsState()
    val isSaving by viewModel.isSaving.collectAsState()

    val isEditing = editingExpenseId != null
    var initialLoadDone by remember { mutableStateOf(!isEditing) }
    val scope = rememberCoroutineScope()
    val haptics = rememberAppHaptics()

    LaunchedEffect(editingExpenseId, loadedTransactionType) {
        if (isEditing) {
            selectedTab = TransactionType.entries.indexOf(loadedTransactionType).coerceAtLeast(0)
            initialLoadDone = true
        }
    }

    val transactionType = when (selectedTab) {
        1 -> TransactionType.INCOME
        2 -> TransactionType.TRANSFER
        else -> TransactionType.EXPENSE
    }

    val typeAccent by animateColorAsState(
        targetValue = when (transactionType) {
            TransactionType.INCOME -> ObsidianTokens.income()
            TransactionType.TRANSFER -> ObsidianTokens.transfer()
            else -> ObsidianTokens.expense()
        },
        label = "typeAccent"
    )

    val filteredCategories = remember(transactionType, categories) {
        categories.filter { 
            it.id != "0" && it.name.isNotBlank() && CategoryGroups.matches(transactionType, it) 
        }
    }

    val hasAmount = (CurrencyUtils.parseAmount(amountText, currencyCode) ?: 0.0) > 0
    val hasCategory = selectedCategory != null
    val canSave = hasCategory && hasAmount
    val hasCategories = categories.isNotEmpty()
    val hasUnsavedChanges = remarkText.isNotBlank() || hasAmount

    BackHandler {
        if (hasUnsavedChanges && !isEditing) {
            haptics.light()
            showDiscardConfirm = true
        } else {
            onBack()
        }
    }

    if (showDiscardConfirm) {
        AppDestructiveConfirmDialog(
            onDismissRequest = { showDiscardConfirm = false },
            title = { Text(stringResource(R.string.add_unsaved_changes_title)) },
            text = { AppDialogBodyText(stringResource(R.string.add_unsaved_changes_body)) },
            confirmLabel = stringResource(R.string.add_discard),
            dismissLabel = stringResource(R.string.action_cancel),
            onConfirm = {
                showDiscardConfirm = false
                onBack()
            },
        )
    }

    AppScreen(aurora = true) {
        if (!initialLoadDone) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
        } else {
            val isWide = isWideScreen()
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.TopCenter
            ) {
                Scaffold(
                    modifier = if (isWide) Modifier.widthIn(max = 640.dp).fillMaxWidth() else Modifier.fillMaxSize(),
                    containerColor = Color.Transparent,
                    topBar = {
                        ObsidianTopBar(
                            isEditing = isEditing,
                            onBack = onBack,
                            accentColor = typeAccent
                        )
                    }
                ) { innerPadding ->
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                    ) {
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                                .verticalScroll(rememberScrollState())
                        ) {
                            IosSegmentedControl(
                                options = listOf(
                                    stringResource(R.string.add_type_expense),
                                    stringResource(R.string.add_type_income),
                                    stringResource(R.string.add_type_transfer),
                                ),
                                selectedIndex = selectedTab,
                                onSelected = { selectedTab = it },
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            if (!hasCategories) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(24.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    EmptyStateMessage(
                                        icon = Icons.Rounded.Category,
                                        title = stringResource(R.string.add_no_categories_title),
                                        subtitle = stringResource(R.string.add_no_categories_subtitle),
                                        actionLabel = stringResource(R.string.add_create_category),
                                        onAction = { showEditorDialog = true },
                                    )
                                }
                            } else {
                                ObsidianFieldGroup {
                                    DatePickerRow(
                                        dateMillis = dateMillis,
                                        accentColor = typeAccent,
                                        onClick = { showDatePicker = true }
                                    )
                                    
                                    HorizontalDivider(color = ObsidianTokens.hairline(), thickness = 0.5.dp)
                                    
                                    ObsidianNoteField(
                                        remark = remarkText,
                                        onRemarkChange = { viewModel.onNoteChange(it) },
                                        accentColor = typeAccent,
                                    )
                                }

                                Spacer(modifier = Modifier.height(16.dp))

                                ObsidianCategoryHeader(
                                    onManage = { showManageSheet = true },
                                    highlight = hasAmount && !hasCategory && !isSaving,
                                )

                                ObsidianCategorySlider(
                                    categories = filteredCategories,
                                    selectedCategory = selectedCategory,
                                    onCategorySelected = { viewModel.onCategorySelect(it) },
                                    onAddCategory = {
                                        editingCategory = null
                                        showEditorDialog = true
                                    }
                                )
                                
                                Spacer(modifier = Modifier.height(24.dp))
                            }
                        }

                        ObsidianNumpadContainer(
                            amountText = amountText,
                            currencyCode = currencyCode,
                            transactionType = transactionType,
                            canSave = canSave && !isSaving,
                            hasAmount = hasAmount,
                            hasCategory = hasCategory,
                            isEditing = isEditing,
                            onKeyPress = { key ->
                                viewModel.onAmountChange(handleKeyInput(amountText, key, CurrencyUtils.decimalSeparator(currencyCode)))
                            },
                            onBackspace = {
                                if (amountText.length > 1) {
                                    viewModel.onAmountChange(amountText.dropLast(1))
                                } else {
                                    viewModel.onAmountChange("0")
                                }
                            },
                            onClear = { viewModel.onAmountChange("0") },
                            onSave = {
                                viewModel.saveExpense(
                                    type = transactionType,
                                    onSuccess = {
                                        haptics.success()
                                        onTransactionSaved(isEditing)
                                    },
                                    onError = {
                                        haptics.medium()
                                        onValidationError(it)
                                    },
                                    onBudgetAlert = onBudgetAlert
                                )
                            },
                            onQuickAdd = { increment ->
                                val current = CurrencyUtils.parseAmount(amountText, currencyCode) ?: 0.0
                                viewModel.onAmountChange(CurrencyUtils.formatAmountForInput(current + increment))
                            }
                        )
                    }
                }
            }
        }
    }

    if (showManageSheet) {
        CategoryManageSheet(
            categories = categories,
            transactionType = transactionType,
            onDismiss = { showManageSheet = false },
            onAddCategory = {
                editingCategory = null
                showEditorDialog = true
            },
            onEditCategory = { category ->
                editingCategory = category
                showEditorDialog = true
            },
            onDeleteCategory = { categoryToDelete = it },
            onMoveCategory = categoryViewModel::moveCategory,
            onDeduplicate = {
                categoryViewModel.deduplicateCategories()
            }
        )
    }

    if (showEditorDialog) {
        CategoryEditorDialog(
            initialCategory = editingCategory,
            lockTransactionType = if (editingCategory == null) transactionType else null,
            onDismiss = {
                showEditorDialog = false
                editingCategory = null
            },
            onConfirm = { name, type, colorInt, iconName ->
                if (editingCategory != null) {
                    categoryViewModel.updateCategory(
                        editingCategory!!.copy(name = name, transactionType = type, colorInt = colorInt, iconName = iconName)
                    )
                } else {
                    categoryViewModel.addCategory(
                        name = name, iconName = iconName, colorInt = colorInt, transactionType = type,
                        onAdded = { viewModel.onCategorySelect(it) }
                    )
                }
                showEditorDialog = false
                editingCategory = null
            }
        )
    }

    categoryToDelete?.let { category ->
        AppDestructiveConfirmDialog(
            onDismissRequest = { categoryToDelete = null },
            title = { Text(stringResource(R.string.add_delete_category_title)) },
            text = {
                AppDialogBodyText(
                    stringResource(
                        R.string.add_delete_category_body,
                        category.name,
                        stringResource(R.string.add_delete_category_fallback),
                    ),
                )
            },
            confirmLabel = stringResource(R.string.action_delete),
            onConfirm = {
                if (selectedCategory?.id == category.id) viewModel.clearCategorySelection()
                categoryViewModel.deleteCategory(category)
                categoryToDelete = null
            },
        )
    }

    if (showDatePicker) {
        AppDatePickerSheet(
            initialSelectedDateMillis = dateMillis,
            title = stringResource(R.string.add_date_label),
            onDismiss = { showDatePicker = false },
            onConfirm = {
                viewModel.onDateChange(it)
                showDatePicker = false
            }
        )
    }
}

@Composable
private fun ObsidianTopBar(
    isEditing: Boolean,
    onBack: () -> Unit,
    accentColor: Color
) {
    val isDark = isAppDarkTheme()
    val contentColor = if (isDark) Color.White else MaterialTheme.colorScheme.onSurface

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier.size(44.dp).appGlassCard(CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            AppIconButton(
                onClick = onBack,
                icon = Icons.Rounded.Close,
                contentDescription = stringResource(R.string.action_close),
                tint = contentColor,
                modifier = Modifier.size(44.dp),
            )
        }

        SignatureText(
            text = if (isEditing) stringResource(R.string.add_edit_title) else stringResource(R.string.add_new_title),
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
            accentColor = accentColor,
            textColor = contentColor,
            modifier = Modifier.weight(1f).padding(horizontal = 12.dp),
        )
    }
}

@Composable
private fun ObsidianFieldGroup(content: @Composable ColumnScope.() -> Unit) {
    Box(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .appGlassCard(shape = RoundedCornerShape(AppRadius.card)),
    ) {
        Column(content = content)
    }
}

@Composable
private fun DatePickerRow(dateMillis: Long, accentColor: Color, onClick: () -> Unit) {
    val dateLabel = formatRelativeTimestamp(LocalContext.current, dateMillis)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .smoothClickable { onClick() }
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier.size(36.dp).appGlassCard(CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Rounded.Event, null, tint = accentColor, modifier = Modifier.size(18.dp))
        }
        Spacer(modifier = Modifier.width(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(stringResource(R.string.add_date_label).uppercase(), style = ObsidianTokens.labelStyle())
            Text(dateLabel, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold))
        }
        Icon(Icons.Rounded.ArrowDropDown, null, tint = ObsidianTokens.slate())
    }
}

@Composable
private fun ObsidianNoteField(
    remark: String,
    onRemarkChange: (String) -> Unit,
    accentColor: Color,
    ) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier.size(36.dp).appGlassCard(CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Rounded.EditNote, null, tint = accentColor, modifier = Modifier.size(20.dp))
        }
        Spacer(modifier = Modifier.width(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(stringResource(R.string.add_note_label).uppercase(), style = ObsidianTokens.labelStyle())
            BasicTextField(
                value = remark,
                onValueChange = onRemarkChange,
                textStyle = MaterialTheme.typography.bodyLarge.copy(
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold
                ),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(accentColor),
                modifier = Modifier.fillMaxWidth(),
                decorationBox = { inner ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(modifier = Modifier.weight(1f)) {
                            if (remark.isEmpty()) {
                                Text(
                                    stringResource(R.string.add_note_placeholder),
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = ObsidianTokens.slate().copy(alpha = 0.5f)
                                )
                            }
                            inner()
                        }
                        if (remark.isNotEmpty()) {
                            AppIconButton(
                                onClick = { onRemarkChange("") },
                                icon = Icons.Rounded.Cancel,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                                tint = ObsidianTokens.slate().copy(alpha = 0.4f)
                            )
                        }
                    }
                }
            )
        }
    }
}

@Composable
private fun ObsidianCategoryHeader(onManage: () -> Unit, highlight: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = stringResource(R.string.add_category_label).uppercase(),
            style = ObsidianTokens.labelStyle().copy(
                color = if (highlight) ObsidianTokens.expense() else ObsidianTokens.slate()
            )
        )
        AppTextButton(
            onClick = onManage,
            text = stringResource(R.string.add_manage).uppercase(),
            contentColor = MaterialTheme.colorScheme.primary
        )
    }
}

@Composable
private fun ObsidianCategorySlider(
    categories: List<Category>,
    selectedCategory: Category?,
    onCategorySelected: (Category) -> Unit,
    onAddCategory: () -> Unit
) {
    val listState = rememberLazyListState()

    LaunchedEffect(selectedCategory) {
        selectedCategory?.let { sel ->
            val index = categories.indexOfFirst { it.id == sel.id }
            if (index >= 0) {
                listState.animateScrollToItem(index)
            }
        }
    }

    LazyRow(
        state = listState,
        modifier = Modifier
            .fillMaxWidth()
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .drawWithContent {
                drawContent()
                drawRect(
                    brush = Brush.horizontalGradient(
                        0f to Color.Transparent,
                        0.05f to Color.Black,
                        0.95f to Color.Black,
                        1f to Color.Transparent
                    ),
                    blendMode = BlendMode.DstIn
                )
            },
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(categories, key = { it.id }) { category ->
            val isSelected = selectedCategory?.id == category.id
            val categoryColor = colorIntToCompose(category.colorInt)

            val animatedAlpha by animateFloatAsState(
                targetValue = if (isSelected) 0.15f else 0.0f,
                label = "categoryAlpha"
            )
            val animatedBorderWidth by animateDpAsState(
                targetValue = if (isSelected) 1.5.dp else 0.dp,
                label = "categoryBorder"
            )
            
            Column(
                modifier = Modifier
                    .wrapContentWidth()
                    .clip(RoundedCornerShape(AppRadius.interactive))
                    .background(categoryColor.copy(alpha = animatedAlpha))
                    .border(
                        animatedBorderWidth,
                        categoryColor.copy(alpha = 0.5f),
                        RoundedCornerShape(AppRadius.interactive)
                    )
                    .smoothClickable { onCategorySelected(category) }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .appGlassCard(CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = iconForCategory(category.iconName, category.name),
                        contentDescription = null,
                        tint = categoryColor,
                        modifier = Modifier.size(18.dp)
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = category.name,
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                    color = if (isSelected) MaterialTheme.colorScheme.onSurface else ObsidianTokens.slate(),
                    maxLines = 1
                )
            }
        }
        
        item {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(RoundedCornerShape(AppRadius.interactive))
                    .smoothClickable { onAddCategory() },
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Rounded.Add, null, tint = navigationInactiveColor())
            }
        }
    }
}

@Composable
private fun ObsidianNumpadContainer(
    amountText: String,
    currencyCode: String,
    transactionType: TransactionType,
    canSave: Boolean,
    hasAmount: Boolean,
    hasCategory: Boolean,
    isEditing: Boolean,
    onKeyPress: (String) -> Unit,
    onBackspace: () -> Unit,
    onClear: () -> Unit,
    onSave: () -> Unit,
    onQuickAdd: (Double) -> Unit
) {
    val haptics = rememberAppHaptics()
    val keys = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf(CurrencyUtils.decimalSeparator(currencyCode).toString(), "0", "back")
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .appGlassCard(
                shape = RoundedCornerShape(
                    topStart = AppRadius.card,
                    topEnd = AppRadius.card,
                    bottomStart = 0.dp,
                    bottomEnd = 0.dp,
                ),
            )
            .padding(bottom = navigationBarBottomPadding() + 8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf(1.0, 5.0, 10.0, 50.0).forEach { amount ->
                val label = "+$amount"
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(32.dp)
                        .appGlassCard(RoundedCornerShape(AppRadius.sm))
                        .semantics { contentDescription = label }
                        .smoothClickable { 
                            haptics.light()
                            onQuickAdd(amount) 
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = ObsidianTokens.slate()
                    )
                }
            }
        }

        val amountInteractionSource = remember { MutableInteractionSource() }
        val amountPressed by amountInteractionSource.collectIsPressedAsState()
        val amountScale by animateFloatAsState(
            targetValue = if (amountPressed) 0.95f else 1f,
            animationSpec = AppSpringSnappy,
            label = "amountScale"
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 12.dp)
                .graphicsLayer {
                    scaleX = amountScale
                    scaleY = amountScale
                }
                .clickable(
                    interactionSource = amountInteractionSource,
                    indication = null,
                    onClick = { 
                        haptics.medium()
                        onClear() 
                    }
                ),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = CurrencyUtils.symbolFor(currencyCode),
                style = MaterialTheme.typography.headlineMedium.copy(color = ObsidianTokens.slate()),
                modifier = Modifier.padding(end = 8.dp)
            )
            Text(
                text = amountText,
                style = MaterialTheme.typography.displayMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontFeatureSettings = "tnum"
                ),
                color = if (hasAmount) MaterialTheme.colorScheme.onSurface else ObsidianTokens.slate().copy(alpha = 0.5f)
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            keys.forEach { row ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    row.forEach { key ->
                        ObsidianKey(
                            key = key,
                            modifier = Modifier.weight(1f),
                            onPress = {
                                if (key == "back") onBackspace() else onKeyPress(key)
                            },
                            onLongPress = if (key == "back") onClear else null
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        AppButton(
            onClick = onSave,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(horizontal = 16.dp)
                .glassShine(canSave),
            enabled = canSave,
            containerColor = when (transactionType) {
                TransactionType.INCOME -> ObsidianTokens.income()
                TransactionType.TRANSFER -> ObsidianTokens.transfer()
                else -> ObsidianTokens.expense()
            }
        ) {
            Text(
                text = if (isEditing) stringResource(R.string.add_save_changes).uppercase()
                else stringResource(R.string.add_confirm_transaction).uppercase(),
                style = TextStyle(fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, letterSpacing = 1.2.sp)
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ObsidianKey(
    key: String,
    modifier: Modifier,
    onPress: () -> Unit,
    onLongPress: (() -> Unit)? = null
) {
    val isBack = key == "back"
    val haptics = rememberAppHaptics()
    
    Box(
        modifier = modifier
            .height(46.dp)
            .appGlassCard(RoundedCornerShape(AppRadius.interactive))
            .glassShine()
            .combinedClickable(
                    onClick = {
                        haptics.light()
                        onPress()
                    },
                onLongClick = onLongPress?.let { 
                    {
                        haptics.medium()
                        it()
                    }
                }
            ),
        contentAlignment = Alignment.Center
    ) {
        if (isBack) {
            Icon(
                Icons.AutoMirrored.Rounded.Backspace,
                contentDescription = stringResource(R.string.add_backspace),
                tint = ObsidianTokens.slate(),
                modifier = Modifier.size(20.dp)
            )
        } else {
            Text(
                text = key,
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Medium,
                    fontFeatureSettings = "tnum"
                ),
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

private fun handleKeyInput(current: String, input: String, decimalSeparator: Char): String {
    if (current == "0" && input != decimalSeparator.toString()) return input
    if (input == decimalSeparator.toString() && current.contains(decimalSeparator)) return current
    if (current.contains(decimalSeparator)) {
        val decimals = current.substringAfter(decimalSeparator)
        if (decimals.length >= 2) return current
    }
    return current + input
}
