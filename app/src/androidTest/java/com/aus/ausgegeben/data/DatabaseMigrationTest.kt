package com.aus.ausgegeben.data

import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.IOException

@RunWith(AndroidJUnit4::class)
class DatabaseMigrationTest {

  companion object {
    private const val TEST_DB = "migration-test-db"
  }

  @get:Rule
  val helper: MigrationTestHelper = MigrationTestHelper(
    InstrumentationRegistry.getInstrumentation(),
    AusgegebenDatabase::class.java,
    emptyList(),
    FrameworkSQLiteOpenHelperFactory()
  )

  @Test
  @Throws(IOException::class)
  fun migrateFromV1ToV6_preservesData() {
    createLegacyV1Database()

    helper.runMigrationsAndValidate(TEST_DB, 6, false, *DatabaseMigrations.ALL)

    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val db = Room.databaseBuilder(context, AusgegebenDatabase::class.java, TEST_DB)
      .addMigrations(*DatabaseMigrations.ALL)
      .build()

    runBlocking {
      val categories = db.categoryDao().getAllCategories().first()
      val expenses = db.expenseDao().getAllExpenses().first()
      assertEquals(1, categories.size)
      assertEquals("Food", categories.first().name)
      assertEquals(1, expenses.size)
      assertEquals(12.5, expenses.first().amount, 0.001)
    }
    db.close()
  }

  @Test
  @Throws(IOException::class)
  fun migrateFromV5ToV6_addsDateIndex() {
    createLegacyV5Database()
    helper.runMigrationsAndValidate(TEST_DB, 6, false, DatabaseMigrations.MIGRATION_5_6)

    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val db = Room.databaseBuilder(context, AusgegebenDatabase::class.java, TEST_DB)
      .addMigrations(*DatabaseMigrations.ALL)
      .build()

    val sqlite = db.openHelper.writableDatabase
      sqlite.query("PRAGMA index_list(`expenses`)").use { cursor ->
        val nameIndex = cursor.getColumnIndex("name")
        var hasDateIndex = false
        while (cursor.moveToNext()) {
          if (nameIndex >= 0 && cursor.getString(nameIndex) == "index_expenses_dateMillis") {
            hasDateIndex = true
          }
        }
        assertTrue(hasDateIndex)
      }
    db.close()
  }

  private fun createLegacyV1Database() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    context.deleteDatabase(TEST_DB)
    val dbFile = context.getDatabasePath(TEST_DB)
    val db = SQLiteDatabase.openOrCreateDatabase(dbFile, null)
    db.version = 1
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        iconName TEXT NOT NULL,
        colorInt INTEGER NOT NULL
      )
      """.trimIndent()
    )
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        amount REAL NOT NULL,
        dateMillis INTEGER NOT NULL,
        categoryId INTEGER NOT NULL,
        note TEXT NOT NULL,
        FOREIGN KEY(categoryId) REFERENCES categories(id) ON DELETE CASCADE
      )
      """.trimIndent()
    )
    db.execSQL(
      "INSERT INTO categories (name, iconName, colorInt) VALUES ('Food', 'restaurant', ${0xFFE57373.toInt()})"
    )
    db.execSQL(
      "INSERT INTO expenses (amount, dateMillis, categoryId, note) VALUES (12.5, 1700000000000, 1, 'Lunch')"
    )
    db.close()
  }

  private fun createLegacyV5Database() {
    createLegacyV1Database()
    helper.runMigrationsAndValidate(
      TEST_DB,
      5,
      false,
      DatabaseMigrations.MIGRATION_1_2,
      DatabaseMigrations.MIGRATION_2_3,
      DatabaseMigrations.MIGRATION_3_4,
      DatabaseMigrations.MIGRATION_4_5
    )
  }
}
