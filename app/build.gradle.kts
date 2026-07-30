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
            "Replace with your Firebase download for real Auth/Google Sign-In."
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
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    flavorDimensions += "env"
    productFlavors {
        create("prod") {
            dimension = "env"
            isDefault = true
            buildConfigField("boolean", "IS_STAGING", "false")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            buildConfigField("boolean", "IS_STAGING", "true")
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
            "assembleStagingRelease",
            "bundleStagingRelease",
            "minifyStagingReleaseWithR8",
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
    testImplementation(libs.kotlinx.coroutines.test)
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
