package com.aus.ausgegeben.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.AppRepository
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.TransactionType
import com.aus.ausgegeben.ui.label
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.argbColorsMatch
import com.aus.ausgegeben.util.CategoryColorPaletteInts
import com.aus.ausgegeben.util.CategoryIconOptions
import com.aus.ausgegeben.util.defaultIconKeyForName
import com.aus.ausgegeben.util.colorIntToCompose
import com.aus.ausgegeben.util.iconForCategory
import com.aus.ausgegeben.util.iconTintOnCategoryFill
import com.aus.ausgegeben.util.nearestPaletteColorInt
import com.aus.ausgegeben.util.normalizeArgbInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryEditorDialog(
    onDismiss: () -> Unit,
    onConfirm: (name: String, transactionType: String, colorInt: Int, iconName: String) -> Unit,
    initialCategory: Category? = null,
    lockTransactionType: TransactionType? = null,
    title: String? = null
) {
    CategoryEditorSheet(
        onDismiss = onDismiss,
        onConfirm = onConfirm,
        initialCategory = initialCategory,
        lockTransactionType = lockTransactionType,
        title = title
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryEditorSheet(
    onDismiss: () -> Unit,
    onConfirm: (name: String, transactionType: String, colorInt: Int, iconName: String) -> Unit,
    initialCategory: Category? = null,
    lockTransactionType: TransactionType? = null,
    title: String? = null
) {
    var name by remember(initialCategory) { mutableStateOf(initialCategory?.name ?: "") }
    var selectedType by remember(initialCategory, lockTransactionType) {
        mutableStateOf(
            lockTransactionType
                ?: TransactionType.fromKey(
                    initialCategory?.transactionType ?: TransactionType.EXPENSE.storageKey
                )
        )
    }
    var selectedColor by remember(initialCategory) {
        mutableIntStateOf(
            initialCategory?.colorInt?.let { nearestPaletteColorInt(it) }
                ?: CategoryColorPaletteInts.first()
        )
    }
    var selectedIconKey by remember(initialCategory) {
        mutableStateOf(
            initialCategory?.iconName?.takeIf { it.isNotBlank() && it != "category" }
                ?: initialCategory?.let { defaultIconKeyForName(it.name) }
                ?: "category"
        )
    }

    LaunchedEffect(name) {
        if (initialCategory == null && name.isNotBlank() && selectedIconKey == "category") {
            selectedIconKey = defaultIconKeyForName(name)
        }
    }

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val previewColor = colorIntToCompose(selectedColor)
    val canSave = name.isNotBlank()
    val resolvedTitle = title ?: stringResource(
        if (initialCategory == null) R.string.category_new_title else R.string.category_edit_title
    )
    val previewNamePlaceholder = stringResource(R.string.category_preview_name)
    val typeSegmentLabels = TransactionType.entries.map { it.label() }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = appSheetContainerColor(),
        scrimColor = appSheetScrimColor(),
        dragHandle = { AppSheetDragHandle() },
        shape = AppSheetShape,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = AppSpacing.base)
                .padding(bottom = AppSpacing.lg)
        ) {
            SignatureText(
                text = resolvedTitle,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            )

            Spacer(modifier = Modifier.height(AppSpacing.base))

            CategoryPreview(
                name = name.ifBlank { previewNamePlaceholder },
                color = previewColor,
                iconKey = selectedIconKey,
                isPlaceholder = name.isBlank(),
                previewLabel = stringResource(R.string.category_preview)
            )

            Spacer(modifier = Modifier.height(AppSpacing.lg))

            Text(
                text = stringResource(R.string.category_name_label),
                style = sectionLabelStyle(),
                color = readableSecondaryColor(),
            )
            Spacer(modifier = Modifier.height(AppSpacing.xs))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(AppRadius.interactive))
                    .appGlassCard(shape = RoundedCornerShape(AppRadius.interactive))
                    .padding(horizontal = AppSpacing.md, vertical = AppSpacing.sm)
            ) {
                BasicTextField(
                    value = name,
                    onValueChange = { name = it },
                    textStyle = MaterialTheme.typography.bodyLarge.copy(
                        color = MaterialTheme.colorScheme.onBackground
                    ),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    decorationBox = { inner ->
                        if (name.isEmpty()) {
                            Text(
                                stringResource(R.string.category_name_placeholder),
                                style = MaterialTheme.typography.bodyLarge,
                                color = readableSecondaryColor().copy(alpha = 0.6f)
                            )
                        }
                        inner()
                    }
                )
            }

            if (lockTransactionType == null) {
                Spacer(modifier = Modifier.height(AppSpacing.base))
                Text(
                    text = stringResource(R.string.category_type_label),
                    style = sectionLabelStyle(),
                    color = readableSecondaryColor(),
                )
                Spacer(modifier = Modifier.height(AppSpacing.xs))
                IosSegmentedControl(
                    options = typeSegmentLabels,
                    selectedIndex = TransactionType.entries.indexOf(selectedType).coerceAtLeast(0),
                    onSelected = { selectedType = TransactionType.entries[it] }
                )
            }

            Spacer(modifier = Modifier.height(AppSpacing.base))
            Text(
                text = stringResource(R.string.category_icon_label),
                style = sectionLabelStyle(),
                color = readableSecondaryColor(),
            )
            Spacer(modifier = Modifier.height(AppSpacing.xs))
            IconPickerGrid(
                selectedKey = selectedIconKey,
                previewColor = previewColor,
                onSelect = { selectedIconKey = it }
            )

            Spacer(modifier = Modifier.height(AppSpacing.base))
            Text(
                text = stringResource(R.string.category_color_label),
                style = sectionLabelStyle(),
                color = readableSecondaryColor(),
            )
            Spacer(modifier = Modifier.height(AppSpacing.xs))
            ColorPickerGrid(
                selectedColor = selectedColor,
                onSelect = { selectedColor = it }
            )

            Spacer(modifier = Modifier.height(AppSpacing.lg))

            SheetConfirmActions(
                onDismiss = onDismiss,
                onConfirm = {
                    if (canSave) {
                        onConfirm(
                            name.trim(),
                            selectedType.storageKey,
                            normalizeArgbInt(selectedColor),
                            selectedIconKey
                        )
                    }
                },
                confirmLabel = stringResource(
                    if (initialCategory == null) {
                        R.string.category_add_button
                    } else {
                        R.string.category_save_changes
                    }
                ),
                confirmEnabled = canSave,
            )
        }
    }
}

@Composable
private fun IconPickerGrid(
    selectedKey: String,
    previewColor: Color,
    onSelect: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        CategoryIconOptions.chunked(6).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                row.forEach { option ->
                    val selected = selectedKey == option.key
                    val tileColor = if (selected) previewColor else MaterialTheme.colorScheme.surfaceVariant
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (selected) tileColor else tileColor.copy(alpha = 0.7f))
                            .then(
                                if (selected) Modifier.border(2.dp, Color.White.copy(alpha = 0.85f), RoundedCornerShape(12.dp))
                                else Modifier.border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                            )
                            .clickable { onSelect(option.key) },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            option.icon,
                            contentDescription = option.label,
                            tint = if (selected) iconTintOnCategoryFill(previewColor)
                            else MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                }
                repeat(6 - row.size) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun ColorPickerGrid(
    selectedColor: Int,
    onSelect: (Int) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        CategoryColorPaletteInts.chunked(8).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                row.forEach { intColor ->
                    val paletteColor = colorIntToCompose(intColor)
                    val selected = argbColorsMatch(selectedColor, intColor)
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(paletteColor)
                            .then(
                                if (selected) {
                                    Modifier.border(3.dp, Color.White, CircleShape)
                                } else {
                                    Modifier
                                }
                            )
                            .clickable { onSelect(intColor) },
                        contentAlignment = Alignment.Center
                    ) {
                        if (selected) {
                            Icon(
                                Icons.Rounded.Check,
                                contentDescription = null,
                                tint = iconTintOnCategoryFill(paletteColor),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryPreview(
    name: String,
    color: Color,
    iconKey: String,
    isPlaceholder: Boolean,
    previewLabel: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .shadow(8.dp, CircleShape, ambientColor = color.copy(alpha = 0.3f))
                .clip(CircleShape)
                .background(color),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                iconForCategory(iconKey, name),
                contentDescription = null,
                tint = iconTintOnCategoryFill(color),
                modifier = Modifier.size(28.dp)
            )
        }
        Spacer(modifier = Modifier.width(16.dp))
        Column {
            Text(
                text = name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (isPlaceholder) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.onBackground
                }
            )
            Text(
                text = previewLabel,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryManageSheet(
    categories: List<Category>,
    transactionType: TransactionType,
    onDismiss: () -> Unit,
    onAddCategory: () -> Unit,
    onEditCategory: (Category) -> Unit,
    onDeleteCategory: (Category) -> Unit,
    onMoveCategory: (Category, Boolean) -> Unit,
    onDeduplicate: (() -> Unit)? = null,
    isReordering: Boolean = false
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val typeLabel = transactionType.label()
    var showDeduplicateConfirm by remember { mutableStateOf(false) }
    val visibleCategories = remember(categories) {
        categories.filter { it.id != AppRepository.UNCATEGORIZED_ID }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = appSheetContainerColor(),
        scrimColor = appSheetScrimColor(),
        dragHandle = { AppSheetDragHandle() },
        shape = AppSheetShape,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = AppSpacing.base)
                .padding(bottom = AppSpacing.xl)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    SignatureText(
                        text = stringResource(R.string.category_manage_title),
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                    )
                    Text(
                        stringResource(R.string.category_manage_subtitle, typeLabel, visibleCategories.size),
                        style = MaterialTheme.typography.bodyMedium,
                        color = readableSecondaryColor()
                    )
                }

                if (onDeduplicate != null) {
                    AppIconButton(
                        onClick = { showDeduplicateConfirm = true },
                        icon = Icons.Rounded.CleaningServices,
                        contentDescription = stringResource(R.string.settings_deduplicate_label),
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(end = AppSpacing.xxs)
                    )
                }

                AppButton(
                    onClick = onAddCategory,
                    containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                    contentColor = MaterialTheme.colorScheme.primary
                ) {
                    Icon(
                        Icons.Rounded.Add,
                        contentDescription = null,
                        modifier = Modifier.size(AppIconSize.sm)
                    )
                    Spacer(modifier = Modifier.width(AppSpacing.xxs))
                    Text(stringResource(R.string.category_new).lowercase())
                }
            }

            Spacer(modifier = Modifier.height(AppSpacing.md))

            if (visibleCategories.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = AppSpacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        Icons.Rounded.Category,
                        contentDescription = null,
                        tint = readableSecondaryColor(),
                        modifier = Modifier.size(40.dp)
                    )
                    Spacer(modifier = Modifier.height(AppSpacing.sm))
                    Text(
                        stringResource(R.string.category_empty_title),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        stringResource(R.string.category_manage_empty_subtitle),
                        style = MaterialTheme.typography.bodyMedium,
                        color = readableSecondaryColor(),
                        textAlign = TextAlign.Center
                    )
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(AppSpacing.xs),
                    modifier = Modifier.heightIn(max = 400.dp)
                ) {
                    itemsIndexed(visibleCategories, key = { _, c -> c.id }) { index, category ->
                        CategoryManageRow(
                            category = category,
                            canMoveUp = index > 0 && !isReordering,
                            canMoveDown = index < visibleCategories.lastIndex && !isReordering,
                            onEdit = { onEditCategory(category) },
                            onDelete = { onDeleteCategory(category) },
                            onMoveUp = { onMoveCategory(category, true) },
                            onMoveDown = { onMoveCategory(category, false) }
                        )
                    }
                }
            }
        }
    }

    if (showDeduplicateConfirm) {
        AppAlertDialog(
            onDismissRequest = { showDeduplicateConfirm = false },
            title = { Text(stringResource(R.string.category_deduplicate_title)) },
            text = { AppDialogBodyText(stringResource(R.string.category_deduplicate_message)) },
            confirmButton = {
                AppButton(
                    onClick = {
                        onDeduplicate?.invoke()
                        showDeduplicateConfirm = false
                    },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = contrastColorOn(MaterialTheme.colorScheme.primary)
                ) {
                    Text(stringResource(R.string.category_deduplicate_confirm).lowercase())
                }
            },
            dismissButton = {
                AppTextButton(
                    onClick = { showDeduplicateConfirm = false },
                    text = stringResource(R.string.action_cancel).lowercase(),
                    contentColor = MaterialTheme.colorScheme.onSurface
                )
            }
        )
    }
}

@Composable
private fun CategoryManageRow(
    category: Category,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit
) {
    val categoryColor = colorIntToCompose(category.colorInt)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(AppRadius.interactive))
            .appGlassCard(shape = RoundedCornerShape(AppRadius.interactive))
            .clickable(onClick = onEdit)
            .padding(start = AppSpacing.sm, end = AppSpacing.xxs, top = AppSpacing.xs, bottom = AppSpacing.xs),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(categoryColor),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                iconForCategory(category),
                contentDescription = null,
                tint = iconTintOnCategoryFill(categoryColor),
                modifier = Modifier.size(AppIconSize.md)
            )
        }
        Spacer(modifier = Modifier.width(AppSpacing.sm))
        Text(
            text = category.name,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.weight(1f)
        )
        AppIconButton(
            onClick = onMoveUp,
            enabled = canMoveUp,
            icon = Icons.Rounded.KeyboardArrowUp,
            contentDescription = stringResource(R.string.category_move_up),
            tint = readableSecondaryColor(),
            modifier = Modifier.size(44.dp)
        )
        AppIconButton(
            onClick = onMoveDown,
            enabled = canMoveDown,
            icon = Icons.Rounded.KeyboardArrowDown,
            contentDescription = stringResource(R.string.category_move_down),
            tint = readableSecondaryColor(),
            modifier = Modifier.size(44.dp)
        )
        AppIconButton(
            onClick = onEdit,
            icon = Icons.Rounded.Edit,
            contentDescription = stringResource(R.string.category_edit),
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(44.dp)
        )
        AppIconButton(
            onClick = onDelete,
            icon = Icons.Rounded.Delete,
            contentDescription = stringResource(R.string.action_delete),
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(44.dp)
        )
    }
}
