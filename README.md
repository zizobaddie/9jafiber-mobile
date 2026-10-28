# 9jaFiber mobile apps

Android apps for staff, built with Capacitor. They open the live admin site, so
anything deployed to the admin site shows up in the apps straight away; a new
APK is only needed for app-level changes (icon, permissions, native features).

| App | Opens | Package |
|---|---|---|
| 9jaFiber Admin | https://admin.9jafiber.ng | ng.ninejafiber.admin |
| 9jaFiber Engineer | built in (works offline), talks to the API | ng.ninejafiber.engineer |

**Engineer** carries its own screens (the admin repo's `src/components/Field`,
copied by `scripts/sync-field.sh`). Jobs are kept on the phone and open with no
signal; actions, sign-offs and photos done offline wait on the phone and sync
when back online. After changing the field screens in the admin repo, run
`ADMIN_REPO=../9jafiber-admin bash scripts/sync-field.sh`, commit, push. Its
build needs the repository **variable** `API_URL` (the API base, ending in /api/v1).

Native extras the screens can use inside the apps: barcode scanning (ONU MAC
labels), camera/photo upload, location. A "No connection" page shows when offline.

## Getting the APKs

GitHub builds both on every push to `main` (Actions tab → latest run →
Artifacts). Push a tag such as `v1.0.0` to also publish them under Releases.

## Signing (once)

Without a key the APKs are signed with a throwaway debug key: fine for
testing, but phones must uninstall before installing a build signed with the
real key. Create the key on your own computer (keep it safe; losing it means
users must reinstall):

    keytool -genkeypair -v -keystore 9jafiber-release.jks -alias 9jafiber \
      -keyalg RSA -keysize 2048 -validity 10000
    base64 -w0 9jafiber-release.jks > keystore.b64     # macOS: base64 -i 9jafiber-release.jks

Then in GitHub → Settings → Secrets and variables → Actions add:
`ANDROID_KEYSTORE_BASE64` (contents of keystore.b64), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` (9jafiber), `ANDROID_KEY_PASSWORD`.

## Changing the address

Edit `server.url` in `apps/<app>/capacitor.config.json` (and the URLs in
`apps/<app>/www/*.html`), push, install the new APK.
