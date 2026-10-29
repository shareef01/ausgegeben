package com.aus.ausgegeben.ui.designqa

import android.content.res.Configuration
import android.graphics.Bitmap
import android.os.Build
import android.os.LocaleList
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.platform.app.InstrumentationRegistry
import com.aus.ausgegeben.ui.theme.AusgegebenTheme
import java.io.File
import java.util.Locale

typealias QaRule = AndroidComposeTestRule<ActivityScenarioRule<ComponentActivity>, ComponentActivity>

/** One cell of the design-QA matrix. A null [heightDp] means the device's full height. */
data class QaDevice(val name: String, val widthDp: Int, val heightDp: Int?)

val SmallPhone = QaDevice("320dp", 320, 640)
val TypicalPhone = QaDevice("411dp", 411, null)

const val QA_FRAME = "qa-frame"

/**
 * Renders [content] as it would appear on [device] with the system font scale and language
 * set. The activity's own configuration is updated as well, so `stringResource`, the
 * nonlinear Android 14+ font scaling and `Locale.getDefault()` (used by the money
 * formatter) all agree.
 */
fun QaRule.setQaContent(
    device: QaDevice,
    fontScale: Float,
    language: String,
    content: @Composable () -> Unit,
) {
    val locale = Locale.forLanguageTag(language)
    Locale.setDefault(locale)
    lateinit var config: Configuration
    lateinit var density: Density
    activityRule.scenario.onActivity { activity ->
        config = Configuration(activity.resources.configuration).apply {
            setLocales(LocaleList(locale))
            this.fontScale = fontScale
            screenWidthDp = device.widthDp
            device.heightDp?.let { screenHeightDp = it }
        }
        @Suppress("DEPRECATION")
        activity.resources.updateConfiguration(config, activity.resources.displayMetrics)
        density = Density(activity)
    }
    setContent {
        CompositionLocalProvider(
            LocalConfiguration provides config,
            LocalDensity provides density,
        ) {
            AusgegebenTheme {
                Box(
                    Modifier
                        .testTag(QA_FRAME)
                        .width(device.widthDp.dp)
                        .then(if (device.heightDp != null) Modifier.height(device.heightDp.dp) else Modifier.fillMaxHeight()),
                ) {
                    content()
                }
            }
        }
    }
    waitForIdle()
}

/** Money as the app prints it: grouped digits and two decimals, with or without a symbol. */
private val AMOUNT = Regex("""\d{1,3}([.,'’\u00a0]\d{3})*[.,]\d{2}(?!\d)""")

/**
 * Collects layout problems on what is currently on screen:
 * - text clipped by its bounds (visual overflow with no ellipsis),
 * - any ellipsised money amount,
 * - text pushed outside the frame sideways (outside a horizontal scroller),
 * - words split mid-word because their column was squeezed,
 * - two pieces of text in the same list item drawn on top of each other.
 * Ellipsised labels that are not amounts are allowed but returned as notes.
 */
fun QaRule.layoutProblems(): Pair<List<String>, List<String>> {
    val problems = mutableListOf<String>()
    val notes = mutableListOf<String>()
    val frame = onNodeWithTag(QA_FRAME).fetchSemanticsNode()
    val frameBounds = frame.boundsInRoot
    val px1 = density.run { 1.dp.toPx() }
    // Lazy lists compose rows ahead of scrolling without placing them; those report the
    // origin as their position and would all "overlap" each other there.
    val texts = frame.descendants().filter {
        it.layoutInfo.isPlaced && it.config.getOrNull(SemanticsActions.GetTextLayoutResult) != null
    }
    val visible = mutableListOf<Pair<SemanticsNode, String>>()
    for (node in texts) {
        val results = mutableListOf<TextLayoutResult>()
        node.config[SemanticsActions.GetTextLayoutResult].action?.invoke(results)
        val layout = results.firstOrNull() ?: continue
        val text = layout.layoutInput.text.text
        if (text.isBlank()) continue
        val clipped = node.boundsInRoot
        if (clipped.width <= 0f || clipped.height <= 0f) continue // scrolled out of view
        val ellipsised = (0 until layout.lineCount).any { layout.isLineEllipsized(it) }
        val isAmount = AMOUNT.containsMatchIn(text.replace("\u200B", ""))
        // hasVisualOverflow is not usable here: it reports plain one-word labels at 1.0.
        // Check the three ways text actually gets cut instead.
        val paragraph = layout.multiParagraph
        val widestLine = (0 until layout.lineCount).maxOf { layout.getLineRight(it) - layout.getLineLeft(it) }
        val cutByMaxLines = paragraph.didExceedMaxLines && !ellipsised
        val tooWide = widestLine > node.size.width + px1
        val tooTall = paragraph.height > node.size.height + px1
        when {
            ellipsised && isAmount -> problems += "ellipsised amount: \"$text\""
            ellipsised -> notes += "ellipsised label: \"$text\""
            cutByMaxLines -> problems += "lines cut off: \"$text\""
            tooWide -> problems += "clipped sideways: \"$text\""
            tooTall -> problems += "clipped vertically: \"$text\""
        }
        val left = node.positionInRoot.x
        val right = left + node.size.width
        if (!insideHorizontalScroller(node) && (left < frameBounds.left - px1 || right > frameBounds.right + px1)) {
            problems += "outside the screen sideways: \"$text\""
        }
        brokenWord(layout, text)?.let { word ->
            // An amount split across lines is a misread number. A label split mid-word means
            // its column was squeezed, unless the word is too long for any phone at this size.
            // With hyphenation on (the app typography) a break may be a proper hyphenated one,
            // which the layout result does not expose, so only very short words count there.
            val hyphenated = layout.layoutInput.style.hyphens == Hyphens.Auto
            val limit = if (hyphenated) 6 else 12
            if (isAmount || word.length <= limit) problems += "broken mid-word (\"$word\"): \"$text\""
            else notes += "long word broken: \"$word\""
        }
        // Rows scrolled partly out of view have their bounds clamped to the viewport edge;
        // only fully visible text can be compared for overlap.
        val top = node.positionInRoot.y
        val fullyVisible = clipped.top - top < px1 && top + node.size.height - clipped.bottom < px1 &&
            clipped.left - left < px1 && right - clipped.right < px1
        if (fullyVisible) visible += node to text
    }
    for (i in visible.indices) for (j in i + 1 until visible.size) {
        val (a, ta) = visible[i]
        val (b, tb) = visible[j]
        val overlap = a.boundsInRoot.intersect(b.boundsInRoot)
        if (overlap.width > 2 * px1 && overlap.height > 2 * px1 && !separatedByScroller(a, b)) {
            problems += "overlap: \"$ta\" and \"$tb\""
        }
    }
    return problems.distinct() to notes.distinct()
}

private val WordSeparators = charArrayOf(' ', '\n', '\u00a0')

/** The first word the line breaker split without a hyphen, if any. */
private fun brokenWord(layout: TextLayoutResult, text: String): String? {
    for (line in 0 until layout.lineCount - 1) {
        val end = layout.getLineEnd(line)
        if (end <= 0 || end >= text.length) continue
        val before = text[end - 1]
        val after = text[end]
        if (before.isLetterOrDigit() && (after.isLetterOrDigit() || after == ',' || after == '.')) {
            val start = text.lastIndexOfAny(WordSeparators, end - 1) + 1
            val stop = text.indexOfAny(WordSeparators, end).let { if (it < 0) text.length else it }
            return text.substring(start, stop)
        }
    }
    return null
}

private fun SemanticsNode.descendants(): List<SemanticsNode> =
    children.flatMap { listOf(it) + it.descendants() }

private fun SemanticsNode.ancestors(): List<SemanticsNode> =
    generateSequence(parent) { it.parent }.toList()

private fun insideHorizontalScroller(node: SemanticsNode) =
    node.ancestors().any { (it.config.getOrNull(SemanticsProperties.HorizontalScrollAxisRange)?.maxValue?.invoke() ?: 0f) > 0f }

/** Sticky headers draw over list rows scrolled beneath them; only same-item overlap counts. */
private fun separatedByScroller(a: SemanticsNode, b: SemanticsNode): Boolean {
    val aIds = a.ancestors().map { it.id }.toSet()
    val common = b.ancestors().firstOrNull { it.id in aIds } ?: return false
    return common.config.getOrNull(SemanticsProperties.VerticalScrollAxisRange) != null
}

/**
 * Walks the main vertical scroller from top to bottom, checking each page and saving a
 * screenshot of each when [shotPrefix] is set. Returns every problem found, by page.
 */
fun QaRule.scrollAndCheck(shotPrefix: String?, maxPages: Int = 25): Pair<List<String>, List<String>> {
    val problems = mutableListOf<String>()
    val notes = mutableListOf<String>()
    val scroller = SemanticsMatcher("vertical scroller") {
        (it.config.getOrNull(SemanticsProperties.VerticalScrollAxisRange) != null) &&
            it.config.getOrNull(SemanticsActions.ScrollBy) != null
    }
    var page = 0
    var lastValue = -1f
    while (page < maxPages) {
        waitForIdle()
        val (p, n) = layoutProblems()
        problems += p.map { "page $page: $it" }
        notes += n
        if (shotPrefix != null) saveShot("$shotPrefix-p$page")
        val nodes = onAllNodes(scroller).fetchSemanticsNodes()
        val main = nodes.maxByOrNull { it.size.height } ?: break
        val range = main.config[SemanticsProperties.VerticalScrollAxisRange]
        val value = range.value()
        if (value >= range.maxValue() - 1f || value == lastValue) break
        lastValue = value
        val step = main.size.height * 0.7f
        runOnIdle { main.config[SemanticsActions.ScrollBy].action?.invoke(0f, step) }
        page++
    }
    return problems.distinct() to notes.distinct()
}

/** Screenshots go to the app's external files dir; pull them with adb before uninstalling. */
fun QaRule.saveShot(name: String) {
    val full = onNodeWithTag(QA_FRAME).captureToImage().asAndroidBitmap()
    // Half size, lossy WebP: legible, and small enough to commit a before/after set.
    val bitmap = Bitmap.createScaledBitmap(full, full.width / 2, full.height / 2, true)
    val dir = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "design-qa")
    dir.mkdirs()
    // WEBP_LOSSY only exists from API 30; CI runs the minSdk (29) emulator.
    @Suppress("DEPRECATION")
    val format = if (Build.VERSION.SDK_INT >= 30) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP
    File(dir, "$name.webp").outputStream().use { bitmap.compress(format, 85, it) }
}

fun isEmulator(): Boolean =
    Build.FINGERPRINT.contains("generic") || Build.HARDWARE.contains("ranchu") || Build.PRODUCT.contains("sdk")
