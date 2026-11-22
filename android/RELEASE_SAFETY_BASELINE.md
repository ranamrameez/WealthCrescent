# Android release safety baseline

## Legacy build evidence

The [Android build on main](https://github.com/ranamrameez/WealthCrescent/actions/runs/45015652099) passed at `cb4e115`. It uploaded [the debug APK](https://github.com/ranamrameez/WealthCrescent/actions/runs/45015652099/artifacts/14751418329) as a GitHub Actions artifact. This is build evidence for the legacy app.

| Checked source | Observation | Native replacement acceptance |
| --- | --- | --- |
| [Manifest](app/src/main/AndroidManifest.xml) | Requests internet, network state and notification posting. Declares a notification listener protected by `BIND_NOTIFICATION_LISTENER_SERVICE`. The launcher is exported and app backup is disabled. The source manifest has no SMS-read or SMS-receive permission. | Inspect the final merged release manifest. Verify the notification listener and SMS permissions are absent, justify every remaining permission and exported component, and test backup behavior with fixture data. |
| [Gradle app configuration](app/build.gradle.kts) | Includes AndroidX WebKit and supports optional release signing. Debug uses an application ID suffix. | Verify the native release runtime dependencies omit WebKit and that release artifacts contain no WebView host or JavaScript bridge. Compare package name, version code and certificate against the distributed build before testing upgrades. |

## Device warning and release checks

Get the exact warning text, Android version, device model, installation source, package version and certificate fingerprint for the affected build. Record the detail in the safety claim with private values redacted. The reported warning has yet to be reproduced and its cause is open.

Use a clean test device and an upgrade fixture. Keep Play Protect enabled. Install through the signed internal testing track, record the result and check Play Console for unresolved findings. Verify that account-backed records survive upgrade and that manual entry and user-selected imports cover the replacement for background capture. Keep signing material, financial records and device identifiers out of PRs. Use the [Android register](DELIVERY_REGISTER.md) for the implementation and release claims.
