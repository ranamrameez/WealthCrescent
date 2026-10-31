# WealthCrescent Web App — development status

This file is the webapp-specific status entry point. See [the user manual](USER_MANUAL.md) for product usage, [the session handoff](SESSION_HANDOFF.md) for current implementation continuity, and [the audit](audit.md) for verified findings and validation notes.

## Current focus — unified stock calculation engine

**Active PR:** [#48 — Unify stock calculations, lifecycles, and same-day event ordering](https://github.com/ranamrameez/WealthCrescent/pull/48)  
**Branch:** `feat/unified-stock-calculation-engine`

### Implemented on the branch

- One stock-accounting pass handles Average/FIFO/other lot methods and returns positions, realized P/L, per-sale attribution, open lots, closed trades, lifecycle records and oversell reconciliation.
- One exchange-level portfolio pipeline assembles stock accounting, market valuation, cash ledger and cash summary for QSE and PSX.
- Chronological position lifecycles reset when a position is fully closed; a later BUY starts a new lifecycle without inherited shares, basis or lots.
- Unmatched SELL shares are reported and excluded from realized profit; their proportional fees are separately expensed. Real cash proceeds remain in the cash ledger.
- Same-day ordering uses one persisted sequence across trades, transfers, adjustments and dividends, using the existing row-arrow controls without changing event dates.

### Validation status

- Latest code validation is in progress/being corrected; check the exact PR head and GitHub Actions before merge.
- Manual interactive browser verification and real backup/export review remain outstanding.
- This branch is not merged into `main`.

## Guardrails

- Never push directly to `main`.
- Continue on the current PR branch; preserve recent changes already merged to `main`.
- Keep calculations centralized; components must consume engine results, not recreate calculation logic.
- Any application-code change after a successful validation requires a fresh full test suite, type-check and production build.
