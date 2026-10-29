# iOS → TestFlight workflows

All three need steps 1–4 of the skill done first (Expo token, `eas.json` with `ascAppId`,
credentials, the App Store Connect app). Save as `.github/workflows/ios.yml`.

## A. Actions triggers EAS Build

The build runs on EAS; the runner only starts it and waits. No macOS minutes used, EAS
build quota used instead.

```yaml
name: iOS → TestFlight

on:
  workflow_dispatch:

concurrency:
  group: ios-build
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      # Builds on EAS, then submits to TestFlight with the submit profile's ascAppId + API key.
      - run: eas build --platform ios --profile production --non-interactive --auto-submit
```

- Add `--no-wait` to return right away and follow the build on expo.dev.
- Not run end to end yet — check the EAS build page the first time.

## B. `eas build --local` on a GitHub macOS runner — proven

Builds on GitHub's runner; EAS only provides the credentials. Ran on Todo-RN on
2026-10-29: build + upload in ~8 minutes, first try.

```yaml
# Builds the iOS app on a GitHub macOS runner with `eas build --local` and uploads it to
# TestFlight. Signing credentials and the App Store Connect API key live on EAS; the runner
# fetches them with EXPO_TOKEN, so no certificates are kept in this repo or its secrets.
#
# Manual only: macOS minutes count 10x on a private repo.
name: iOS → TestFlight

on:
  workflow_dispatch:

concurrency:
  group: ios-build
  cancel-in-progress: false

jobs:
  build:
    runs-on: macos-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4

      - uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: latest-stable

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - run: npm ci

      - name: Build .ipa
        run: eas build --local --platform ios --profile production --non-interactive --output build/app.ipa

      - name: Upload to TestFlight
        run: eas submit --platform ios --profile production --path build/app.ipa --non-interactive

      - uses: actions/upload-artifact@v4
        with:
          name: ios-ipa
          path: build/app.ipa
          retention-days: 7
```

- `setup-xcode latest-stable`: the runner's default Xcode can lag behind what the Expo
  SDK needs.
- CocoaPods and fastlane come preinstalled on GitHub's macOS images — `--local` uses them.
- Switching to A is replacing the two `eas` steps with A's single command.

## C. Fully on the runner — prebuild + fastlane

No EAS at build time; you own the signing material. Not run end to end yet — expect to
debug the signing step the first time.

**Get the credentials first.** Easiest: run `eas credentials -p ios` once, then download
the `.p12` (+ password) and the provisioning profile from the same menu. Or make them by
hand: key + CSR (`openssl req -new -newkey rsa:2048 -nodes -keyout ios.key -out ios.csr`)
→ upload the CSR on developer.apple.com → download `.cer` → combine into `.p12`
(`openssl x509 -inform der -in ios.cer -out ios.pem` then
`openssl pkcs12 -export -inkey ios.key -in ios.pem -out ios.p12`) → create an App Store
profile for the Bundle ID with that certificate.

Secrets (all base64 where binary: `base64 -w0 file`):

| Secret | Value |
|---|---|
| `IOS_P12_BASE64` / `IOS_P12_PASSWORD` | Distribution certificate + private key |
| `IOS_PROFILE_BASE64` | The `.mobileprovision` |
| `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_P8_BASE64` | App Store Connect API key |
| `APPLE_TEAM_ID` | e.g. `35SMCZBTSC` |
| `IOS_PROFILE_NAME` | The profile's name as shown on developer.apple.com |

```yaml
name: iOS → TestFlight (fastlane)

on:
  workflow_dispatch:

concurrency:
  group: ios-build
  cancel-in-progress: false

jobs:
  build:
    runs-on: macos-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: latest-stable
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx expo prebuild --platform ios --clean

      # Signing: a temporary keychain with the certificate, and the profile installed.
      - uses: apple-actions/import-codesign-certs@v3
        with:
          p12-file-base64: ${{ secrets.IOS_P12_BASE64 }}
          p12-password: ${{ secrets.IOS_P12_PASSWORD }}
      - name: Install provisioning profile
        run: |
          mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
          echo "${{ secrets.IOS_PROFILE_BASE64 }}" | base64 --decode > ~/Library/MobileDevice/Provisioning\ Profiles/app.mobileprovision

      - name: Build .ipa
        working-directory: ios
        env:
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          IOS_PROFILE_NAME: ${{ secrets.IOS_PROFILE_NAME }}
        # prebuild leaves automatic signing on; switch the build to the installed profile.
        run: |
          pod install
          WORKSPACE=$(ls -d *.xcworkspace)
          SCHEME=$(basename "$WORKSPACE" .xcworkspace)
          fastlane run build_app \
            workspace:"$WORKSPACE" scheme:"$SCHEME" \
            export_method:app-store export_team_id:"$APPLE_TEAM_ID" output_directory:../build \
            xcargs:"CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=$APPLE_TEAM_ID CODE_SIGN_IDENTITY='Apple Distribution' PROVISIONING_PROFILE_SPECIFIER='$IOS_PROFILE_NAME'"

      - name: Upload to TestFlight
        env:
          ASC_KEY_ID: ${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: ${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_P8_BASE64: ${{ secrets.ASC_KEY_P8_BASE64 }}
        # Each `fastlane run` is its own process, so the API key goes to upload as a JSON file.
        run: |
          KEY=$(echo "$ASC_KEY_P8_BASE64" | base64 --decode | awk '{printf "%s\\n", $0}')
          printf '{"key_id":"%s","issuer_id":"%s","key":"%s","in_house":false}' "$ASC_KEY_ID" "$ASC_ISSUER_ID" "$KEY" > "$RUNNER_TEMP/asc_key.json"
          fastlane run upload_to_testflight ipa:"$(ls build/*.ipa)" api_key_path:"$RUNNER_TEMP/asc_key.json" skip_waiting_for_build_processing:true
```

- `fastlane run ...` one-liners keep it in the workflow; a real project usually moves this
  into a `Fastfile` lane, where one `app_store_connect_api_key` call is shared by every
  action in the lane.
- The `xcargs` apply to every target — fine for a plain Expo app; app extensions (widgets,
  notification service) each need their own profile, which is where a `Fastfile` with
  `update_code_signing_settings` per target, or `match`, earns its keep.
- Build numbers aren't managed for you here — bump `ios.buildNumber` (or use fastlane's
  `increment_build_number` against `latest_testflight_build_number`) before each upload,
  or App Store Connect rejects the duplicate.
- Teams with several apps keep the certificates in a private git repo with
  **fastlane match** instead of separate secrets.
