package com.aus.ausgegeben.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.components.CategoryEditorDialog
import com.aus.ausgegeben.ui.components.EmptyStateMessage
import com.aus.ausgegeben.ui.components.GroupedSectionLabel
import com.aus.ausgegeben.ui.components.tabScreenListBottomPadding
import com.aus.ausgegeben.ui.components.SmoothIconButton
import com.aus.ausgegeben.ui.theme.AccentCoral
import com.aus.ausgegeben.util.colorIntToCompose
import com.aus.ausgegeben.util.iconForCategory
import com.aus.ausgegeben.util.iconTintOnCategoryFill

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryScreen(
    viewModel: CategoryViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val categories by viewModel.categories.collectAsState()
    val categoriesByType = remember(categories) {
        TransactionType.entries.mapNotNull { type ->
            val items = categories
                .filter { it.transactionType == type.storageKey }
                .sortedBy { it.sortOrder }
            if (items.isEmpty()) null else type to items
        }
    }
    var showEditorDialog by remember { mutableStateOf(false) }
    var editingCategory by remember { mutableStateOf<Category?>(null) }
    var categoryToDelete by remember { mutableStateOf<Category?>(null) }

    BackHandler(onBack = onBack)

    Column(modifier = modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            SmoothIconButton(
                onClick = onBack,
                icon = Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = stringResource(R.string.action_back)
            )
            Column(modifier = Modifier.weight(1f).padding(horizontal = 8.dp)) {
                Text(
                    text = stringResource(R.string.screen_categories),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Text(
                    text = stringResource(R.string.category_total_count, categories.size),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            FilledTonalButton(
                onClick = {
                    editingCategory = null
                    showEditorDialog = true
                },
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
                Spacer(modifier = Modifier.width(4.dp))
                Text(stringResource(R.string.category_new))
            }
        }

        if (categories.isEmpty()) {
            EmptyStateMessage(
                icon = Icons.Rounded.Category,
                title = stringResource(R.string.category_empty_title),
                subtitle = stringResource(R.string.category_empty_subtitle),
                modifier = Modifier.weight(1f)
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = tabScreenListBottomPadding()
            ) {
                categoriesByType.forEach { (type, typeCategories) ->
                    item(key = "header-${type.storageKey}") {
                        GroupedSectionLabel(text = type.label())
                    }
                    itemsIndexed(typeCategories, key = { _, c -> c.id }) { index, category ->
                        CategoryListItem(
                            category = category,
                            typeLabel = type.label(),
                            canMoveUp = index > 0,
                            canMoveDown = index < typeCategories.lastIndex,
                            onEdit = {
                                editingCategory = category
                                showEditorDialog = true
                            },
                            onDelete = { categoryToDelete = category },
                            onMoveUp = { viewModel.moveCategory(category, moveUp = true) },
                            onMoveDown = { viewModel.moveCategory(category, moveUp = false) },
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }
    }

    if (showEditorDialog) {
        CategoryEditorDialog(
            initialCategory = editingCategory,
            onDismiss = {
                showEditorDialog = false
                editingCategory = null
            },
            onConfirm = { name, type, colorInt, iconName ->
                if (editingCategory != null) {
                    viewModel.updateCategory(
                        editingCategory!!.copy(
                            name = name,
                            transactionType = type,
                            colorInt = colorInt,
                            iconName = iconName
                        )
                    )
                } else {
                    viewModel.addCategory(
                        name = name,
                        iconName = iconName,
                        colorInt = colorInt,
                        transactionType = type
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
            linkedCount = viewModel.countLinkedExpenses(category.id)
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
                        viewModel.deleteCategory(category)
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

@Composable
private fun CategoryListItem(
    category: Category,
    typeLabel: String,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
            .padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(colorIntToCompose(category.colorInt)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                iconForCategory(category),
                contentDescription = null,
                tint = iconTintOnCategoryFill(colorIntToCompose(category.colorInt)),
                modifier = Modifier.size(18.dp)
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = category.name,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = typeLabel,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        IconButton(onClick = onMoveUp, enabled = canMoveUp) {
            Icon(Icons.Rounded.KeyboardArrowUp, contentDescription = stringResource(R.string.category_move_up))
        }
        IconButton(onClick = onMoveDown, enabled = canMoveDown) {
            Icon(Icons.Rounded.KeyboardArrowDown, contentDescription = stringResource(R.string.category_move_down))
        }
        IconButton(onClick = onEdit) {
            Icon(Icons.Rounded.Edit, contentDescription = stringResource(R.string.category_edit))
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
