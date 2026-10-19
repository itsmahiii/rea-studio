# REA Studio — Distribution & Releasing Guide

This document describes the distribution packaging architecture, binary lookup order, code signing, notarization, and release workflow for REA Studio.

---

## 1. Supported Distribution Targets

REA Studio packages standalone desktop installers and bundles via **electron-builder** (configured in [`electron-builder.yml`](file:///c:/Users/itsma/OneDrive/Documents/REA%20Studio/electron-builder.yml)):

| Platform | Format / Installer | Architectures | Target Output |
|---|---|---|---|
| **Windows** | NSIS Installer (`.exe`) | `x64` | `release/REA Studio Setup 1.0.0.exe` |
| **macOS** | Disk Image (`.dmg`) & Archive (`.zip`) | Universal (`x64`, `arm64`) | `release/REA Studio-1.0.0.dmg`, `.zip` |
| **Linux** | AppImage (`.AppImage`) & Debian package (`.deb`) | `x64` | `release/REA-Studio-1.0.0.AppImage`, `.deb` |

---

## 2. Binary Lookup Order (Node.js, npx, REA)

Packaged desktop applications launched from a desktop GUI environment (Windows Start Menu / Explorer, macOS Finder / Dock, Linux application launchers) do **not** inherit terminal shell startup files (`.bashrc`, `.zshrc`, user `PATH`).

To guarantee reliable execution across all platforms, REA Studio implements a deterministic **3-tier binary resolution order** in [`src/main/services/pathResolver.ts`](file:///c:/Users/itsma/OneDrive/Documents/REA%20Studio/src/main/services/pathResolver.ts):

### Tier 1: Configured Path Override
- The user can specify an explicit command or absolute binary path in **Settings → REA Command Override** (stored in `userData/rea_settings.json`).
- If specified, REA Studio attempts to invoke this command directly.

### Tier 2: System PATH
- Checks the current process environment `PATH` (`process.env.PATH` or `ComSpec` on Windows).

### Tier 3: Common OS Installation Locations
If the executable is not yet found, REA Studio automatically scans standard system and package manager directories:

- **Windows (`win32`):**
  - `C:\Program Files\nodejs\` (`node.exe`, `npx.cmd`, `npm.cmd`)
  - `C:\Program Files (x86)\nodejs\`
  - `%APPDATA%\npm\` (Global npm binaries & `rea.cmd`)
  - `%LOCALAPPDATA%\Programs\nodejs\`
  - `%LOCALAPPDATA%\npm\`
  - `%LOCALAPPDATA%\Volta\bin\`
  - `%NVM_HOME%\` & `%NVM_SYMLINK%\` (NVM-windows)
  - `C:\nvm4w\nodejs\`

- **macOS (`darwin`):**
  - `/opt/homebrew/bin/` (Homebrew on Apple Silicon)
  - `/usr/local/bin/` (Homebrew on Intel Mac)
  - `/usr/bin/`, `/bin/`
  - `~/.nvm/versions/node/<version>/bin/` (Node Version Manager)
  - `~/.volta/bin/`, `~/.asdf/shims/`, `~/.proto/bin/`
  - `~/.local/bin/`

- **Linux (`linux`):**
  - `/usr/local/bin/`
  - `/usr/bin/`
  - `/snap/bin/`
  - `~/.nvm/versions/node/<version>/bin/`
  - `~/.local/bin/`, `~/.volta/bin/`

### In-App Error & Fix Hint
If neither Node.js, `npx`, nor `rea` can be located on the user's system, REA Studio prevents silent crashes and displays a clear actionable notice in the UI:

> **Node.js / npx executable could not be found.**  
> *Fix Hint:* REA Studio requires Node.js (v18+ or v22+) and npx to launch the REA MCP server. Lookup order attempted: (1) Configured REA command in Settings, (2) System PATH, (3) Common installation paths. Please install Node.js from https://nodejs.org or set your custom REA command path in Settings.

---

## 3. Building Packages Locally

### Prerequisites
1. Node.js >= 22 or 24 installed.
2. Dependencies installed via `npm install`.

### Commands
- **Full package (build installer for host OS):**
  ```bash
  npm run package
  ```
- **Unpacked directory build (for testing and smoke verification without running installer):**
  ```bash
  npm run package:dir
  ```

Output binaries are placed in the `release/` directory:
- Unpacked app executable: `release/win-unpacked/rea-studio.exe` (on Windows).
- Installer: `release/REA Studio Setup 1.0.0.exe`.

---

## 4. Code Signing & Notarization (TODOs for Production Release)

> **IMPORTANT:** Never commit private keys, certificate files, passwords, or API secrets into this repository or CI logs. Secrets must only be injected via encrypted CI secrets or hardware security modules (HSM).

### 4.1 macOS Code Signing & Notarization (TODO)

To distribute outside the Mac App Store without Gatekeeper warnings, the app must be signed with a Developer ID Application certificate and notarized by Apple.

- [ ] **Certificate Enrollment:** Obtain an **Apple Developer Program** account and create a **Developer ID Application** certificate.
- [ ] **Keychain Setup:** Install the certificate in the build machine's login keychain.
- [ ] **App Store Connect API Key:** Generate an API key in App Store Connect with "Developer" access for notarization.
- [ ] **CI Environment Variables:** Configure in GitHub Actions secrets:
  - `CSC_LINK`: Base64-encoded `.p12` certificate.
  - `CSC_KEY_PASSWORD`: Certificate password.
  - `APPLE_API_KEY`: Path or base64 of `.p8` AuthKey.
  - `APPLE_API_KEY_ID`: 10-character Key ID.
  - `APPLE_API_ISSUER`: App Store Connect Issuer UUID.
- [ ] **Hardened Runtime Entitlements:** Already configured in [`build/entitlements.mac.plist`](file:///c:/Users/itsma/OneDrive/Documents/REA%20Studio/build/entitlements.mac.plist).
- [ ] **Verification:** Run `spctl --assess --type execute --verbose release/mac/REA\ Studio.app`.

### 4.2 Windows Code Signing (TODO)

To prevent Microsoft SmartScreen warnings on download:

- [ ] **Certificate:** Acquire an **EV (Extended Validation) Code Signing Certificate** or configure **Azure Trusted Signing** / DigiCert ONE.
- [ ] **CI Configuration:**
  - For standard PFX: Provide `CSC_LINK` and `CSC_KEY_PASSWORD`.
  - For Azure Trusted Signing: Use Azure CLI action or `jsign` with Azure credentials.
  - Set `win.signingHashAlgorithms: ["sha256"]`.
  - Set `win.rfc3161TimeStampServer: "http://timestamp.digicert.com"`.
- [ ] **Verification:** Run `signtool verify /pa /v "release\REA Studio Setup 1.0.0.exe"`.

### 4.3 Linux Package Signing (TODO)

- [ ] **GPG Key:** Generate a 4096-bit RSA GPG key for signing Debian packages and AppImage zsync files.
- [ ] **Debian Repository:** Optionally push signed `.deb` packages to an APT repository.

---

## 5. Updates Policy

By default, **automatic background updates are disabled** (`publish: null` in `electron-builder.yml`). REA Studio will never download or replace software in the background.

Users can manually check for REA agent updates via **Settings → REA Engine → Check for Updates**, which uses REA's standard npm version comparison.
