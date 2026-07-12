import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release-Signing wird NICHT mehr im Repo hinterlegt. Keystore + Passwoerter
// kommen aus einer lokalen, NICHT eingecheckten keystore.properties oder aus
// Umgebungsvariablen (CI-Secrets). Fehlt beides, bleibt der Release-Build
// unsigniert – lokale Entwicklungsbuilds funktionieren weiterhin.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) FileInputStream(keystorePropsFile).use { load(it) }
}
fun signingValue(propKey: String, envKey: String): String? =
    keystoreProps.getProperty(propKey) ?: System.getenv(envKey)

val ksStoreFile = signingValue("storeFile", "ANDROID_KEYSTORE_FILE")
val ksStorePassword = signingValue("storePassword", "ANDROID_KEYSTORE_PASSWORD")
val ksKeyAlias = signingValue("keyAlias", "ANDROID_KEY_ALIAS")
val ksKeyPassword = signingValue("keyPassword", "ANDROID_KEY_PASSWORD")
val hasReleaseSigning = ksStoreFile != null && ksStorePassword != null &&
    ksKeyAlias != null && ksKeyPassword != null

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
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(ksStoreFile!!)
                storePassword = ksStorePassword
                keyAlias = ksKeyAlias
                keyPassword = ksKeyPassword
            }
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            isDebuggable = false
            signingConfig = if (hasReleaseSigning) signingConfigs.getByName("release") else null
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
