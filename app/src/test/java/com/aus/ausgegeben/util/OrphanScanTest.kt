package com.aus.ausgegeben.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OrphanScanTest {
    @Test
    fun needsSweep_whenMarkerMissing() {
        assertTrue(OrphanScan.needsSweep(null))
        assertTrue(OrphanScan.needsSweep(emptyMap()))
    }

    @Test
    fun needsSweep_whenPreVersionedOrphansScannedAt() {
        assertTrue(OrphanScan.needsSweep(mapOf("orphansScannedAt" to 1L)))
    }

    @Test
    fun skips_whenRecordedVersionIsCurrent() {
        assertFalse(
            OrphanScan.needsSweep(
                mapOf(
                    "orphansScannedAt" to 1L,
                    "orphansScanVersion" to OrphanScan.VERSION,
                ),
            ),
        )
    }

    @Test
    fun needsSweep_whenRecordedVersionIsOlder() {
        assertTrue(
            OrphanScan.needsSweep(
                mapOf(
                    "orphansScannedAt" to 1L,
                    "orphansScanVersion" to OrphanScan.VERSION - 1,
                ),
            ),
        )
    }
}
