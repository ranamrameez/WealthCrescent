"""Validate the decoded manifest of the native Android preview APK."""

import sys
import xml.etree.ElementTree as ET

ANDROID = "{http://schemas.android.com/apk/res/android}"
PACKAGE = "com.WealthCrescent.nativepreview"
INTERNAL_PERMISSION = f"{PACKAGE}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"
PROTECTED_RECEIVER = "androidx.profileinstaller.ProfileInstallReceiver"


def violations(manifest):
    if manifest.get("package") != PACKAGE:
        yield "Unexpected preview application ID"

    for node in manifest:
        if node.tag.startswith("uses-permission") and node.get(ANDROID + "name") != INTERNAL_PERMISSION:
            yield f"Unexpected permission request: {node.get(ANDROID + 'name')}"
        if node.tag == "permission" and (
            node.get(ANDROID + "name") != INTERNAL_PERMISSION
            or node.get(ANDROID + "protectionLevel") not in {"signature", "0x2", "0x00000002"}
        ):
            yield f"Unexpected permission declaration: {node.get(ANDROID + 'name')}"

    app = manifest.find("application")
    if app is None or app.get(ANDROID + "allowBackup") != "false":
        yield "Preview must disable application backup"
    if app is None:
        return

    for node in app:
        if node.tag not in {"activity", "activity-alias", "provider", "receiver", "service"}:
            continue
        name = node.get(ANDROID + "name")
        if node.tag == "service":
            yield f"Unexpected service: {name}"
            continue
        if node.get(ANDROID + "exported") == "false":
            continue
        if node.tag == "activity" and name in {".MainActivity", f"{PACKAGE}.MainActivity"}:
            continue
        if (
            node.tag == "receiver"
            and name == PROTECTED_RECEIVER
            and node.get(ANDROID + "permission") == "android.permission.DUMP"
        ):
            continue
        yield f"Unexpected exported or implicitly exported {node.tag}: {name}"


if __name__ == "__main__":
    errors = list(violations(ET.parse(sys.argv[1]).getroot()))
    if errors:
        sys.exit("\n".join(errors))
    print("Native preview APK manifest passed")
