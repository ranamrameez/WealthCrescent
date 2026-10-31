# WealthCrescent Web App — development status

This file is the webapp-specific status entry point. See [the user manual](USER_MANUAL.md) for product usage, [the session handoff](SESSION_HANDOFF.md) for implementation continuity, and [the audit](audit.md) for verified findings and validation notes.

## Current focus — unified stock calculation engine

**Active PR:** [#48 — Unify stock calculations, lifecycles, and same-day event ordering](https://github.com/ranamrameez/WealthCrescent/pull/48)  
**Branch:** `feat/unified-stock-calculation-engine`

### Implemented on the branch

- One stock-accounting pass handles Average/FIFO/lowestCostFirst, chronological lifecycle boundaries, realized P/L, per-sale attribution, closed trades, open lots and oversell reconciliation.
- One exchange-level portfolio pipeline assembles stock accounting, market valuation, break-even, +1%/+2%/+5% exit targets, per-share commission, cash ledger and cash summary for QSE and PSX.
- The shared market-value/unrealized-P&L helper is reused by live portfolio valuation, cash-summary fallback and historical P/L snapshots.
- QSE/PSX normal and Strategic Trades views consume the same portfolio pipeline; historical P/L uses the central stock engine for each chronological prefix.
- Unmatched SELL shares are reported and excluded from realized profit; their proportional fees are separately expensed. Real sell proceeds remain in the cash ledger.
- Same-day ordering uses one persisted sequence across trades, transfers, adjustments and dividends, using the existing row-arrow controls without changing event dates.
- Legacy same-day records without a saved sequence use recorded time before legacy trade indexes; saved user order remains authoritative.

### Validation checkpoint

The application-code commit `48fde7820b387ec1c1fa4184bb02dd5600774330` passed GitHub Actions run [#41242056151](https://github.com/ranamrameez/WealthCrescent/actions/runs/41242056151): type-check, production build, broker-profile/PSX-fee regression tests, and **142 test files / 1,123 tests**.

The current commit refreshes documentation and code comments only. Verify Actions on the exact live PR head before merge. Manual browser smoke tests and real-backup/export review remain outstanding. PR #48 is not merged into `main`.

## Guardrails

- Never push directly to `main`.
- Continue on the current PR branch; preserve recent changes already merged to `main`.
- Keep calculations centralized; components consume engine results rather than recreating accounting formulas.
- Any application-code change after a successful validation requires a fresh full test suite, type-check and production build.
