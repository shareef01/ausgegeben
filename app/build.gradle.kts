import java.util.Properties

val googleServicesFile = file("google-services.json")
if (!googleServicesFile.exists()) {
    val example = file("google-services.json.example")
    check(example.exists()) {
        "Missing app/google-services.json. Copy app/google-services.json.example or download from Firebase Console."
    }
    example.copyTo(googleServicesFile)
    logger.lifecycle(
        "Created app/google-services.json from example. " +
            "Replace with your Firebase download for real Auth (email and password)."
    )
}

fun isPlaceholderGoogleServices(file: java.io.File): Boolean {
    if (!file.exists()) return true
    val text = file.readText()
    return text.contains("YOUR_API_KEY") ||
        text.contains("YOUR_PROJECT_ID") ||
        text.contains("YOUR_MOBILE_SDK_APP_ID") ||
        text.contains("YOUR_PROJECT_NUMBER")
}

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}
fun keystoreProp(name: String): String? =
    keystoreProperties.getProperty(name)?.takeIf { it.isNotBlank() }
        ?: System.getenv("AUSGEGEBEN_${name.uppercase()}")?.takeIf { it.isNotBlank() }

// Read via providers so the configuration cache stays valid; -P overrides come
// from the release workflow, which derives them from the git tag.
//
// Without an override the version comes from web/package.json, which the release
// workflow already requires to match the tag. The old fallback of 1 / "1.0" meant every
// Android Studio or plain `./gradlew` build reported version 1.0 in Settings and stamped
// "1.0" into its backups (a Pixel showed exactly that before 2.1.4 was installed), and
// once a real release was on a device such a build could not be installed over it.
// The code uses the release workflow's scheme: v1.2.3 -> 10203.
val webPackageVersion: String? = providers
    .fileContents(rootProject.layout.projectDirectory.file("web/package.json"))
    .asText.orNull
    ?.let { Regex("\"version\"\\s*:\\s*\"(\\d+\\.\\d+\\.\\d+)\"").find(it)?.groupValues?.get(1) }
fun versionCodeFor(name: String): Int {
    val (major, minor, patch) = name.split('.').map { it.toInt() }
    check(minor <= 99 && patch <= 99) { "MINOR and PATCH must each be <= 99 for the versionCode scheme" }
    return major * 10000 + minor * 100 + patch
}
val appVersionName = providers.gradleProperty("ausgegebenVersionName").orNull ?: webPackageVersion ?: "1.0"
val appVersionCode = providers.gradleProperty("ausgegebenVersionCode").orNull?.toInt()
    ?: webPackageVersion?.let(::versionCodeFor)
    ?: 1

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services)
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.aus.ausgegeben"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.aus.ausgegeben"
        minSdk = 29
        targetSdk = 36
        // Overridable so the release workflow can stamp a tag-derived version.
        // Android refuses to install an APK whose versionCode is not higher than
        // the one already installed, so publishing every GitHub release with a
        // hardcoded 1 would leave the second release uninstallable for anyone who
        // took the first — they would have to uninstall and lose local data.
        // Defaults keep plain `./gradlew assemble*` working unchanged.
        versionCode = appVersionCode
        versionName = appVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // A `staging` flavor lived here but could never build: com.aus.ausgegeben.staging
    // was never registered in Firebase, so the google-services plugin failed with
    // "No matching client found for package name". Nothing read its IS_STAGING flag
    // and no app/src/staging source set ever existed — it was configuration for a
    // variant that did not work. Local emulators cover the same need.
    //
    // The `prod` flavor stays so task names (assembleProdDebug, assembleProdRelease,
    // connectedProdDebugAndroidTest) are unchanged for CI and the release workflow.
    flavorDimensions += "env"
    productFlavors {
        create("prod") {
            dimension = "env"
            isDefault = true
        }
    }

    val releaseStoreFile = keystoreProp("storeFile")
    val releaseStorePassword = keystoreProp("storePassword")
    val releaseKeyAlias = keystoreProp("keyAlias")
    val releaseKeyPassword = keystoreProp("keyPassword")
    val hasReleaseKeystore = listOf(
        releaseStoreFile, releaseStorePassword, releaseKeyAlias, releaseKeyPassword,
    ).all { !it.isNullOrBlank() }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = rootProject.file(releaseStoreFile!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            if (hasReleaseKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasReleaseKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    // Fail release early if google-services.json is still the placeholder example.
    // Resolve at configuration time and capture only a Boolean: a doFirst lambda
    // that calls a script-level helper captures the script object itself, which
    // the Gradle configuration cache cannot serialize (release builds then fail).
    afterEvaluate {
        val usesPlaceholderGoogleServices = isPlaceholderGoogleServices(googleServicesFile)
        listOf(
            "assembleProdRelease",
            "bundleProdRelease",
            "minifyProdReleaseWithR8",
        ).forEach { taskName ->
            tasks.findByName(taskName)?.doFirst {
                check(!usesPlaceholderGoogleServices) {
                    "Release builds require a real app/google-services.json from Firebase Console " +
                        "(placeholder YOUR_* values are only allowed for debug)."
                }
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            // Recovery tests recreate the default Firebase app and clear the real
            // DataStore delegate. JUnit4 methods and Gradle test classes run serially.
            all { it.maxParallelForks = 1 }
        }
    }
    sourceSets {
        getByName("test") {
            resources.srcDir(rootProject.file("testdata"))
        }
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.accompanist.permissions)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.compose.material.icons.core)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.appcheck.playintegrity)
    debugImplementation(libs.firebase.appcheck.debug)
    implementation(libs.hilt.android)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.hilt.work)
    ksp(libs.hilt.compiler)
    ksp(libs.androidx.hilt.compiler)
    testImplementation(libs.androidx.core)
    testImplementation(libs.androidx.junit)
    testImplementation(libs.junit)
    testImplementation("org.json:json:20240303")
    testImplementation(libs.kotlinx.coroutines.test)
    // Instrumentation uses a separate test APK. Coroutines core is loaded from the
    // target app, so its ServiceLoader cannot discover a provider packaged only in
    // the test APK on Android 16. Keep the test runtime in debug app variants so the
    // provider and CoroutineExceptionHandler share one classloader; release is untouched.
    debugImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.work.testing)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.runner)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
