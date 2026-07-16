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

/** e.g. "Today, 14:32" · "Yesterday, 09:15" · "Mon, 14:32" */
fun formatRelativeTimestamp(context: Context, millis: Long, now: Long = System.currentTimeMillis()): String {
    val timeFmt = SimpleDateFormat("HH:mm", Locale.getDefault())
    val timeStr = timeFmt.format(Date(millis))
    
    val day = localDayStartMillis(millis)
    val today = localDayStartMillis(now)
    
    if (day == today) return "${context.getString(R.string.time_today)}, $timeStr"
    
    val yesterday = localDayStartMillis(now - 86_400_000L)
    if (day == yesterday) return "${context.getString(R.string.time_yesterday)}, $timeStr"
    
    val weekAgo = now - 7 * 86_400_000L
    if (millis >= weekAgo) {
        val weekdayFmt = SimpleDateFormat("EEE, HH:mm", Locale.getDefault())
        return weekdayFmt.format(Date(millis))
    }
    
    val dateFmt = SimpleDateFormat("dd MMM, HH:mm", Locale.getDefault())
    return dateFmt.format(Date(millis))
}
