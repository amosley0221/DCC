import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Versions come from the repo root package.json via scripts/sync-version.mjs.
// versionCode is derived from semver so it always increases, which is what lets
// a new APK install over the old one instead of being rejected as a downgrade.
val versionProps = Properties().apply {
    rootProject.file("version.properties").inputStream().use { load(it) }
}
val dccVersionName: String = versionProps.getProperty("dccVersionName")
val dccVersionCode: Int = versionProps.getProperty("dccVersionCode").toInt()

android {
    namespace = "com.dcc.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.dcc.app"
        minSdk = 26
        targetSdk = 35
        versionCode = dccVersionCode
        versionName = dccVersionName
    }

    signingConfigs {
        create("release") {
            // CI injects a private key when the repo has one; otherwise the
            // committed key is used so a local build produces an APK that
            // upgrades cleanly over a released one.
            //
            // The workflow sets this variable to an empty string rather than
            // leaving it unset when there is no secret, so blank counts as absent.
            val injected = System.getenv("DCC_KEYSTORE_FILE")?.takeIf { it.isNotBlank() }
            if (injected != null) {
                storeFile = file(injected)
                storePassword = System.getenv("DCC_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("DCC_KEY_ALIAS")
                keyPassword = System.getenv("DCC_KEY_PASSWORD")
            } else {
                storeFile = rootProject.file("keystore/dcc-release.jks")
                storePassword = "dynastycommandcenter"
                keyAlias = "dcc"
                keyPassword = "dynastycommandcenter"
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            // The debug build is signed with the release key too, so a debug
            // install and a release install upgrade each other instead of
            // colliding on a signature mismatch.
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.kotlinx.serialization.json)
    debugImplementation(libs.androidx.ui.tooling)
}
