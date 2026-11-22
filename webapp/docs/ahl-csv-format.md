# AHL CSV format detection

On 2026-11-23, a synthetic PSX cash CSV containing literal table markup in a quoted description reproduced a format-detection failure. The native reader now routes an explicitly named CSV (including uppercase extensions) through the CSV parser. Generic text files still use HTML detection and XLSX uses the spreadsheet reader.

The new regression failed before the fix. All 10 focused CSV, nested-table and cash-review tests passed afterward.
