package com.aus.ausgegeben.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.core.tween
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aus.ausgegeben.R
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.ui.components.*
import com.aus.ausgegeben.ui.theme.*
import com.aus.ausgegeben.util.colorIntToCompose
import com.aus.ausgegeben.util.iconForCategory
import com.aus.ausgegeben.util.iconTintOnCategoryFill
import com.aus.ausgegeben.util.rememberAppHaptics
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryScreen(
    viewModel: CategoryViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val categories by viewModel.categories.collectAsStateWithLifecycle()
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
    val haptics = rememberAppHaptics()
    val scope = rememberCoroutineScope()

    fun openAddCategory() {
        editingCategory = null
        showEditorDialog = true
    }

    BackHandler(onBack = onBack)

    AppScreen(aurora = true) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 4.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .padding(start = 8.dp)
                        .size(44.dp)
                        .appGlassCard(CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    AppIconButton(
                        onClick = onBack,
                        icon = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = stringResource(R.string.action_back),
                        modifier = Modifier.size(44.dp),
                    )
                }
                ScreenTitle(
                    title = stringResource(R.string.screen_categories),
                    subtitle = stringResource(R.string.category_total_count, categories.size),
                    modifier = Modifier.weight(1f)
                )
                
                AppButton(
                    onClick = {
                        haptics.light()
                        openAddCategory()
                    },
                    containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
                    contentColor = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .padding(end = 16.dp)
                        .appGlassCard(RoundedCornerShape(AppRadius.interactive)),
                ) {
                    Icon(
                        Icons.Rounded.Add,
                        contentDescription = stringResource(R.string.category_add),
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(stringResource(R.string.category_new).lowercase())
                }
            }
            HorizontalDivider(
                thickness = 0.5.dp,
                color = appDividerColor(),
            )

            if (categories.isEmpty()) {
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    EmptyStateMessage(
                        icon = Icons.Rounded.Category,
                        title = stringResource(R.string.category_empty_title),
                        subtitle = stringResource(R.string.category_empty_subtitle),
                        actionLabel = stringResource(R.string.category_new),
                        onAction = { openAddCategory() }
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = tabScreenListBottomPadding()
                ) {
                    categoriesByType.forEachIndexed { sectionIndex, (type, typeCategories) ->
                        item(key = "header-${type.storageKey}") {
                            CategorySectionEntrance(index = sectionIndex * 3) {
                                GroupedSectionLabel(text = type.localizedLabel(LocalContext.current).lowercase())
                            }
                        }
                        itemsIndexed(typeCategories, key = { _, c -> c.id }) { index, category ->
                            CategorySectionEntrance(index = sectionIndex * 3 + 1 + index) {
                                CategoryListItem(
                                    category = category,
                                    typeLabel = type.localizedLabel(LocalContext.current),
                                    canMoveUp = index > 0,
                                    canMoveDown = index < typeCategories.lastIndex,
                                    onEdit = {
                                        editingCategory = category
                                        showEditorDialog = true
                                    },
                                    onDelete = { categoryToDelete = category },
                                    onMoveUp = { viewModel.moveCategory(category, true) },
                                    onMoveDown = { viewModel.moveCategory(category, false) },
                                    modifier = Modifier.padding(horizontal = AppSpacing.md, vertical = 4.dp)
                                )
                            }
                        }
                    }
                    item(key = "footer") { Spacer(Modifier.height(24.dp)) }
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
            onConfirm = { name, type, color, icon ->
                val editing = editingCategory
                showEditorDialog = false
                editingCategory = null
                scope.launch {
                    if (editing != null) {
                        viewModel.updateCategory(
                            editing.copy(name = name, transactionType = type, colorInt = color, iconName = icon),
                        )
                    } else {
                        viewModel.addCategory(name = name, iconName = icon, colorInt = color, transactionType = type)
                    }
                }
            }
        )
    }

    if (categoryToDelete != null) {
        val category = categoryToDelete!!
        var linkedCount by remember(category.id) { mutableIntStateOf(-1) }
        LaunchedEffect(category.id) {
            linkedCount = viewModel.countLinkedExpenses(category.id)
        }
        AppDestructiveConfirmDialog(
            onDismissRequest = { categoryToDelete = null },
            title = { Text(stringResource(R.string.add_delete_category_title)) },
            text = {
                val suffix = when (linkedCount) {
                    0 -> stringResource(R.string.add_delete_category_none)
                    1 -> stringResource(R.string.add_delete_category_one)
                    in 2..Int.MAX_VALUE -> stringResource(R.string.add_delete_category_many, linkedCount)
                    else -> stringResource(R.string.add_delete_category_fallback)
                }
                AppDialogBodyText(stringResource(R.string.add_delete_category_body, category.name, suffix))
            },
            confirmLabel = stringResource(R.string.action_delete),
            onConfirm = {
                viewModel.deleteCategory(category)
                categoryToDelete = null
            },
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
    val haptics = rememberAppHaptics()
    val categoryColor = colorIntToCompose(category.colorInt)
    
    Box(
        modifier = modifier
            .fillMaxWidth()
            .appGlassCard(RoundedCornerShape(AppRadius.card))
            .smoothClickable {
                haptics.light()
                onEdit()
            }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .appGlassCard(CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(30.dp)
                        .clip(CircleShape)
                        .background(categoryColor),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = iconForCategory(category.iconName, category.name),
                        contentDescription = null,
                        tint = iconTintOnCategoryFill(categoryColor),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 12.dp)
            ) {
                Text(
                    text = category.name,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = typeLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = readableSecondaryColor()
                )
            }
            
            Row(verticalAlignment = Alignment.CenterVertically) {
                AppIconButton(
                    onClick = onMoveUp,
                    enabled = canMoveUp,
                    icon = Icons.Rounded.KeyboardArrowUp,
                    contentDescription = stringResource(R.string.category_move_up),
                    tint = if (canMoveUp) MaterialTheme.colorScheme.onSurface else navigationInactiveColor(),
                    modifier = Modifier.size(36.dp)
                )
                AppIconButton(
                    onClick = onMoveDown,
                    enabled = canMoveDown,
                    icon = Icons.Rounded.KeyboardArrowDown,
                    contentDescription = stringResource(R.string.category_move_down),
                    tint = if (canMoveDown) MaterialTheme.colorScheme.onSurface else navigationInactiveColor(),
                    modifier = Modifier.size(36.dp)
                )
                AppIconButton(
                    onClick = onEdit,
                    icon = Icons.Rounded.Edit,
                    contentDescription = stringResource(R.string.category_edit),
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(36.dp)
                )
                AppIconButton(
                    onClick = onDelete,
                    icon = Icons.Rounded.DeleteOutline,
                    contentDescription = stringResource(R.string.action_delete),
                    tint = financeExpenseColor(),
                    modifier = Modifier.size(36.dp)
                )
            }
        }
    }
}

@Composable
private fun CategorySectionEntrance(
    index: Int,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }
    val delayMillis = 40 + index.coerceAtMost(12) * 35
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = fadeIn(animationSpec = tween(durationMillis = 420, delayMillis = delayMillis)) +
            slideInVertically(
                animationSpec = tween(durationMillis = 420, delayMillis = delayMillis),
            ) { fullHeight -> fullHeight / 6 },
    ) {
        content()
    }
}
