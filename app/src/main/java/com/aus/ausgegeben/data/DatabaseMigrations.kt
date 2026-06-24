package com.aus.ausgegeben.data

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

object DatabaseMigrations {

    private fun SupportSQLiteDatabase.columnExists(table: String, column: String): Boolean {
        query("PRAGMA table_info(`$table`)").use { cursor ->
            val nameIndex = cursor.getColumnIndex("name")
            if (nameIndex < 0) return false
            while (cursor.moveToNext()) {
                if (cursor.getString(nameIndex) == column) return true
            }
        }
        return false
    }

    private fun SupportSQLiteDatabase.addColumnIfMissing(
        table: String,
        column: String,
        definition: String
    ) {
        if (!columnExists(table, column)) {
            execSQL("ALTER TABLE `$table` ADD COLUMN `$column` $definition")
        }
    }

    private fun SupportSQLiteDatabase.indexExists(indexName: String): Boolean {
        query("PRAGMA index_list(`expenses`)").use { cursor ->
            val nameIndex = cursor.getColumnIndex("name")
            if (nameIndex < 0) return false
            while (cursor.moveToNext()) {
                if (cursor.getString(nameIndex) == indexName) return true
            }
        }
        return false
    }

    private fun SupportSQLiteDatabase.createIndexIfMissing(name: String, sql: String) {
        if (!indexExists(name)) {
            execSQL(sql)
        }
    }

    val MIGRATION_1_2 = object : Migration(1, 2) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.addColumnIfMissing("expenses", "receiptImagePath", "TEXT")
        }
    }

    val MIGRATION_2_3 = object : Migration(2, 3) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.addColumnIfMissing(
                "expenses",
                "transactionType",
                "TEXT NOT NULL DEFAULT 'expense'"
            )
        }
    }

    val MIGRATION_3_4 = object : Migration(3, 4) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.addColumnIfMissing(
                "categories",
                "transactionType",
                "TEXT NOT NULL DEFAULT 'expense'"
            )
            db.addColumnIfMissing(
                "categories",
                "sortOrder",
                "INTEGER NOT NULL DEFAULT 0"
            )
        }
    }

    val MIGRATION_4_5 = object : Migration(4, 5) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.createIndexIfMissing(
                "index_expenses_categoryId",
                "CREATE INDEX IF NOT EXISTS `index_expenses_categoryId` ON `expenses` (`categoryId`)"
            )
            db.createIndexIfMissing(
                "index_expenses_transactionType",
                "CREATE INDEX IF NOT EXISTS `index_expenses_transactionType` ON `expenses` (`transactionType`)"
            )
        }
    }

    val MIGRATION_5_6 = object : Migration(5, 6) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.createIndexIfMissing(
                "index_expenses_dateMillis",
                "CREATE INDEX IF NOT EXISTS `index_expenses_dateMillis` ON `expenses` (`dateMillis`)"
            )
        }
    }

    val ALL = arrayOf(
        MIGRATION_1_2,
        MIGRATION_2_3,
        MIGRATION_3_4,
        MIGRATION_4_5,
        MIGRATION_5_6
    )
}
