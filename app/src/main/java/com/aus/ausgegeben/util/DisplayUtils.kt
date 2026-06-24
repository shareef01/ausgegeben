package com.aus.ausgegeben.util

import android.app.Activity
import android.os.Build
import android.view.Window

object DisplayUtils {

    /** Prefer the highest refresh-rate display mode the device supports (e.g. 90/120 Hz). */
    fun enableHighRefreshRate(activity: Activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return

        val window: Window = activity.window
        val display = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            activity.display
        } else {
            @Suppress("DEPRECATION")
            window.windowManager.defaultDisplay
        } ?: return

        @Suppress("DEPRECATION")
        val modes = display.supportedModes
        val bestMode = modes.maxByOrNull { it.refreshRate } ?: return
        if (bestMode.refreshRate <= 60f) return

        val params = window.attributes
        params.preferredDisplayModeId = bestMode.modeId
        window.attributes = params
    }
}
