# Native Android foundation

This module is a development preview for the Compose replacement. It uses its own application ID so it can be installed alongside the existing Android app. The preview contains fixture screens and needs no device permissions or account credentials.

Build with `./gradlew :native-app:assembleDebug` from `android/`. The Android workflow publishes its APK as the `WealthCrescent-native-preview-apk` artifact.

Design references are the [wealth dashboard](../../wealth_tracker_template/global_wealth_dashboard_1/) and [cash and credit](../../wealth_tracker_template/cash_credit_management/) prototypes. See the [delivery register](../DELIVERY_REGISTER.md) for native authentication, data integration and release acceptance.
