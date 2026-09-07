package com.aus.ausgegeben.util

import org.junit.Assert.assertEquals
import org.junit.Test

class IdempotencyTest {
    @Test
    fun sha256Utf8Vectors_matchWeb() {
        val vectors = mapOf(
            "example-key" to "c018c41c1afaf2c0b66c64f97d0ee135657b699ad260f299234cd40a5d625e0e",
            "550e8400-e29b-41d4-a716-446655440000" to "a3a9e1ed9732cab28868127be00f1ce921acaefdd5c3b23a6e9e0072bd9c1a34",
            "Grüße-東京-💶" to "2570773557c0c2fcd7c802ff46f36501f2e5545d2462e2e9f6bc008a7fd87432",
            "x".repeat(512) to "64164443bb63e338ef1cfdb12a57117cd1212270cc935a798f6e8a665cdf4659",
        )
        vectors.forEach { (input, expected) -> assertEquals(expected, expenseDocumentId(input)) }
    }
}
