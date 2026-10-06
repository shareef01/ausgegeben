package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.*
import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.io.File

class CategoryBudgetsTest {
    private val category = Category("food", "Food", "restaurant", 0)
    private val budget = CategoryBudget("food", 100.0, 80, 1)
    @Test fun acceptsLegacyCategoryIds() { assertTrue(budget.copy(categoryId = "legacy-" + "x".repeat(80)).valid()) }
    @Test fun exactThresholdAndLimitBoundaries() {
        listOf(0.0 to "normal",79.99 to "normal",80.0 to "warning",99.99 to "warning",100.0 to "reached",100.01 to "over").forEach { (spent,state) ->
            val result = categoryBudgetProgress(listOf(budget),listOf(category),listOf(Expense(id="x",amount=spent,categoryId="food",dateMillis=1,note=""))).single()
            assertEquals(state,result.state)
            assertEquals(maxOf(0.0,CurrencyUtils.toMinorUnits(100.0-spent)/100.0),result.remaining,0.001)
        }
    }
    @Test fun rejectsInvalidBudgetsAndThresholds() {
        listOf(0.0,-1.0,12.345,Double.NaN,Double.POSITIVE_INFINITY,1e9).forEach { assertFalse(budget.copy(monthlyLimit=it).valid()) }
        listOf(0,101).forEach { assertFalse(budget.copy(warningThresholdPercent=it).valid()) }
        assertTrue(budget.copy(monthlyLimit=999999999.99).valid())
        assertTrue(budget.copy(monthlyLimit=12.34).valid())
    }
    @Test fun allocationWithAbsentEqualUnderAndOverGlobal() {
        assertEquals(BudgetAllocation(100.0,null,0.0),budgetAllocation(listOf(budget),null))
        assertEquals(BudgetAllocation(100.0,50.0,0.0),budgetAllocation(listOf(budget),150.0))
        assertEquals(BudgetAllocation(100.0,0.0,0.0),budgetAllocation(listOf(budget),100.0))
        assertEquals(BudgetAllocation(100.0,0.0,25.0),budgetAllocation(listOf(budget),75.0))
        assertEquals(0.0,budgetAllocation(emptyList(),null).total,0.0)
    }
    @Test fun stableOrderAndNoBudgetOrIncomeSpending() {
        val other=category.copy(id="a")
        assertEquals(listOf("a","food"),categoryBudgetProgress(listOf(budget,budget.copy(categoryId="a")),listOf(category,other),emptyList()).map { it.category.id })
        assertTrue(categoryBudgetProgress(emptyList(),listOf(category),emptyList()).isEmpty())
        assertEquals(0.0,categoryBudgetProgress(listOf(budget),listOf(category),listOf(Expense(amount=25.0,categoryId="food",dateMillis=1,transactionType="income",note=""))).single().spent,0.0)
    }
    @Test fun exportsV2AndReadsV1WithoutBudgets() {
        val json=BackupFormat.createBackupJson(BackupFormat.BackupPreferences("EUR",null),listOf(category),emptyList(),"test",categoryBudgets=listOf(budget),schemaVersion=2)
        assertEquals(listOf(budget),BackupFormat.parseBackup(json)!!.categoryBudgets)
        val old=JSONObject(json);old.put("schemaVersion",1);old.remove("categoryBudgets")
        assertTrue(BackupFormat.validateBackupJson(old.toString()).valid)
        old.put("categoryBudgets",org.json.JSONArray())
        assertFalse(BackupFormat.validateBackupJson(old.toString()).valid)
    }
    @Test fun androidExportMatchesCrossPlatformGoldenContract() {
        var root=File(".").absoluteFile
        while (!File(root,"test-fixtures/category-budgets").exists() && root.parentFile!=null) root=root.parentFile!!
        listOf("android-v2","shared-v2-empty","shared-v2-multiple").forEach { name ->
            val fixture=BackupFormat.parseBackup(File(root,"test-fixtures/category-budgets/$name.json").readText())!!
            val cats=fixture.categories.map { Category(it.id,it.name,it.iconName,it.colorInt,it.transactionType,it.sortOrder) }
            val json=BackupFormat.createBackupJson(fixture.preferences,cats,emptyList(),fixture.appVersion,exportedAt=fixture.exportedAt,categoryBudgets=fixture.categoryBudgets,schemaVersion=fixture.schemaVersion)
            assertEquals(fixture,BackupFormat.parseBackup(json))
        }
    }
    @Test fun rejectsFractionalSchemaAndUnsafeBudgetTimestamp() {
        val json=JSONObject(BackupFormat.createBackupJson(BackupFormat.BackupPreferences("EUR",null),listOf(category),emptyList(),"test",categoryBudgets=listOf(budget)))
        json.put("schemaVersion",2.5)
        assertFalse(BackupFormat.validateBackupJson(json.toString()).valid)
        json.put("schemaVersion",2)
        json.getJSONArray("categoryBudgets").getJSONObject(0).put("updatedAt",10_000_000_000_000_000L)
        assertFalse(BackupFormat.validateBackupJson(json.toString()).valid)
    }
    @Test fun sharedAndroidAndWebBackupFixtures() {
        var root=File(".").absoluteFile
        while (!File(root,"test-fixtures/category-budgets").exists() && root.parentFile!=null) root=root.parentFile!!
        listOf("android-v1","web-v1","android-v2","web-v2","shared-v2-empty","shared-v2-multiple").forEach { name ->
            val parsed=BackupFormat.parseBackup(File(root,"test-fixtures/category-budgets/$name.json").readText())
            assertNotNull(name,parsed)
            assertEquals(when(name) { "shared-v2-multiple" -> 2; "android-v2", "web-v2" -> 1; else -> 0 },parsed!!.categoryBudgets.size)
        }
    }
}
