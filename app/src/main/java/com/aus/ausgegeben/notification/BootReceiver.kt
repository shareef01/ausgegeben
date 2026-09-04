package com.aus.ausgegeben.notification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.aus.ausgegeben.data.PreferenceManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_TIMEZONE_CHANGED -> Unit
            else -> return
        }
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val enabled = PreferenceManager(context).dailyReminderFlow.first()
                if (enabled) {
                    ReminderScheduler.scheduleNext(context)
                }
            } finally {
                pending.finish()
            }
        }
    }
}
