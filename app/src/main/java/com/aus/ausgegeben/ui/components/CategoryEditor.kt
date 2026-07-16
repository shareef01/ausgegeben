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
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.TransactionType
import com.aus.ausgegeben.ui.label
import com.aus.ausgegeben.ui.theme.AccentCoral
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
        containerColor = MaterialTheme.colorScheme.surface,
        dragHandle = { BottomSheetDefaults.DragHandle() }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp)
        ) {
            Text(
                text = resolvedTitle,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )

            Spacer(modifier = Modifier.height(20.dp))

            CategoryPreview(
                name = name.ifBlank { previewNamePlaceholder },
                color = previewColor,
                iconKey = selectedIconKey,
                isPlaceholder = name.isBlank(),
                previewLabel = stringResource(R.string.category_preview)
            )

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = stringResource(R.string.category_name_label),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
                    .padding(horizontal = 16.dp, vertical = 14.dp)
            ) {
                BasicTextField(
                    value = name,
                    onValueChange = { name = it },
                    textStyle = MaterialTheme.typography.bodyLarge.copy(
                        color = MaterialTheme.colorScheme.onBackground
                    ),
                    cursorBrush = SolidColor(AccentCoral),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    decorationBox = { inner ->
                        if (name.isEmpty()) {
                            Text(
                                stringResource(R.string.category_name_placeholder),
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        inner()
                    }
                )
            }

            if (lockTransactionType == null) {
                Spacer(modifier = Modifier.height(20.dp))
                Text(
                    text = stringResource(R.string.category_type_label),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                IosSegmentedControl(
                    options = typeSegmentLabels,
                    selectedIndex = TransactionType.entries.indexOf(selectedType).coerceAtLeast(0),
                    onSelected = { selectedType = TransactionType.entries[it] }
                )
            }

            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = stringResource(R.string.category_icon_label),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(10.dp))
            IconPickerGrid(
                selectedKey = selectedIconKey,
                previewColor = previewColor,
                onSelect = { selectedIconKey = it }
            )

            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = stringResource(R.string.category_color_label),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(10.dp))
            ColorPickerGrid(
                selectedColor = selectedColor,
                onSelect = { selectedColor = it }
            )

            Spacer(modifier = Modifier.height(24.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Text(stringResource(R.string.action_cancel))
                }
                Button(
                    onClick = {
                        if (canSave) {
                            onConfirm(
                                name.trim(),
                                selectedType.storageKey,
                                normalizeArgbInt(selectedColor),
                                selectedIconKey
                            )
                        }
                    },
                    enabled = canSave,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = AccentCoral)
                ) {
                    Text(
                        stringResource(
                            if (initialCategory == null) {
                                R.string.category_add_button
                            } else {
                                R.string.category_save_changes
                            }
                        )
                    )
                }
            }
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
    onDeduplicate: (() -> Unit)? = null
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val typeLabel = transactionType.label()
    var showDeduplicateConfirm by remember { mutableStateOf(false) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        dragHandle = { BottomSheetDefaults.DragHandle() }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 32.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        stringResource(R.string.category_manage_title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        stringResource(R.string.category_manage_subtitle, typeLabel, categories.size),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                if (onDeduplicate != null) {
                    IconButton(
                        onClick = { showDeduplicateConfirm = true },
                        modifier = Modifier.padding(end = 4.dp)
                    ) {
                        Icon(
                            Icons.Rounded.CleaningServices,
                            contentDescription = "Merge Duplicates",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }

                FilledTonalButton(
                    onClick = onAddCategory,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.filledTonalButtonColors(
                        containerColor = AccentCoral.copy(alpha = 0.15f),
                        contentColor = AccentCoral
                    )
                ) {
                    Icon(
                        Icons.Rounded.Add,
                        contentDescription = stringResource(R.string.category_add),
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(stringResource(R.string.category_new))
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            if (categories.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        Icons.Rounded.Category,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(40.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        stringResource(R.string.category_empty_title),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onBackground
                    )
                    Text(
                        stringResource(R.string.category_manage_empty_subtitle),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.heightIn(max = 400.dp)
                ) {
                    itemsIndexed(categories, key = { _, c -> c.id }) { index, category ->
                        CategoryManageRow(
                            category = category,
                            canMoveUp = index > 0,
                            canMoveDown = index < categories.lastIndex,
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
        AlertDialog(
            onDismissRequest = { showDeduplicateConfirm = false },
            title = { Text(stringResource(R.string.category_deduplicate_title)) },
            text = { Text(stringResource(R.string.category_deduplicate_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        onDeduplicate?.invoke()
                        showDeduplicateConfirm = false
                    }
                ) {
                    Text(stringResource(R.string.category_deduplicate_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeduplicateConfirm = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
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
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
            .clickable(onClick = onEdit)
            .padding(start = 12.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
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
                modifier = Modifier.size(20.dp)
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = category.name,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.weight(1f)
        )
        IconButton(onClick = onMoveUp, enabled = canMoveUp) {
            Icon(Icons.Rounded.KeyboardArrowUp, contentDescription = stringResource(R.string.category_move_up))
        }
        IconButton(onClick = onMoveDown, enabled = canMoveDown) {
            Icon(Icons.Rounded.KeyboardArrowDown, contentDescription = stringResource(R.string.category_move_down))
        }
        IconButton(onClick = onEdit) {
            Icon(Icons.Rounded.Edit, contentDescription = stringResource(R.string.category_edit), tint = AccentCoral)
        }
        IconButton(onClick = onDelete) {
            Icon(
                Icons.Rounded.Delete,
                contentDescription = stringResource(R.string.action_delete),
                tint = MaterialTheme.colorScheme.error
            )
        }
    }
}
