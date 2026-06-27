package com.aus.ausgegeben.data.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CloudSyncMergeTest {

    private data class Item(
        val id: Long,
        val updatedAt: Long,
        val deleted: Boolean = false,
        val label: String,
    )

    @Test
    fun mergeById_appliesRemoteOnlyItems() {
        val result = mergeById(
            localItems = emptyList(),
            remoteItems = listOf(Item(1, 5, label = "remote")),
            idSelector = { it.id },
            updatedAtSelector = { it.updatedAt },
            deletedSelector = { it.deleted },
        )
        assertEquals(1, result.toApplyLocal.size)
        assertTrue(result.toPushRemote.isEmpty())
    }

    @Test
    fun mergeById_pushesLocalOnlyItems() {
        val result = mergeById(
            localItems = listOf(Item(2, 3, label = "local")),
            remoteItems = emptyList(),
            idSelector = { it.id },
            updatedAtSelector = { it.updatedAt },
            deletedSelector = { it.deleted },
        )
        assertEquals(1, result.toPushRemote.size)
    }

    @Test
    fun mergeById_prefersNewerRemoteItem() {
        val result = mergeById(
            localItems = listOf(Item(1, 1, label = "local")),
            remoteItems = listOf(Item(1, 5, label = "remote")),
            idSelector = { it.id },
            updatedAtSelector = { it.updatedAt },
            deletedSelector = { it.deleted },
        )
        assertEquals("remote", result.toApplyLocal.first().label)
    }

    @Test
    fun mergeById_deletesWhenRemoteTombstoneIsNewer() {
        val result = mergeById(
            localItems = listOf(Item(1, 1, label = "local")),
            remoteItems = listOf(Item(1, 5, deleted = true, label = "gone")),
            idSelector = { it.id },
            updatedAtSelector = { it.updatedAt },
            deletedSelector = { it.deleted },
        )
        assertEquals(listOf(1L), result.toDeleteLocal)
    }
}
