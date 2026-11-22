# AHL HTML table compatibility

On 2026-11-23, a synthetic portal export showed that the native HTML reader missed order tables enclosed in a layout table. The reader now discovers nested tables independently, reads their own rows and cells, and skips nested table contents when reading the enclosing cell. The regression failed before the change and passed afterwards. All 13 focused order, cash and HTML tests passed. No private exports are stored in this repository.
