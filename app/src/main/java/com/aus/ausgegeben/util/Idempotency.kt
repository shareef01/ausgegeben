package com.aus.ausgegeben.util

import java.security.MessageDigest

/** Shared with web/src/utils/idempotency.ts: SHA-256 of exact UTF-8 bytes, lowercase hex. */
internal fun expenseDocumentId(idempotencyKey: String): String =
    MessageDigest.getInstance("SHA-256")
        .digest(idempotencyKey.toByteArray(Charsets.UTF_8))
        .joinToString(separator = "") { byte -> "%02x".format(byte.toInt() and 0xff) }
