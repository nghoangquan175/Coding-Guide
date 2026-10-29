---
name: expo-android-release
description: Build and hand out an Expo (React Native) Android app — the signing keys first (keystore, private key, self-signed certificate, debug vs release keys, upload key vs Play App Signing key, SHA-1 for Google services), then an APK for testers built locally on Windows with Gradle, on EAS, or in GitHub Actions, how to send it (file, GitHub Release, Firebase App Distribution), and later Google Play Console (account, permissions, package name, AAB, versionCode, Internal / Closed / Open / Production tracks). Use when asked to build an APK or AAB, sign an Android app, send an Android build to testers, set up Android CI, or publish to Google Play.
---

# Expo → Android (APK for testers, then Google Play)

Android is the easy platform: it builds on Windows, and an APK installs straight onto a
phone without any store. The part people get wrong is **signing** — start there.

## The signing keys — who makes what, who holds what

Android trusts **any self-made signature**, as long as every update is signed with **the
same one**. No authority like Apple vouches for it.

| Piece | What it is | Made by | Held by | Purpose | Secret? |
|---|---|---|---|---|---|
| **Keystore** (`.jks` / `.keystore`) | A password-protected file holding one or more keys under an **alias** | You (`keytool`), or EAS | You — **back it up** (password manager), GitHub Secrets (base64), EAS | Container for the key below | **Yes** (+ its passwords) |
| **Private key** (inside the keystore) | Half of a key pair | Generated with the keystore | Only in the keystore | **Signs** the APK / AAB | **Yes** |
| **Certificate** (inside the keystore) | Public key + your name, **self-signed** — no one else signs it | Generated with the keystore | Keystore; **embedded in every APK** | Lets the phone check the signature; its SHA-1 / SHA-256 fingerprint identifies the app's signer | No |
| **Debug keystore** | A throwaway key every machine has (`android/app/debug.keystore` in an Expo prebuild, `~/.android/debug.keystore` in Android Studio) | The tooling, automatically | Each dev machine | Dev builds; Expo's prebuilt `release` also falls back to it | No — but **different on every machine** |
| **Upload key** | Your keystore, when the app uses **Play App Signing** | You | You | Proves to **Google** that an upload is really yours | **Yes** |
| **App signing key** | The key that signs what users install from Google Play | **Google** (generated on first upload), or you upload yours | **Google's HSM** — you can never download it; Play Console shows only its certificate fingerprints | The app's **permanent identity on users' phones** | Google keeps it |

```
Without Google Play:  you sign the APK with your keystore ──────────────► tester's phone
With Play App Signing: you sign the AAB with the UPLOAD key ──► Google checks it's you,
                       strips it, re-signs with the APP SIGNING key ──► users' phones
```

| | **Upload key** | **App signing key** |
|---|---|---|
| Identifies | You, the uploader, to **Google** | The app, to **users' phones** |
| Checked by | Google, on upload | Android, on install / update |
| Answers | "Did the app's owner send this file?" | "Is this update from the app already installed?" |
| Lost it? | Google registers a new one — users see no change | (If you held it) the app can **never be updated** again — that's why Google keeps it |

Rules that follow:

- **App identity = package name + signing certificate.** An update signed differently
  won't install over the old one ("App not installed") — the tester must uninstall first,
  losing the app's data.
- So pick **one key per app early** and use it everywhere (local, CI, EAS). A debug-signed
  APK is fine for a one-off look, not for testers who'll get updates.
- **SHA-1 for Google Sign-In / Firebase / Maps:** register every key that signs builds
  people use — the debug key, your release/upload key, and for Play installs the **app
  signing key's** SHA-1 from Play Console → App integrity. Missing the last one = sign-in
  works in testing and fails for Play users.
- Make a keystore:
  `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
  Read a certificate's fingerprints: `keytool -list -v -keystore upload.jks -alias upload`.
- Never commit it (`.gitignore` has `*.jks`, `*.keystore`). In CI: base64 file + store
  password + alias + key password as four secrets.

## APK or AAB

| | **APK** | **AAB** (Android App Bundle) |
|---|---|---|
| Installs directly on a phone | **Yes** | No |
| Google Play accepts it (new apps) | No | **Yes** — Play builds per-device APKs from it |
| Use for | Testers, sideloading, other stores | Google Play only |

Expo `eas.json` profile for an APK: `"preview": { "distribution": "internal", "android": { "buildType": "apk" } }`.
`production` builds an AAB by default.

## Build an APK — pick one

| Option | Runs on | Signing | Proven on |
|---|---|---|---|
| **1. Local Gradle on Windows** | Your PC (Android SDK + JDK 17) | Debug key by default; your keystore with a config plugin | Todo-RN, debug-signed |
| **2. EAS cloud** — `eas build -p android --profile preview` | Expo's servers | EAS generates and keeps a keystore on first build | Not yet |
| **3. GitHub Actions** — `eas build --local -p android --profile preview` on `ubuntu-latest` | GitHub's runner (1× minutes, unlike macOS) | The keystore on EAS (create it first: `eas credentials -p android`) | Not yet |

`eas build --local` **doesn't run on Windows** — that's EAS's wrapper, not Android. Plain
Gradle builds fine on Windows (option 1).

### Option 1 — local Gradle on Windows

Check first: `ANDROID_HOME` (Android Studio's SDK, e.g. `%LOCALAPPDATA%\Android\Sdk`) and
`JAVA_HOME` on **JDK 17** (`java -version`).

```powershell
npx expo prebuild -p android          # generates android/ from app.json (gitignored — never edit it by hand)
cd android
.\gradlew.bat assembleRelease         # first run 10–20 min: downloads Gradle deps, compiles native code
# → android\app\build\outputs\apk\release\app-release.apk
```

- Out of the box this `release` APK is **signed with `android/app/debug.keystore`** — fine
  to look at, but a later build from another machine or CI won't update over it.
- To sign with your keystore, `android/` is regenerated by prebuild, so patch it from a
  **config plugin** rather than by hand — e.g. `withAppBuildGradle` adding a
  `signingConfigs.release` that reads the keystore path and passwords from environment
  variables / `gradle.properties`, and pointing `buildTypes.release.signingConfig` at it.
- `npx expo run:android --variant release` builds **and installs** on a connected phone /
  emulator instead.
- Clean rebuild after changing `app.json` / native deps: `npx expo prebuild -p android --clean`.

### Version numbers

- `version` (`1.0.0`) → `versionName`, what users see.
- `android.versionCode` (integer) must **increase** for every build that should update over
  the last one, and for every Play upload. With EAS, `appVersionSource: remote` +
  `autoIncrement` manages it.

## Get it to testers (no Play account needed)

- **Send the file** (Drive, Slack, Zalo…). Testers allow *Install unknown apps* for the app
  they open it from, then tap it. Play Protect may warn about an unknown developer — "Install anyway".
- **GitHub Release**: `gh release create v1.0.0 app-release.apk --notes "..."` — one place,
  history per version. Never commit APKs to the repo.
- **EAS**: build page link / QR code (options 2–3).
- **Firebase App Distribution** (free): invite testers by email, they get update notifications.

## Later — Google Play Console

Not run yet on a real app; the shape, so the user knows what to ask for.

- **Account**: Google Play Developer account (USD 25 one-time, identity verification; an
  organisation needs a D-U-N-S number). Managed at `play.google.com/console`.
- **Access**: the admin invites your **Google account** in *Users and permissions* — no
  shared password. Ask for:
  - *Create, edit, and delete draft apps* (only if the app isn't created yet)
  - *Release apps to testing tracks*
  - *Manage testing tracks and edit tester lists*
  - not *Release to production* (the admin keeps that)
- **Package name** (`android.package` in `app.json`, e.g. `com.<company>.<app>`) is taken
  from the **first uploaded AAB** and **locked forever**.
- **Upload ≠ release**: uploading puts an AAB in the *App bundle explorer* (each with its
  versionCode); a **release** assigns it to a **track** and rolls it out.
- **Play App Signing** is mandatory for new apps — Google makes the app signing key on the
  first upload; your keystore becomes the upload key.

| Track | Who | Google review | Use |
|---|---|---|---|
| **Internal** | Up to 100 emails you add | No — minutes | Team, QA |
| **Closed** | Email lists / Google Groups, several tracks possible | Yes | Client beta |
| **Open** | Anyone, joins from the Play listing | Yes | Public beta |
| **Production** | Everyone | Yes | Release |

- Testers: Testing → Internal testing → *Testers* → email list → copy the **opt-in link** →
  testers open it **signed in with that Google account** → install from Google Play.
- **Personal** developer accounts made after Nov 2023 must run a **Closed test with ≥ 12
  testers for 14 days** before Production. Organisation accounts don't.
- Upload from CI: `eas submit -p android` with a Google Play **service account** JSON key,
  or fastlane `supply`.
