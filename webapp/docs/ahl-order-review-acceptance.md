# AHL order-history review acceptance

WC-TR trading tools session, 2026-11-22. Verify the AHL order-history review and broker-scoped save using fixtures. Cover repeat imports, overlapping fills, stale reviews and broker switching. Keep this independent of PSX Profiler and cash-import work. Run focused regressions, the full suite, production build and exact-head GitHub Actions. No production ledger writes.
