plugins {
    id("com.android.application")
}

android {
    namespace = "pl.euroamazon.dispatch"
    compileSdk = 36

    defaultConfig {
        applicationId = "pl.euroamazon.dispatch"
        minSdk = 26
        targetSdk = 36
        versionCode = 6
        versionName = "1.0.5"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

val syncWebAssets by tasks.registering(Copy::class) {
    from("../../public") {
        include("index.html", "styles.css", "app.js", "standalone-engine.js", "icon.svg")
    }
    into("src/main/assets")
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}
