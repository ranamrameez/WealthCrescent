# WealthCrescent

A personal finance tracker: stock trading (QSE + PSX exchanges), mutual funds, bank
accounts, cash, personal loans, EMI/loans, rental income, subscriptions, cross-entity
transfers, budgeting, and a net-worth dashboard — all in one place.

This file is a short, general pointer. Each component below keeps its own detailed
docs inside its own directory — see the linked README for anything specific to it.

Cross-module UI, aggregation, filtering, ledger, and parity requirements are documented in the [Page Template and Parity Guide](docs/PAGE_TEMPLATE_GUIDE.md).

## Agent skills

Repository-local skills live in [`.agents/skills/`](.agents/skills/README.md).
They cover UI design, accessibility, React composition and performance, Vite,
Vitest, Firebase authentication, browser testing, financial reconciliation,
variance analysis, research, backend architecture, security, analytics, and
Chart.js dashboards. They travel with the repo;
no global skill installation is needed. Start with [`AGENTS.md`](AGENTS.md) for
project-specific constraints and when to use each skill.

## Components in this repo

| Component | What it is | Status |
| --- | --- | --- |
| [`webapp/`](webapp/README.md) | The main product — a React + TypeScript web app | Live, actively developed |
| [`android/`](android/README.md) | Native Android app — a WebView shell around the live web app, plus bank-SMS auto-logging via Android's Notification Listener | Built, CI-published (see below) |
| [`chrome-extension/`](chrome-extension/README.md) | Browser extension that feeds live QSE prices into the web app's shared Firebase data | Working, optional |
| [`sample/`](sample/) | Real QSE/PSX data snapshots and a crystallized PSX broker statement, used as test fixtures and reference data | Reference data, not a running component |
| `functions/` | A Firebase Cloud Function scaffold (scheduled FX-rate fetch) shared by the project's Firebase backend | Scaffolded, not currently deployed |

There is no iOS app in this repo today.

## Live app

<https://ranamrameez.github.io/WealthCrescent/>

Scan the QR code below to open the live web app:

<img src="webapp-qr-code.png" alt="Live FinanceMaster" width="200" height="200">

## Android app

Native Kotlin + Jetpack Compose — see [`android/README.md`](android/README.md) for the full
architecture. Built and published automatically by GitHub Actions (see below); no manual
release step is needed for a debug build. A real release-signed build (a much better story
for Google Play Protect's install-time warning than the debug build) is available once
release-signing secrets are configured — see
[`android/README.md`'s "Release signing" section](android/README.md#release-signing).

### Download Android builds

Open [Build Android APK](https://github.com/ranamrameez/WealthCrescent/actions/workflows/android-build.yml), select a successful run for the desired commit, and download the ZIP from **Artifacts** while signed into GitHub. Extract the APK before installing. Debug builds are intended for testing.

- `WealthCrescent-debug-apk` contains the debug APK.
- `WealthCrescent-release-apk` and `WealthCrescent-release-aab` are available on eligible builds with release signing configured. Use the AAB for Play Console.

Android and workflow changes trigger a debug build on pull requests. Pushes to `main` or `master` and manual runs can also build signed outputs when signing secrets are configured. The workflow run records the source revision and signing fingerprint when available. Artifacts expire according to the repository's retention settings.

## For AI coding sessions

Read `CLAUDE.md` (at this repo root) first — it has full project continuity notes and
is kept up to date every session. It stays at the root deliberately so it keeps
auto-loading for future sessions, even though its content is almost entirely about
`webapp/`.

## Project status

Latest delivery update (2026-11-04): the central stock calculation engine from [PR #48](https://github.com/ranamrameez/WealthCrescent/pull/48) remains merged. Net Worth home-dashboard rebuild [PR #49](https://github.com/ranamrameez/WealthCrescent/pull/49) is merged into `main` as `efaa8b2e4a6da1cd9b6ffdc2728afcf94fedc690`. Its PR-head Actions run #399 passed **142 test files / 1,132 tests**, both TypeScript checks, and the production build; the merge commit contains the same validated tree. The rebuild adds shared reporting ranges, exact-period figures, full selected-range analytics, per-currency insights, and collapsible flat sections. Interactive browser review and reconciliation against actual imported financial statements remain follow-ups. See `webapp/SESSION_HANDOFF.md` and `webapp/docs/net-worth-dashboard.md`.

The web app (`webapp/`) is the primary platform under active development. Its own
`webapp/README.md` is the real, continuously-updated Done/Pending backlog — this file
does not duplicate it. The Android app (`android/`) is a thin WebView shell around that same
web app plus one native-only feature (bank-SMS auto-logging), so it tracks the web app's
functionality automatically rather than needing its own parallel backlog.
