# Android CI/CD Setup

## GitHub Actions Workflow

A unified workflow (`android.yml`) handles both debug and release builds:

### Debug Builds
- **Triggered on**: Push to main, Pull Requests, manual dispatch
- **Builds**: Unsigned debug APK
- **Artifact**: `app-debug.apk` (retained for 30 days)
- **Use case**: Testing and development

### Release Builds
- **Triggered on**: Tags matching `v*`
- **Builds**: Signed release APK + AAB for Play Store
- **Artifacts**: `app-release.apk` and `app-release.aab` (retained for 90 days)
- **Creates**: GitHub Release with attached files
- **Use case**: Production distribution

## Android Signing Configuration

### 1. Create a keystore

```bash
# From the client/android directory
keytool -genkey -v -keystore release.keystore -alias melody-manager -keyalg RSA -keysize 2048 -validity 10000
```

Note the following:
- **Keystore password**: The password for the keystore file
- **Key alias**: `melody-manager` (or whatever you choose)
- **Key password**: The password for the key

### 2. Configure gradle.properties

Create `client/android/gradle.properties` (do NOT commit this file):

```properties
KEYSTORE_FILE=release.keystore
KEYSTORE_PASSWORD=YourKeystorePassword
KEY_ALIAS=melody-manager
KEY_PASSWORD=YourKeyPassword
```

Add to `.gitignore`:
```
client/android/gradle.properties
client/android/app/release.keystore
```

### 3. Configure build.gradle

In `client/android/app/build.gradle`, add:

```gradle
android {
    ...

    signingConfigs {
        release {
            if (project.hasProperty('KEYSTORE_FILE')) {
                storeFile file(project.property('KEYSTORE_FILE'))
                storePassword project.property('KEYSTORE_PASSWORD')
                keyAlias project.property('KEY_ALIAS')
                keyPassword project.property('KEY_PASSWORD')
            }
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 4. Configure GitHub Secrets

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**

Create these secrets:

#### `ANDROID_KEYSTORE_BASE64`
```bash
# Encode the keystore to base64
base64 -w 0 client/android/app/release.keystore
# Copy the output to the GitHub secret
```

#### `ANDROID_KEYSTORE_PASSWORD`
The keystore password

#### `ANDROID_KEY_ALIAS`
The key alias (e.g., `melody-manager`)

#### `ANDROID_KEY_PASSWORD`
The key password

## Usage

### Debug Build
```bash
# Local
cd client/android
./gradlew assembleDebug

# GitHub Actions
# Automatic on every push to main
```

### Release Build
```bash
# Local
cd client/android
./gradlew assembleRelease    # APK
./gradlew bundleRelease      # AAB for Play Store

# GitHub Actions
git tag v1.0.0
git push origin v1.0.0
# Workflow runs automatically
```

### Download builds

1. **GitHub Actions**: Actions tab → Select workflow run → Download artifacts
2. **Releases**: Releases tab (for tagged builds)

## Generated files

### Debug
- `client/android/app/build/outputs/apk/debug/app-debug.apk`

### Release
- `client/android/app/build/outputs/apk/release/app-release.apk` (Signed APK)
- `client/android/app/build/outputs/bundle/release/app-release.aab` (For Google Play)

## Play Store Deployment

To publish to Google Play Store, use the **AAB** (Android App Bundle):
1. Log in to [Google Play Console](https://play.google.com/console)
2. Create or select your app
3. Production → Create new release
4. Upload `app-release.aab`

## Troubleshooting

### Signing error
- Verify all secrets are correctly configured
- Verify keystore is properly base64 encoded
- Test locally with `gradle.properties` before pushing

### Build fails with "invalid source release"
- Verify Java 21 is configured in the workflow
- Check `build.gradle` for Java version

### Capacitor sync fails
- Ensure the client web build succeeds first
- Verify `@melody-manager/shared` is built successfully
