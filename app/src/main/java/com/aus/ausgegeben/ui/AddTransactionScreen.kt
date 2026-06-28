package com.aus.ausgegeben.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.components.CategoryEditorDialog
import com.aus.ausgegeben.ui.components.CategoryManageSheet
import com.aus.ausgegeben.ui.components.ReceiptImageDialog
import com.aus.ausgegeben.ui.components.ReceiptThumbnail
import com.aus.ausgegeben.ui.components.AppIconButton
import com.aus.ausgegeben.ui.components.AppTextButton
import com.aus.ausgegeben.ui.components.smoothClickable
import com.aus.ausgegeben.ui.theme.isAppDarkTheme
import com.aus.ausgegeben.util.CurrencyUtils
import com.aus.ausgegeben.util.colorIntToCompose
import com.aus.ausgegeben.util.iconForCategory
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private object ObsidianTokens {
    @Composable
    fun background() = MaterialTheme.colorScheme.background

    @Composable
    fun surface() = MaterialTheme.colorScheme.surface

    @Composable
    fun voidButton() = if (isAppDarkTheme()) Color(0xFF18181B) else MaterialTheme.colorScheme.surfaceVariant

    @Composable
    fun voidContent() = if (isAppDarkTheme()) Color(0xFF3F3F46) else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)

    @Composable
    fun slate() = MaterialTheme.colorScheme.onSurfaceVariant

    @Composable
    fun hairline() = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)
    
    @Composable
    fun income() = Color(0xFF10B981)

    @Composable
    fun expense() = Color(0xFFFB7185)

    @Composable
    fun transfer() = Color(0xFF94A3B8)

    @Composable
    fun labelStyle() = TextStyle(
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.5.sp,
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
        if (isEditing) {
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
            it.id != 0L && it.name.isNotBlank() && it.name != "0" && CategoryGroups.matches(transactionType, it) 
        }
    }

    val canSave = selectedCategory != null && (CurrencyUtils.parseAmount(amountText, currencyCode) ?: 0.0) > 0

    BackHandler(onBack = onBack)

    Scaffold(
        containerColor = ObsidianTokens.background(),
        topBar = {
            ObsidianTopBar(
                isEditing = isEditing,
                onBack = onBack,
                onOpenCamera = onOpenCamera,
                hasReceipt = receiptPath != null,
                accentColor = typeAccent
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Main content area - COMPACTED to fit without scrolling
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                ObsidianTypeSelector(
                    selectedIndex = selectedTab,
                    onSelected = { selectedTab = it }
                )

                Spacer(modifier = Modifier.height(12.dp)) // Reduced from 24.dp

                ObsidianFieldGroup {
                    DatePickerRow(
                        dateMillis = dateMillis,
                        accentColor = typeAccent,
                        onClick = { showDatePicker = true }
                    )
                    
                    HorizontalDivider(color = ObsidianTokens.hairline())
                    
                    ObsidianNoteField(
                        remark = remarkText,
                        onRemarkChange = { remarkText = it },
                        accentColor = typeAccent,
                        receiptPath = receiptPath,
                        onReceiptClick = { showReceiptPreview = true },
                        onClearReceipt = { viewModel.setReceiptPath(null) }
                    )
                }

                Spacer(modifier = Modifier.height(16.dp)) // Reduced from 24.dp

                ObsidianCategoryHeader(onManage = { showManageSheet = true })

                // Compacting the slider area
                Box(modifier = Modifier.weight(1f, fill = false)) {
                    ObsidianCategorySlider(
                        categories = filteredCategories,
                        selectedCategory = selectedCategory,
                        onCategorySelected = { viewModel.onCategorySelect(it) },
                        onAddCategory = {
                            editingCategory = null
                            showEditorDialog = true
                        }
                    )
                }
            }

            // Fixed Numpad Container at the absolute bottom
            ObsidianNumpadContainer(
                amountText = amountText,
                currencyCode = currencyCode,
                transactionType = transactionType,
                canSave = canSave,
                isEditing = isEditing,
                onKeyPress = { key ->
                    amountText = handleKeyInput(amountText, key, CurrencyUtils.decimalSeparator(currencyCode))
                },
                onBackspace = {
                    amountText = if (amountText.length > 1) amountText.dropLast(1) else "0"
                },
                onSave = {
                    val wasEditing = isEditing
                    viewModel.onAmountChange(amountText)
                    viewModel.onNoteChange(remarkText)
                    viewModel.saveExpense(
                        type = transactionType,
                        onSuccess = { onTransactionSaved(wasEditing) },
                        onError = onValidationError,
                        onBudgetAlert = onBudgetAlert
                    )
                }
            )
        }
    }

    // Overlay Dialogs
    if (showReceiptPreview && receiptPath != null) {
        ReceiptImageDialog(uri = receiptPath!!, onDismiss = { showReceiptPreview = false })
    }

    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(initialSelectedDateMillis = dateMillis)
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { viewModel.onDateChange(it) }
                    showDatePicker = false
                }) { Text("OK") }
            }
        ) { DatePicker(state = datePickerState) }
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
        AlertDialog(
            onDismissRequest = { categoryToDelete = null },
            title = { Text(stringResource(R.string.add_delete_category_title)) },
            confirmButton = {
                TextButton(onClick = {
                    if (selectedCategory?.id == category.id) viewModel.clearCategorySelection()
                    categoryViewModel.deleteCategory(category)
                    categoryToDelete = null
                }) { Text(stringResource(R.string.action_delete), color = ObsidianTokens.expense()) }
            },
            dismissButton = {
                TextButton(onClick = { categoryToDelete = null }) { Text(stringResource(R.string.action_cancel)) }
            }
        )
    }
}

@Composable
private fun ObsidianTopBar(
    isEditing: Boolean,
    onBack: () -> Unit,
    onOpenCamera: () -> Unit,
    hasReceipt: Boolean,
    accentColor: Color
) {
    // Law 1: Ironclad Row Alignment
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 8.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        AppIconButton(
            onClick = onBack,
            icon = Icons.AutoMirrored.Rounded.ArrowBack,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface
        )
        Text(
            text = if (isEditing) stringResource(R.string.add_edit_title) else stringResource(R.string.add_new_title),
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f).padding(horizontal = 12.dp)
        )
        AppIconButton(
            onClick = onOpenCamera,
            icon = if (hasReceipt) Icons.Rounded.ReceiptLong else Icons.Rounded.CameraAlt,
            contentDescription = null,
            tint = if (hasReceipt) accentColor else ObsidianTokens.slate()
        )
    }
}

@Composable
private fun ObsidianTypeSelector(
    selectedIndex: Int,
    onSelected: (Int) -> Unit
) {
    val options = listOf(
        stringResource(R.string.add_type_expense),
        stringResource(R.string.add_type_income),
        stringResource(R.string.add_type_transfer)
    )

    // Law 1 & 4: Uniform control
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(42.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(ObsidianTokens.surface())
            .border(BorderStroke(1.dp, ObsidianTokens.hairline()), RoundedCornerShape(12.dp))
            .padding(4.dp)
    ) {
        options.forEachIndexed { index, title ->
            val isSelected = selectedIndex == index
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isSelected) ObsidianTokens.background() else Color.Transparent)
                    .smoothClickable { onSelected(index) },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = title.uppercase(),
                    // Law 4: Symmetric padding
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    style = TextStyle(
                        fontSize = 11.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        letterSpacing = 1.sp,
                        color = if (isSelected) MaterialTheme.colorScheme.onSurface else ObsidianTokens.slate()
                    )
                )
            }
        }
    }
}

@Composable
private fun ObsidianFieldGroup(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(ObsidianTokens.surface())
            .border(BorderStroke(1.dp, ObsidianTokens.hairline()), RoundedCornerShape(16.dp)),
        content = content
    )
}

@Composable
private fun DatePickerRow(dateMillis: Long, accentColor: Color, onClick: () -> Unit) {
    val formatted = SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(Date(dateMillis))
    // Law 1: Row Alignment
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .smoothClickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Rounded.CalendarToday, null, tint = accentColor, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = "DATE", 
            style = ObsidianTokens.labelStyle(),
            modifier = Modifier.weight(1f)
        )
        Text(
            text = formatted, 
            style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"), 
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun ObsidianNoteField(
    remark: String,
    onRemarkChange: (String) -> Unit,
    accentColor: Color,
    receiptPath: String?,
    onReceiptClick: () -> Unit,
    onClearReceipt: () -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Notes, null, tint = ObsidianTokens.slate(), modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Text("NOTE", style = ObsidianTokens.labelStyle())
        }
        
        Spacer(modifier = Modifier.height(8.dp))

        BasicTextField(
            value = remark,
            onValueChange = onRemarkChange,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
            cursorBrush = SolidColor(accentColor),
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { inner ->
                if (remark.isEmpty()) {
                    Text("Optional details...", color = ObsidianTokens.voidContent(), style = MaterialTheme.typography.bodyLarge)
                }
                inner()
            }
        )

        if (receiptPath != null) {
            Spacer(modifier = Modifier.height(12.dp))
            // Law 1: Row Alignment
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                ReceiptThumbnail(uri = receiptPath, onClick = onReceiptClick)
                Spacer(modifier = Modifier.width(12.dp))
                Box(modifier = Modifier.weight(1f)) {
                    AppTextButton(onClick = onClearReceipt, text = "Remove Receipt", contentColor = ObsidianTokens.expense())
                }
            }
        }
    }
}

@Composable
private fun ObsidianCategoryHeader(onManage: () -> Unit) {
    // Law 1: Row Alignment
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 24.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "CATEGORY", 
            style = ObsidianTokens.labelStyle(),
            modifier = Modifier.weight(1f)
        )
        TextButton(onClick = onManage) {
            Text("MANAGE", style = ObsidianTokens.labelStyle().copy(color = MaterialTheme.colorScheme.onSurface))
        }
    }
}

@Composable
private fun ObsidianCategorySlider(
    categories: List<Category>,
    selectedCategory: Category?,
    onCategorySelected: (Category) -> Unit,
    onAddCategory: () -> Unit
) {
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(categories, key = { it.id }) { category ->
            val isSelected = selectedCategory?.id == category.id
            val categoryColor = colorIntToCompose(category.colorInt)
            
            Column(
                modifier = Modifier
                    .wrapContentWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (isSelected) categoryColor.copy(alpha = 0.15f) else ObsidianTokens.surface())
                    .border(
                        BorderStroke(1.dp, if (isSelected) categoryColor.copy(alpha = 0.4f) else ObsidianTokens.hairline()),
                        RoundedCornerShape(12.dp)
                    )
                    .smoothClickable { onCategorySelected(category) }
                    // Law 4: Symmetric padding - SLIMMED for vertical fit
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = iconForCategory(category),
                    contentDescription = null,
                    tint = if (isSelected) categoryColor else ObsidianTokens.slate(),
                    modifier = Modifier.size(18.dp) // Reduced from 20.dp
                )
                Spacer(modifier = Modifier.height(4.dp)) // Reduced from 6.dp
                Text(
                    text = category.name,
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontWeight = FontWeight.Medium,
                        fontSize = 11.sp // Slightly smaller
                    ),
                    color = if (isSelected) MaterialTheme.colorScheme.onSurface else ObsidianTokens.slate(),
                    maxLines = 1
                )
            }
        }

        item {
            Box(
                modifier = Modifier
                    .size(width = 48.dp, height = 64.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(ObsidianTokens.surface())
                    .border(BorderStroke(1.dp, ObsidianTokens.hairline()), RoundedCornerShape(12.dp))
                    .smoothClickable { onAddCategory() },
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Rounded.Add, null, tint = ObsidianTokens.slate())
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
    isEditing: Boolean,
    onKeyPress: (String) -> Unit,
    onBackspace: () -> Unit,
    onSave: () -> Unit
) {
    val accentColor = when (transactionType) {
        TransactionType.INCOME -> ObsidianTokens.income()
        TransactionType.TRANSFER -> ObsidianTokens.transfer()
        else -> ObsidianTokens.expense()
    }

    val amountScale by animateFloatAsState(
        targetValue = if (amountText == "0") 1f else 1.05f,
        animationSpec = spring(dampingRatio = 0.6f, stiffness = 400f),
        label = "amountScale"
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(ObsidianTokens.surface())
            .border(BorderStroke(1.dp, ObsidianTokens.hairline()), RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        // Hero Amount Display - Law 1 & 2
        Row(
            modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp), // Further reduced from 8.dp
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.Center
        ) {
            Text(
                text = CurrencyUtils.symbolFor(currencyCode),
                style = TextStyle(
                    fontSize = 24.sp, // Reduced from 28.sp
                    fontWeight = FontWeight.Light,
                    color = if (amountText == "0") ObsidianTokens.voidContent() else MaterialTheme.colorScheme.onSurface
                ),
                modifier = Modifier.padding(bottom = 6.dp, end = 6.dp).scale(amountScale)
            )
            Text(
                text = amountText,
                style = TextStyle(
                    fontSize = 44.sp, // Reduced from 56.sp
                    fontWeight = FontWeight.Light,
                    fontFeatureSettings = "tnum", // Law 2
                    color = if (amountText == "0") ObsidianTokens.voidContent() else MaterialTheme.colorScheme.onSurface
                ),
                modifier = Modifier.scale(amountScale)
            )
        }

        // Numpad Grid
        val keys = listOf(
            listOf("1", "2", "3"),
            listOf("4", "5", "6"),
            listOf("7", "8", "9"),
            listOf(CurrencyUtils.decimalSeparator(currencyCode).toString(), "0", "back")
        )

        keys.forEach { row ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { key ->
                    ObsidianKey(
                        key = key,
                        modifier = Modifier.weight(1f).height(52.dp), // Reduced from 64.dp
                        onPress = { if (key == "back") onBackspace() else onKeyPress(key) }
                    )
                }
            }
            Spacer(modifier = Modifier.height(4.dp))
        }

        Spacer(modifier = Modifier.height(8.dp)) // Reduced from 12.dp

        // Premium CTA
        if (canSave) {
            Button(
                onClick = onSave,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .shadow(
                        elevation = 12.dp,
                        shape = RoundedCornerShape(16.dp),
                        spotColor = accentColor,
                        ambientColor = accentColor.copy(alpha = 0.3f)
                    ),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = accentColor,
                    contentColor = Color.White
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
            ) {
                Text(
                    text = if (isEditing) "SAVE CHANGES" else "CONFIRM TRANSACTION",
                    style = TextStyle(fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .border(1.dp, if (isAppDarkTheme()) Color(0xFF3F3F46) else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
                    .background(Color.Transparent),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (isEditing) "SAVE CHANGES" else "CONFIRM TRANSACTION",
                    style = TextStyle(
                        fontWeight = FontWeight.Bold, 
                        letterSpacing = 1.2.sp,
                        color = ObsidianTokens.slate()
                    )
                )
            }
        }
    }
}

@Composable
private fun ObsidianKey(key: String, modifier: Modifier, onPress: () -> Unit) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = ripple(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f)),
                onClick = onPress
            ),
        contentAlignment = Alignment.Center
    ) {
        if (key == "back") {
            Icon(Icons.AutoMirrored.Rounded.Backspace, null, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(22.dp))
        } else {
            Text(
                text = key,
                style = TextStyle(
                    fontSize = 26.sp, // Reduced from 32.sp
                    fontWeight = FontWeight.Light,
                    fontFeatureSettings = "tnum",
                    color = MaterialTheme.colorScheme.onSurface
                )
            )
        }
    }
}

private fun handleKeyInput(current: String, input: String, decimalSeparator: Char): String {
    val dec = decimalSeparator.toString()
    if (current == "0" && input != dec) return input
    if (input == dec && current.contains(dec)) return current
    val next = current + input
    val commaIndex = next.indexOf(dec)
    if (commaIndex >= 0 && next.length - commaIndex - 1 > 2) return current
    if (next.replace(dec, "").length > 12) return current
    return next
}
