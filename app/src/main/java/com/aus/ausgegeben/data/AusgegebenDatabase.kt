package com.aus.ausgegeben.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.aus.ausgegeben.data.dao.CategoryDao
import com.aus.ausgegeben.data.dao.ExpenseDao
import com.aus.ausgegeben.data.entity.Category
import com.aus.ausgegeben.data.entity.Expense

@Database(entities = [Category::class, Expense::class], version = 6, exportSchema = true)
abstract class AusgegebenDatabase : RoomDatabase() {

    abstract fun categoryDao(): CategoryDao
    abstract fun expenseDao(): ExpenseDao

    companion object {
        @Volatile
        private var Instance: AusgegebenDatabase? = null

        fun getDatabase(context: Context): AusgegebenDatabase {
            return Instance ?: synchronized(this) {
                Room.databaseBuilder(
                    context.applicationContext,
                    AusgegebenDatabase::class.java,
                    "ausgegeben_database"
                )
                .addMigrations(*DatabaseMigrations.ALL)
                .fallbackToDestructiveMigrationOnDowngrade(dropAllTables = false)
                .build()
                .also { Instance = it }
            }
        }
    }
}
