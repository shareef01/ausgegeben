package com.aus.ausgegeben.ui
import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Backspace
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.components.CategoryEditorDialog
import com.aus.ausgegeben.ui.components.CategoryManageSheet
import com.aus.ausgegeben.ui.components.GroupedSection
import com.aus.ausgegeben.ui.components.IosSegmentedControl
import com.aus.ausgegeben.ui.components.ReceiptImageDialog
import com.aus.ausgegeben.ui.components.ReceiptThumbnail
import com.aus.ausgegeben.ui.components.SmoothIconButton
import com.aus.ausgegeben.ui.components.smoothClickable
import com.aus.ausgegeben.ui.components.MoneyText
import com.aus.ausgegeben.ui.components.MoneySize
import com.aus.ausgegeben.ui.theme.AppColorSpring
import com.aus.ausgegeben.ui.theme.AppColors
import com.aus.ausgegeben.ui.theme.AppElevation
import com.aus.ausgegeben.ui.theme.AppRadius
import com.aus.ausgegeben.ui.theme.AppSpacing
import com.aus.ausgegeben.ui.theme.IncomeGreen
import com.aus.ausgegeben.ui.theme.TransferGray
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.colorIntToCompose
import com.aus.ausgegeben.util.iconForCategory
import com.aus.ausgegeben.util.iconTintOnCategoryFill
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTransactionScreen(
    viewModel: AddExpenseViewModel,
    categoryViewModel: CategoryViewModel,
    currencyCode: String = "EUR",
    onTransactionSaved: (wasEditing: Boolean) -> Unit,
    onBack: () -> Unit,
    onOpenCamera: () -> Unit,
    onValidationError: (String) -> Unit,
    onBudgetAlert: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    var amountText by remember { mutableStateOf("0") }
    var remarkText by remember { mutableStateOf("") }
    var showReceiptPreview by remember { mutableStateOf(false) }
    var showManageSheet by remember { mutableStateOf(false) }
    var showEditorDialog by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var editingCategory by remember { mutableStateOf<Category?>(null) }
    var categoryToDelete by remember { mutableStateOf<Category?>(null) }
    val categories by viewModel.categories.collectAsState()
    val selectedCategory by viewModel.selectedCategory.collectAsState()
    val receiptPath by viewModel.receiptImagePath.collectAsState()
    val editingExpenseId by viewModel.editingExpenseId.collectAsState()
    val loadedTransactionType by viewModel.loadedTransactionType.collectAsState()
    val dateMillis by viewModel.dateMillis.collectAsState()
    val isEditing = editingExpenseId != null

    LaunchedEffect(editingExpenseId, loadedTransactionType) {
        if (editingExpenseId != null) {
            selectedTab = TransactionType.entries.indexOf(loadedTransactionType).coerceAtLeast(0)
            amountText = viewModel.amount.value
            remarkText = viewModel.note.value
        }
    }
    val transactionType = when (selectedTab) {
        1 -> TransactionType.INCOME
        2 -> TransactionType.TRANSFER
        else -> TransactionType.EXPENSE
    }
    val filteredCategories = remember(transactionType, categories) {
        categories.filter { CategoryGroups.matches(transactionType, it) }
    }
    LaunchedEffect(selectedTab) {
        val type = TransactionType.entries.getOrElse(selectedTab) { TransactionType.EXPENSE }
        val cat = selectedCategory
        if (cat != null && !CategoryGroups.matches(type, cat)) {
            viewModel.clearCategorySelection()
        }
    }
    BackHandler(onBack = onBack)
    val expenseAccent = MaterialTheme.colorScheme.primary
    val typeAccent by animateColorAsState(
        targetValue = when (transactionType) {
            TransactionType.INCOME -> IncomeGreen
            TransactionType.TRANSFER -> TransferGray
            else -> expenseAccent
        },
        animationSpec = AppColorSpring,
        label = "typeAccent"
    )
    val amountColor by animateColorAsState(
        targetValue = when (transactionType) {
            TransactionType.INCOME -> IncomeGreen
            TransactionType.TRANSFER -> TransferGray
            else -> MaterialTheme.colorScheme.onBackground
        },
        animationSpec = AppColorSpring,
        label = "amountColor"
    )
    val canSave = selectedCategory != null &&
        (CurrencyUtils.parseAmount(amountText, currencyCode) ?: 0.0) > 0
    val saveLabel = when {
        isEditing -> stringResource(R.string.add_save_changes)
        transactionType == TransactionType.INCOME -> stringResource(R.string.add_income)
        transactionType == TransactionType.TRANSFER -> stringResource(R.string.add_transfer)
        else -> stringResource(R.string.add_expense)
    }
    val datePickerState = rememberDatePickerState(initialSelectedDateMillis = dateMillis)

    Column(modifier = modifier.fillMaxSize().background(AppColors.Background)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SmoothIconButton(
                onClick = onBack,
                icon = Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = stringResource(R.string.action_back)
            )
            Text(
                text = if (isEditing) stringResource(R.string.add_edit_title) else stringResource(R.string.add_new_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 8.dp)
            )
            SmoothIconButton(
                onClick = onOpenCamera,
                icon = Icons.Rounded.CameraAlt,
                contentDescription = stringResource(R.string.add_scan_receipt),
                tint = if (receiptPath != null) typeAccent else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
            ) {
            IosSegmentedControl(
                options = listOf(
                    stringResource(R.string.add_type_expense),
                    stringResource(R.string.add_type_income),
                    stringResource(R.string.add_type_transfer)
                ),
                selectedIndex = selectedTab,
                onSelected = { selectedTab = it },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )
            DatePickerRow(
                dateMillis = dateMillis,
                accentColor = typeAccent,
                onClick = { showDatePicker = true }
            )
            AmountCard(
                amount = amountText,
                currencyCode = currencyCode,
                remark = remarkText,
                onRemarkChange = { remarkText = it },
                receiptPath = receiptPath,
                onReceiptClick = { showReceiptPreview = true },
                onClearReceipt = { viewModel.setReceiptPath(null) },
                amountColor = amountColor,
                accentColor = typeAccent,
                transactionType = transactionType
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 28.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = stringResource(R.string.add_category_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f),
                    fontWeight = FontWeight.SemiBold
                )
                TextButton(onClick = { showManageSheet = true }) {
                    Text(stringResource(R.string.add_manage), color = typeAccent, style = MaterialTheme.typography.labelLarge)
                }
            }
            if (filteredCategories.isEmpty()) {
                GroupedSection(modifier = Modifier.padding(horizontal = 16.dp)) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Rounded.Category,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(36.dp)
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            stringResource(R.string.add_no_categories_title),
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            stringResource(R.string.add_no_categories_subtitle),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        TextButton(onClick = {
                            editingCategory = null
                            showEditorDialog = true
                        }) {
                            Text(stringResource(R.string.add_create_category), color = typeAccent)
                        }
                    }
                }
            } else {
                CategoryIconGrid(
                    categories = filteredCategories,
                    selectedCategory = selectedCategory,
                    accentColor = typeAccent,
                    onCategorySelected = { viewModel.onCategorySelect(it) },
                    onAddCategory = {
                        editingCategory = null
                        showEditorDialog = true
                    },
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
            }
        }
        val sheetShape = RoundedCornerShape(topStart = AppRadius.cardLarge, topEnd = AppRadius.cardLarge)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .background(AppColors.Background)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = AppSpacing.md)
                    .padding(top = AppSpacing.sm, bottom = AppSpacing.xs)
                    .clip(RoundedCornerShape(AppRadius.card))
                    .background(AppColors.CardSurface)
                    .border(AppElevation.cardBorder, AppColors.CardBorder, RoundedCornerShape(AppRadius.card))
                    .padding(AppSpacing.md)
            ) {
                selectedCategory?.let { category ->
                    SelectedCategoryChip(category = category, accentColor = typeAccent)
                    Spacer(modifier = Modifier.height(AppSpacing.sm))
                }
                Button(
                    onClick = {
                        val wasEditing = isEditing
                        viewModel.onAmountChange(amountText)
                        viewModel.onNoteChange(remarkText)
                        viewModel.saveExpense(
                            type = transactionType,
                            onSuccess = { onTransactionSaved(wasEditing) },
                            onError = onValidationError,
                            onBudgetAlert = onBudgetAlert
                        )
                    },
                    enabled = canSave,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(AppRadius.md),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = typeAccent,
                        disabledContainerColor = AppColors.CardSurface,
                        disabledContentColor = AppColors.OnSurfaceVariant
                    )
                ) {
                    Text(
                        text = saveLabel,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
            CalculatorKeypad(
                accentColor = typeAccent,
                decimalSeparator = CurrencyUtils.decimalSeparator(currencyCode).toString(),
                onKeyPress = { key ->
                    amountText = handleKeyInput(
                        current = amountText,
                        input = key,
                        decimalSeparator = CurrencyUtils.decimalSeparator(currencyCode)
                    )
                },
                onBackspace = {
                    amountText = if (amountText.length > 1) amountText.dropLast(1) else "0"
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .background(AppColors.Background)
                    .padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm)
            )
        }
    }
    if (showReceiptPreview && receiptPath != null) {
        ReceiptImageDialog(uri = receiptPath!!, onDismiss = { showReceiptPreview = false })
    }
    if (showDatePicker) {
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { viewModel.onDateChange(it) }
                    showDatePicker = false
                }) { Text(stringResource(R.string.action_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text(stringResource(R.string.action_cancel)) }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
    if (showManageSheet) {
        CategoryManageSheet(
            categories = filteredCategories,
            transactionType = transactionType,
            onDismiss = { showManageSheet = false },
            onAddCategory = {
                showManageSheet = false
                editingCategory = null
                showEditorDialog = true
            },
            onEditCategory = { category ->
                editingCategory = category
                showEditorDialog = true
            },
            onDeleteCategory = { categoryToDelete = it },
            onMoveCategory = { category, up -> categoryViewModel.moveCategory(category, up) }
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
                        editingCategory!!.copy(
                            name = name,
                            transactionType = type,
                            colorInt = colorInt,
                            iconName = iconName
                        )
                    )
                } else {
                    categoryViewModel.addCategory(
                        name = name,
                        iconName = iconName,
                        colorInt = colorInt,
                        transactionType = type,
                        onAdded = { viewModel.onCategorySelect(it) }
                    )
                }
                showEditorDialog = false
                editingCategory = null
            }
        )
    }
    categoryToDelete?.let { category ->
        var linkedCount by remember(category.id) { mutableIntStateOf(-1) }
        LaunchedEffect(category.id) {
            linkedCount = categoryViewModel.countLinkedExpenses(category.id)
        }
        AlertDialog(
            onDismissRequest = { categoryToDelete = null },
            title = { Text(stringResource(R.string.add_delete_category_title)) },
            text = {
                val suffix = when (linkedCount) {
                    0 -> stringResource(R.string.add_delete_category_none)
                    1 -> stringResource(R.string.add_delete_category_one)
                    in 2..Int.MAX_VALUE -> stringResource(R.string.add_delete_category_many, linkedCount)
                    else -> stringResource(R.string.add_delete_category_fallback)
                }
                Text(stringResource(R.string.add_delete_category_body, category.name, suffix))
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (selectedCategory?.id == category.id) {
                            viewModel.clearCategorySelection()
                        }
                        categoryViewModel.deleteCategory(category)
                        categoryToDelete = null
                    }
                ) {
                    Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { categoryToDelete = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            }
        )
    }
}
// ─────────────────────────────────────────────
// Amount card
// ─────────────────────────────────────────────
@Composable
private fun AmountCard(
    amount: String,
    currencyCode: String,
    remark: String,
    onRemarkChange: (String) -> Unit,
    receiptPath: String?,
    onReceiptClick: () -> Unit,
    onClearReceipt: () -> Unit,
    amountColor: Color,
    accentColor: Color,
    transactionType: TransactionType
) {
    val typeLabel = when (transactionType) {
        TransactionType.INCOME -> stringResource(R.string.add_amount_income)
        TransactionType.TRANSFER -> stringResource(R.string.add_amount_transfer)
        else -> stringResource(R.string.add_amount_expense)
    }
    val fontSize = when {
        amount.length > 10 -> 34.sp
        amount.length > 7 -> 44.sp
        else -> 52.sp
    }
    GroupedSection(modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = typeLabel,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.Center
            ) {
                Text(
                    text = CurrencyUtils.symbolFor(currencyCode),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(end = 6.dp, bottom = 8.dp)
                )
                MoneyText(
                    text = amount,
                    size = MoneySize.Hero,
                    color = amountColor,
                    fontSize = fontSize
                )
            }
            HorizontalDivider(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 16.dp),
                thickness = 0.5.dp,
                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)
            )
            BasicTextField(
                value = remark,
                onValueChange = onRemarkChange,
                textStyle = MaterialTheme.typography.bodyLarge.copy(
                    color = MaterialTheme.colorScheme.onBackground,
                    textAlign = TextAlign.Center
                ),
                cursorBrush = SolidColor(accentColor),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                decorationBox = { inner ->
                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        if (remark.isEmpty()) {
                            Text(
                                stringResource(R.string.add_note_placeholder),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        inner()
                    }
                }
            )
            if (receiptPath != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(top = 12.dp)
                ) {
                    ReceiptThumbnail(uri = receiptPath, onClick = onReceiptClick)
                    TextButton(onClick = onClearReceipt) {
                        Text(stringResource(R.string.add_remove_receipt), color = accentColor, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}
// ─────────────────────────────────────────────
// Category icon grid
// ─────────────────────────────────────────────
@Composable
fun CategoryIconGrid(
    categories: List<Category>,
    selectedCategory: Category?,
    accentColor: Color,
    onCategorySelected: (Category) -> Unit,
    onAddCategory: () -> Unit,
    modifier: Modifier = Modifier
) {
    GroupedSection(modifier = modifier) {
        val cells: List<Category?> = categories + listOf(null)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            cells.chunked(4).forEach { rowCells ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    rowCells.forEach { category ->
                        Box(modifier = Modifier.weight(1f)) {
                            if (category != null) {
                                CategoryIconTile(
                                    category = category,
                                    isSelected = selectedCategory?.id == category.id,
                                    accentColor = accentColor,
                                    onClick = { onCategorySelected(category) }
                                )
                            } else {
                                CategoryAddTile(accentColor = accentColor, onClick = onAddCategory)
                            }
                        }
                    }
                    repeat(4 - rowCells.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}
@Composable
fun CategoryRow(
    categories: List<Category>,
    selectedCategory: Category?,
    onCategorySelected: (Category) -> Unit,
    onAddCategory: () -> Unit,
    modifier: Modifier = Modifier
) {
    CategoryIconGrid(
        categories = categories,
        selectedCategory = selectedCategory,
        accentColor = MaterialTheme.colorScheme.primary,
        onCategorySelected = onCategorySelected,
        onAddCategory = onAddCategory,
        modifier = modifier
    )
}
@Composable
fun CategoryGrid(
    categories: List<Category>,
    selectedCategory: Category?,
    onCategorySelected: (Category) -> Unit,
    onAddCategory: () -> Unit,
    modifier: Modifier = Modifier
) = CategoryRow(categories, selectedCategory, onCategorySelected, onAddCategory, modifier)
@Composable
private fun CategoryIconTile(
    category: Category,
    isSelected: Boolean,
    onClick: () -> Unit,
    accentColor: Color = MaterialTheme.colorScheme.primary
) {
    val categoryColor = colorIntToCompose(category.colorInt)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .smoothClickable(onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(categoryColor)
                .then(
                    if (isSelected) Modifier.border(2.dp, accentColor, CircleShape)
                    else Modifier
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = iconForCategory(category),
                contentDescription = category.name,
                tint = iconTintOnCategoryFill(categoryColor),
                modifier = Modifier.size(24.dp)
            )
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = category.name,
            style = MaterialTheme.typography.labelSmall,
            color = if (isSelected) MaterialTheme.colorScheme.onBackground
            else MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
            maxLines = 1,
            textAlign = TextAlign.Center
        )
    }
}
@Composable
private fun CategoryAddTile(accentColor: Color, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .smoothClickable(onClick = onClick)
            .padding(vertical = 8.dp, horizontal = 4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .border(1.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f), CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Rounded.Add,
                contentDescription = stringResource(R.string.add_add_category),
                tint = accentColor,
                modifier = Modifier.size(24.dp)
            )
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = stringResource(R.string.add_new_category),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}
@Composable
private fun SelectedCategoryChip(category: Category, accentColor: Color) {
    val categoryColor = colorIntToCompose(category.colorInt)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(categoryColor.copy(alpha = 0.12f))
            .border(1.dp, categoryColor.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(categoryColor),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                iconForCategory(category),
                contentDescription = null,
                tint = iconTintOnCategoryFill(categoryColor),
                modifier = Modifier.size(16.dp)
            )
        }
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = category.name,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f)
        )
        Icon(
            Icons.Rounded.CheckCircle,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier.size(18.dp)
        )
    }
}
// Save button uses Material3 Button inline in AddTransactionScreen

@Composable
fun CustomNumericKeypad(
    onKeyPress: (String) -> Unit,
    onBackspace: () -> Unit,
    onSubmit: () -> Unit,
    accentColor: Color = MaterialTheme.colorScheme.primary,
    canSubmit: Boolean = true,
    decimalSeparator: String = ",",
    modifier: Modifier = Modifier
) {
    CalculatorKeypad(
        accentColor = accentColor,
        decimalSeparator = decimalSeparator,
        onKeyPress = onKeyPress,
        onBackspace = onBackspace,
        modifier = modifier
    )
}
@Composable
private fun CalculatorKeypad(
    accentColor: Color,
    decimalSeparator: String,
    onKeyPress: (String) -> Unit,
    onBackspace: () -> Unit,
    modifier: Modifier = Modifier
) {
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf(decimalSeparator, "0", "back")
    )
    Column(modifier = modifier) {
        rows.forEach { row ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                horizontalArrangement = Arrangement.spacedBy(AppSpacing.xs)
            ) {
                row.forEach { key ->
                    CalcKey(
                        key = key,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            when (key) {
                                "back" -> onBackspace()
                                else -> onKeyPress(key)
                            }
                        }
                    )
                }
            }
            Spacer(modifier = Modifier.height(AppSpacing.xs))
        }
    }
}
@Composable
private fun CalcKey(
    key: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val isBackspace = key == "back"
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val bg = if (pressed) AppColors.NumpadPress else Color.Transparent
    Box(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(AppRadius.sm))
            .background(bg)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        if (isBackspace) {
            Icon(
                Icons.AutoMirrored.Rounded.Backspace,
                contentDescription = stringResource(R.string.add_backspace),
                tint = AppColors.OnBackground,
                modifier = Modifier.size(24.dp)
            )
        } else {
            Text(
                text = key,
                style = MaterialTheme.typography.headlineMedium,
                color = AppColors.OnBackground,
                fontWeight = FontWeight.Medium
            )
        }
    }
}
@Composable
fun KeyItem(
    key: String,
    accentColor: Color,
    enabled: Boolean,
    modifier: Modifier,
    onClick: () -> Unit
) = CalcKey(key = key, modifier = modifier, onClick = onClick)
private fun handleKeyInput(
    current: String,
    input: String,
    decimalSeparator: Char
): String {
    val dec = decimalSeparator.toString()
    if (current == "0" && input != dec) return input
    if (input == dec && current.contains(dec)) return current
    val next = current + input
    val commaIndex = next.indexOf(dec)
    if (commaIndex >= 0 && next.length - commaIndex - 1 > 2) return current
    if (next.replace(dec, "").length > 12) return current
    return next
}

@Composable
private fun DatePickerRow(
    dateMillis: Long,
    accentColor: Color,
    onClick: () -> Unit
) {
    val formatted = remember(dateMillis) {
        SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(Date(dateMillis))
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
            .smoothClickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Rounded.CalendarToday,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier.size(18.dp)
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = stringResource(R.string.add_date_label),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = formatted,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Medium
        )
    }
}
