pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

// Patched floors for libraries we never declare: they arrive through AGP, Google
// services, lint, the KSP/Hilt processors, Robolectric and (guava only) Firestore's
// gRPC, which puts it in the APK. Dependabot can't open fix PRs for these, so every
// configuration, plugin classpath included, is raised to the first fixed release.
// Drop an entry once nothing below the floor is pulled in any more.
object SecurityFloors {
    private val floors = mapOf(
        "org.bouncycastle:bcprov-jdk18on" to "1.85",
        "org.bouncycastle:bcpkix-jdk18on" to "1.85",
        "org.bouncycastle:bcutil-jdk18on" to "1.85", // keep in step with bcprov/bcpkix
        "com.google.guava:guava" to "33.7.2",
        "org.bitbucket.b_c:jose4j" to "0.9.6",
        "org.jdom:jdom2" to "2.0.6.1",
        "org.apache.commons:commons-lang3" to "3.18.0",
        "org.apache.httpcomponents:httpclient" to "4.5.14",
    )

    private fun parts(version: String) = Regex("\\d+").findAll(version).map { it.value.toInt() }.toList()

    private fun isBelow(version: String, floor: String): Boolean {
        val a = parts(version)
        val b = parts(floor)
        for (i in 0 until maxOf(a.size, b.size)) {
            val diff = a.getOrElse(i) { 0 } - b.getOrElse(i) { 0 }
            if (diff != 0) return diff < 0
        }
        return false
    }

    fun applyTo(configuration: Configuration) = configuration.resolutionStrategy.eachDependency {
        val floor = floors["${requested.group}:${requested.name}"] ?: return@eachDependency
        val version = requested.version ?: return@eachDependency
        if (!isBelow(version, floor)) return@eachDependency
        // guava ships -android and -jre flavours; keep whichever was asked for.
        val flavour = if (requested.name == "guava") {
            if (version.endsWith("-android")) "-android" else "-jre"
        } else ""
        useVersion(floor + flavour)
        because("security floor, see SecurityFloors in settings.gradle.kts")
    }
}

gradle.lifecycle.beforeProject {
    buildscript.configurations.configureEach { SecurityFloors.applyTo(this) }
    configurations.configureEach { SecurityFloors.applyTo(this) }
}

rootProject.name = "ausgegeben"
include(":app")
 