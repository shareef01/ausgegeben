package com.aus.ausgegeben.util

import com.aus.ausgegeben.data.entity.Category

/** Stable master selection when merging duplicate categories. */
object CategoryDedupe {
    /**
     * Prefer lowest [Category.sortOrder], then lexicographically smallest id so
     * Android and web converge on the same survivor for identical groups.
     */
    fun pickMaster(group: List<Category>): Category {
        require(group.isNotEmpty()) { "dedupe group must not be empty" }
        return group.minWith(compareBy({ it.sortOrder }, { it.id }))
    }
}
