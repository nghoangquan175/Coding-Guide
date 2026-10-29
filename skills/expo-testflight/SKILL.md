---
name: expo-testflight
description: Ship an Expo (React Native) iOS app to TestFlight from a Windows machine, with no Mac — app.json/eas.json setup, signing explained (private/public key, CSR, certificate, .p12, provisioning profile, App Store Connect API key — who makes and holds each), credentials with eas credentials, the App Store Connect app, and a GitHub Actions workflow in one of three shapes (A. Actions triggers EAS Build, B. eas build --local on a GitHub macOS runner, C. fully on the runner with fastlane). Ends with internal testers on TestFlight, plus a side note for Android APKs. Includes the mistakes made on the first real run (Todo-RN, 2026-10-29). Use when asked to build an iOS app, upload to TestFlight or App Store Connect, set up iOS CI/CD, or get an Expo app onto testers' iPhones.
---

# Expo → TestFlight

Get an Expo app from a repo to testers' iPhones through TestFlight, built in CI.
Works from Windows: the build runs on macOS somewhere else (EAS or a GitHub runner).

## The signing pieces — who makes what, who holds what

An iPhone only runs apps whose signature traces back to **Apple**. Explain this table to
the user before touching credentials; most confusion comes from mixing these up.

| Piece | What it is | Made by | Held by | Purpose | Secret? |
|---|---|---|---|---|---|
| **Private key** | Half of a key pair | You (or EAS for you) | You: Mac Keychain / `.p12` / EAS. **Apple never has it** | **Signs** every build | **Yes** — whoever has it can sign as your team |
| **Public key** | The other half | Made with the private key | Inside the CSR, then inside the certificate | Lets others **check** a signature made with the private key | No |
| **CSR** (Certificate Signing Request) | Public key + team name, sent to Apple | You (or EAS) | — one-off | Asks Apple for a certificate | No |
| **Certificate** (`.cer`, X.509) | Public key + "belongs to team X" + **Apple's signature**. Valid 1 year | **Apple**, from the CSR | Apple (Developer Portal), you, EAS; **embedded in every `.ipa`** | Proves the public key is your team's and Apple vouches for it | No |
| **`.p12`** (PKCS#12) | Certificate + private key in one password-protected file | You (export) | EAS / GitHub Secrets (base64) / another Mac | Moves the signing identity to CI or another machine | **Yes** |
| **Provisioning profile** | Apple-signed: App ID + allowed certificates + allowed devices (dev / ad hoc) + entitlements (push, iCloud…) | **Apple** | Apple, EAS; **embedded in every `.ipa`** | Permission: "this app may be signed by these certs, run on these devices" | No |
| **App Store Connect API key** | `.p8` private key + Key ID + Issuer ID | An Admin (or EAS via `eas credentials`) | `.p8`: EAS / GitHub Secrets — Apple lets you **download it once**. App Store Connect keeps only its name, ID and *Revoke* | Lets tools (`eas submit`, fastlane) upload and manage TestFlight **without Apple ID login or 2FA** | **Yes** (the `.p8`) |
| **Apple ID of the app** (`ascAppId`) | A number like `6828363891` | App Store Connect, on New App | `eas.json` | Tells `eas submit` which app to upload to | No |

How a check works:

```
Build → signed with the private key, certificate + profile embedded → .ipa
Checker (Apple on upload, or the iPhone for dev / ad hoc):
  1. public key from the certificate verifies the build's signature
  2. Apple's signature on the certificate is valid (Apple's root cert is built into every iPhone)
  3. the profile allows this certificate (and, for dev / ad hoc, this device's UDID)
```

| Path | Who checks **your** signature | What the iPhone checks |
|---|---|---|
| TestFlight / App Store (through Apple) | Apple, on upload — then **re-signs** it | Apple's signature |
| Development / Ad hoc (straight to the phone) | The iPhone | Your signature + profile + its UDID listed |

- App identity on iOS is **Bundle ID + Team**, not the certificate: renewing an expired
  certificate doesn't break updates. An expired cert / profile stops **ad hoc / dev**
  installs from launching; App Store / TestFlight builds are unaffected (Apple re-signed them).
- Lose the private key → revoke the certificate, make a new one, regenerate the profile.
  Annoying, not fatal — unlike losing Android's app signing key.
- With options A/B, `eas credentials` does all of it: makes the key pair, sends the CSR,
  stores cert + private key + profile + API key on EAS. You never see a CSR.

## Pick the CI shape

| Option | Build runs on | Signing credentials | Effort | Proven on | Read |
|---|---|---|---|---|---|
| **A. Actions triggers EAS** | EAS servers — GitHub only starts it | EAS | Least: one `EXPO_TOKEN` secret | Not yet | `references/workflows.md` §A |
| **B. `eas build --local` on a GitHub macOS runner** | GitHub's runner | EAS (fetched by the runner) | Medium | **Todo-RN, 2026-10-29, ~8 min** | §B |
| **C. Fully on the runner** (prebuild → fastlane) | GitHub's runner | **You**: `.p12`, profile, API key in GitHub Secrets | Most: temp keychain, cert import, profile install | Not yet | §C |

How to choose — say the trade-off, let the user decide:

- **Expo project, few builds** → A. It's what most Expo teams do (or EAS's own GitHub
  integration / EAS Workflows, no Actions at all). Uses the EAS build quota.
- **Wants CI on GitHub, or the EAS quota runs out** → B. Same credentials as A, so
  switching A ↔ B is one line.
- **Bare React Native / native, or no Expo account allowed** → C (fastlane + `match` is
  the usual native setup).
- **macOS runner minutes count 10× on a private repo.** Free plan: 2,000 min/month →
  ~200 macOS minutes → roughly 6–8 iOS builds. Free on public repos. A doesn't use them.

## What you need from the user — ask once, up front

- A **paid Apple Developer account** (USD 99/year) — the company's. Without one there is
  **no installable iOS build at all**: not in the cloud, not in CI. Fall back to Expo Go
  + `npx expo start --tunnel` for testers.
- Their **access** to it: an Apple Account invited to **App Store Connect → Users and
  Access** with **App Manager** + *Access to Certificates, Identifiers & Profiles*.
  Creating the **API key needs Admin** — if they're not Admin, the tech lead makes a Team
  Key and sends `.p8` + Key ID + Issuer ID.
- The **Bundle ID** — agreed with the tech lead (company naming, e.g.
  `com.<company>.<app>`). It's **locked** once the App Store Connect app exists.
- An **Expo account** (free) — with A/B, EAS stores the credentials.
- The **GitHub repo** and whether it's private (minutes cost).
- Which **iPhone(s)** testers use and their **Apple Accounts** (emails).

## Steps

### 1. Expo account and token

- `npx expo login` on the dev machine, check with `npx expo whoami`. Being signed in to
  **Expo Go** on the phone is not the CLI — `whoami` says *Not logged in*.
- expo.dev → Account settings → **Access tokens** → create → GitHub repo → Settings →
  Secrets → Actions → `EXPO_TOKEN`. It's the "password for machines": the runner uses it
  to fetch the credentials from EAS. `gh secret set EXPO_TOKEN` over stdin works too.
- Locally, `EXPO_TOKEN=<token> npx eas-cli@latest ...` also authenticates — handy when
  the user can't log in from your shell.

### 2. Link the project and configure

```bash
npx eas-cli@latest init --non-interactive --force   # project on expo.dev, projectId + owner into app.json
```

`eas.json`:

```json
{
  "cli": { "version": ">= 27.0.0", "appVersionSource": "remote" },
  "build": {
    "preview": { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": { "autoIncrement": true }
  },
  "submit": { "production": { "ios": { "ascAppId": "<from step 4>" } } }
}
```

- `appVersionSource: remote` + `autoIncrement`: EAS keeps and bumps the build number,
  so CI never has to commit it back.

`app.json`:

```json
"ios": {
  "bundleIdentifier": "com.<company>.<app>",
  "infoPlist": { "ITSAppUsesNonExemptEncryption": false }
},
"android": { "package": "com.<company>.<app>" }
```

- `ITSAppUsesNonExemptEncryption: false` (no custom encryption beyond HTTPS) — without
  it every build stops at **Missing Compliance** in TestFlight until someone answers.
- Also set the real `name`, icon (1024×1024 PNG, no transparency) and splash — Expo Go
  never shows them, the first TestFlight build is where they appear.

### 3. Credentials — `eas credentials -p ios` (the user runs it: Apple login + 2FA)

```bash
npx eas-cli@latest credentials -p ios
```

- Profile **production** → log in to Apple (the 2FA code goes to the account's trusted
  device) → pick the **company** for both *Team* and *Provider*, never a personal team.
- **Build Credentials → Set up all the required credentials**: registers the Bundle ID,
  creates the **Distribution Certificate** (EAS makes the key pair, sends the CSR, keeps
  the private key) and the **App Store provisioning profile**.
- Back in the menu: **App Store Connect: Manage your API Key → Set up your project to use
  an API Key for EAS Submit** → generate. This is what lets CI upload without 2FA.
- Everything lands on EAS. Cert and profile last **1 year** — note the expiry.

### 4. App Store Connect app

- **After step 3** — the New App form only lists **registered** Bundle IDs.
- Apps → **+ → New App** (not *New App Bundle* — that's a discount bundle of existing
  apps). Name (must be unique on the whole store), language, the Bundle ID, a **SKU**
  (internal code, never shown, can't change — e.g. the bundle ID).
- App Information → **Apple ID** (a number like `6828363891`) → `eas.json`
  `submit.production.ios.ascAppId`. Non-interactive `eas submit` needs it.

### 5. Workflow

Write the chosen option from `references/workflows.md` to `.github/workflows/ios.yml`.
Trigger with `workflow_dispatch` only (minutes), `concurrency` with
`cancel-in-progress: false`. Run it with `gh workflow run ios.yml` and watch with
`gh run watch <id> --exit-status`.

### 6. TestFlight → testers

- The build shows in **TestFlight** after *Processing* (10–30 min).
- **Internal Testing → +** → a group → add testers → add the build (or enable automatic
  distribution).
- **Internal testers must be members of the team** (Users and Access, any role) — up to
  100, no review. People outside the team → **External** group (up to 10,000, by email
  or a public link; the first build of each version waits for **Beta App Review**).
- On the iPhone: install **TestFlight** from the App Store → open the invite email **on
  the phone** → *View in TestFlight* → Accept → Install. The invite binds to the Apple
  Account signed in to TestFlight, once. **Redeem codes** are generated by Apple (shown
  when the invite is opened on a computer) — you can't create them.
- Builds expire after **90 days**.

## Shared rules

- **Credentials never in the repo.** With A/B they live on EAS; with C in GitHub Secrets
  (base64 `.p12` + password, base64 profile, API key). `.gitignore` already has
  `*.p12`, `*.p8`, `*.mobileprovision`, `*.jks`, `*.key`.
- **Don't share someone's Apple Account.** Actions log under their name and 2FA goes to
  their phone. If the user must borrow one, get the tech lead's explicit OK first.
- A token pasted in chat is exposed — tell the user to rotate it once things work.
- Bump nothing by hand: build numbers are remote (`autoIncrement`); bump `version`
  (`1.0.0` → `1.0.1`) only for a new user-visible release.

## Mistakes from the first run (Todo-RN)

| What happened | Fix |
|---|---|
| Expo Go on the phone said "signed in to Expo Go as X, but not signed in to Expo CLI" | `npx expo login` with the same account, or sign out of Expo Go |
| User thought they were logged in to the CLI — they had only logged in to Expo Go | Check `npx expo whoami`; use `EXPO_TOKEN` locally if needed |
| Apple Account creation on the web kept saying *Incorrect verification code* | Only the newest code works, it expires in minutes, type it (don't paste), try incognito / no VPN / no ad-blocker, wait 15–30 min if rate-limited — or create it on an iPhone |
| Tried to create the App Store Connect app before the Bundle ID existed | Run `eas credentials` first — it registers the Bundle ID |
| Bundle ID with a personal name ended up locked in the company team | Agree on it with the tech lead **before** New App |
| Couldn't find *Integrations → App Store Connect API* | Only Admins / the Account Holder see it; let `eas credentials` generate the key, or ask an Admin |
| Assumed the repo was public (free macOS minutes) — it was private | Check `gh repo view --json visibility` before promising build counts |

## Android, side note

Full version — keys, local Gradle builds, Play Console — in the **`expo-android-release`** skill.
Testers on Android only need an **APK**: `eas build -p android --profile preview` (cloud)
or `eas build --local -p android --profile preview` on an `ubuntu-latest` runner, then
send the file or EAS link (testers allow "install unknown apps"). An **AAB** is only for
Play Console and can't be installed directly. Google Play testing tracks (Internal /
Closed / Open) need a Play Console account and the *Release apps to testing tracks*
permission. EAS keeps the Android keystore — every update must be signed with the same one.
