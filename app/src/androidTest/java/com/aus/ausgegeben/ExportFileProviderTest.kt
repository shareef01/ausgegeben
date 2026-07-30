package com.aus.ausgegeben

import androidx.core.content.FileProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class ExportFileProviderTest {

    @Test
    fun fileProvider_allowsExportsSubdir() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, "ausgegeben_export.csv").apply { writeText("date,time\n") }
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )
        assertNotNull(uri)
        assertEquals("content", uri.scheme)
    }

    @Test(expected = IllegalArgumentException::class)
    fun fileProvider_rejectsCacheRoot() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "not_in_exports.csv").apply { writeText("x") }
        FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )
    }
}
