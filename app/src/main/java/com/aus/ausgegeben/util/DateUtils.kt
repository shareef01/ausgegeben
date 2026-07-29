package com.aus.ausgegeben.util

import android.content.Context
import com.aus.ausgegeben.R
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.ZoneId
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Start of the local calendar day for any timestamp. */
fun localDayStartMillis(millis: Long): Long {
    val cal = Calendar.getInstance().apply {
        timeInMillis = millis
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
    return cal.timeInMillis
}

/**
 * Material DatePicker returns UTC midnight for the selected calendar day.
 * Convert that to local midnight so grouping and display stay consistent.
 */
fun datePickerMillisToLocalDayStart(pickerUtcMillis: Long): Long {
    val selectedDate = Instant.ofEpochMilli(pickerUtcMillis)
        .atZone(ZoneId.of("UTC"))
        .toLocalDate()
    return selectedDate
        .atStartOfDay(ZoneId.systemDefault())
        .toInstant()
        .toEpochMilli()
}

/**
 * e.g. "Today, 14:32" · "Yesterday, 9:15 AM" · "Mon, 14:32"
 *
 * The time part goes through [android.text.format.DateFormat.getTimeFormat], which honours
 * the device's 12/24-hour setting. The old hardcoded "HH:mm" pattern forced 24-hour output
 * even for users who had chosen 12-hour, ignoring the system preference.
 *
 * Note this deliberately does NOT apply to CSV export — ExportUtils keeps a fixed
 * "yyyy-MM-dd,HH:mm" in Locale.US so exported files stay machine-readable and byte-identical
 * to the web export.
 */
fun formatRelativeTimestamp(context: Context, millis: Long, now: Long = System.currentTimeMillis()): String {
    val date = Date(millis)
    val timeStr = android.text.format.DateFormat.getTimeFormat(context).format(date)

    val day = localDayStartMillis(millis)
    val today = localDayStartMillis(now)

    if (day == today) return "${context.getString(R.string.time_today)}, $timeStr"

    val yesterday = localDayStartMillis(now - 86_400_000L)
    if (day == yesterday) return "${context.getString(R.string.time_yesterday)}, $timeStr"

    val weekAgo = now - 7 * 86_400_000L
    if (millis >= weekAgo) {
        return "${SimpleDateFormat("EEE", Locale.getDefault()).format(date)}, $timeStr"
    }

    return "${SimpleDateFormat("dd MMM", Locale.getDefault()).format(date)}, $timeStr"
}
