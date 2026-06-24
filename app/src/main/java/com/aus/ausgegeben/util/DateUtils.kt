package com.aus.ausgegeben.util

import java.time.Instant
import java.time.ZoneId
import java.util.Calendar

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
