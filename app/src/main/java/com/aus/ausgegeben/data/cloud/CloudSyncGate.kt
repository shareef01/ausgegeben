package com.aus.ausgegeben.data.cloud

import com.aus.ausgegeben.data.PreferenceManager
import com.aus.ausgegeben.data.StorageMode
import com.aus.ausgegeben.data.auth.AuthRepository
import kotlinx.coroutines.flow.first

class CloudSyncGate(
    private val preferenceManager: PreferenceManager,
    private val authRepository: AuthRepository,
) {
    suspend fun isEnabled(): Boolean =
        preferenceManager.storageModeFlow.first() == StorageMode.CLOUD &&
            authRepository.currentUser != null
}
