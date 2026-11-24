# Account backup and recovery strategy

## Default protection

Use server-owned, versioned recovery copies with account-scoped restores. Keep backups outside the live database write path and give the app client no direct permission to write, overwrite, or delete them. A second mutable account in the same database shares the live account's failure modes.

- **Before writes:** capture the before-image before any import that can change existing financial values, restore, reset or bulk delete. Abort the operation if the before-image cannot be durably recorded. Use a write revision to prevent stale previews from overwriting newer data.
- **Daily:** enable managed RTDB backups if the Firebase project is on Blaze. Use a private backup bucket and verify a successful scheduled run. Proposed retention is 30 daily recovery points and 12 monthly points. Confirm storage costs, deletion policy and recovery objectives before activation.
- **Per account:** preserve a private account export with schema version, source revision, timestamp and checksum. Restore via a reviewed, account-scoped diff. Preserve record IDs and unrelated records. Record the restoration as a new audit event.
- **Offline:** keep the existing local-workbook and full-cloud download options. Document where the browser export can contain changes that have not synced.
- **Google Drive:** offer an optional, separately authorized copy. Drive integration does not gate first-party backup or sign-in. Drive's app-data folder can be removed by the user or on app uninstall, so keep independent recovery copies.

## Delivery and verification

1. Backend backup owner claims server-side storage, retention, authorization and monitored scheduled runs. Test owner isolation, failure, retries and point-in-time recovery with synthetic accounts.
2. QSE import owner adds before-images and conflict review. Test the whole-riyal precision rule independently before enabling bulk corrections.
3. Google sign-in owner verifies the live OAuth round trip in a supported browser and test account. PR #88 corrected failed-start state cleanup. A live OAuth pass remains to be verified.
4. Optional Drive backup follows first-party recovery and consent verification. Test token revocation, unavailable Drive, and recovery when the app-data folder is gone.

References: [Firebase automatic backups](https://firebase.google.com/docs/database/faq-and-troubleshooting), [Drive application data folder](https://developers.google.com/workspace/drive/api/guides/appdata).

This design is proposed. Scheduled backups and Google Drive integration have not been enabled.
