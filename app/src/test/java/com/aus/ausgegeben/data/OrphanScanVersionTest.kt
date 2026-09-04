package com.aus.ausgegeben.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression cover for AUS-106, and the Android half of the web
 * `orphanScanVersion.test.ts` contract.
 *
 * The sweep used to be gated on the mere presence of `orphansScannedAt`. That is what made
 * a shipped orphan repair permanently unrunnable once: the marker was already set on every
 * account that had ever cold-started, so the fix could never fire on the long-lived
 * accounts it was written for. Gating on a version makes a future sweep re-runnable by
 * bumping one number.
 */
class OrphanScanVersionTest {

    @Test
    fun `runs on an account with no recorded version`() {
        assertTrue(AppRepository.needsOrphanScan(null))
    }

    @Test
    fun `runs on a pre-versioning marker however old the scan is`() {
        // A marker written before versioning existed carries orphansScannedAt but no
        // version, which is exactly the population the incident stranded.
        assertTrue(AppRepository.needsOrphanScan(null))
    }

    @Test
    fun `skips an account already swept by the current generation`() {
        assertFalse(AppRepository.needsOrphanScan(AppRepository.ORPHAN_SCAN_VERSION))
    }

    @Test
    fun `re-runs when the version is bumped past what the account recorded`() {
        assertTrue(AppRepository.needsOrphanScan(AppRepository.ORPHAN_SCAN_VERSION - 1))
    }

    @Test
    fun `does not re-run for a marker from a newer build than this one`() {
        assertFalse(AppRepository.needsOrphanScan(AppRepository.ORPHAN_SCAN_VERSION + 1))
    }

    /** Must match web ORPHAN_SCAN_VERSION, or the two clients disagree about what has run. */
    @Test
    fun `version matches the web client`() {
        assertTrue(AppRepository.ORPHAN_SCAN_VERSION == 1L)
    }
}
