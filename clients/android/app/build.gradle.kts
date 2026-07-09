plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "dev.matrixmess.android"
    compileSdk = 34

    defaultConfig {
        applicationId = "dev.matrixmess.android"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.4.2"
    }

    signingConfigs {
        create("release") {
            // Selbstsignierter Schluessel fuer Sideload-Verteilung (kein Play Store).
            // Der feste Schluessel sorgt dafuer, dass Updates ueber vorhandene
            // Installationen installierbar bleiben; er ist bewusst kein Geheimnis.
            storeFile = file("matrixmess-release.keystore")
            storePassword = "matrixmess"
            keyAlias = "matrixmess"
            keyPassword = "matrixmess"
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            isDebuggable = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
}
