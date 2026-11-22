# AHL order-export validation

On 2026-11-22, two privately supplied AHL order-history HTML exports passed offline validation through the native PSX table reader and order parser. For each export, the parsed fill count matched the number of buy and sell rows in the source table. The review service saved one selected buy into an isolated Al Habib workbook and classified it as already recorded when the source was reviewed again.

Ten checks passed, including the two private-file checks and the eight committed parser and review regressions. No parser changes were required. The private files and trade details were excluded from the repository. The check used a local test owner and did not exercise a live signed-in save or cloud sync.
