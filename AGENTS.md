# Project skills

Project-local skills are in `.agents/skills/`. Read the relevant `SKILL.md` when
working on the corresponding area:

- `frontend-design`: visual direction, layout, typography, and interface polish.
- `web-design-guidelines`: accessibility, forms, focus, responsive behavior, and UX reviews.
- `react-best-practices` (skill name `vercel-react-best-practices`): React rendering,
  component performance, data fetching, and bundle size.
- `composition-patterns` (skill name `vercel-composition-patterns`): reusable
  components, compound components, providers, and component API design.
- `vitest`: unit/component regression tests, mocks, fake timers, and test configuration.
- `vite`: development/build configuration, asset URLs, plugins, and bundling.
- `firebase-auth-basics`: existing Firebase sign-in flows and identity handling.
- `webapp-testing`: local browser interaction checks, screenshots, and console inspection.
- `reconciliation`: reconcile ledger, statement, and broker balances; classify differences.
- `variance-analysis`: explain budget-versus-actual and period-over-period changes.
- `search-strategy`: decompose research questions and search available sources.
- `knowledge-synthesis`: combine evidence with citations and explicit uncertainty.
- `nodejs-backend-patterns`: backend validation, errors, asynchronous work, and service patterns.
- `architecture-patterns`: application/domain/repository boundaries and dependency direction.
- `security-best-practices`: explicit JavaScript/TypeScript security reviews and secure coding.
- `security-threat-model`: explicitly requested, repository-grounded threat modeling.
- `property-based-testing`: invariant, round-trip, and oracle tests for calculators and parsers.
- `validate-data`: check aggregation, period/filter consistency, and analytical conclusions.
- `statistical-analysis`: trends, distributions, outliers, uncertainty, and comparisons.
- `data-visualization`: chart selection, truthful scales, accessible colors, and export figures.
- `build-dashboard`: Chart.js chart/filter patterns and standalone analytical dashboards.

See `.agents/skills/README.md` for sources, pinned revisions, and usage examples.

## Apply skills to WealthCrescent

- Read `docs/PAGE_TEMPLATE_GUIDE.md` before creating or changing product pages;
  its page anatomy and cross-module parity requirements are the project contract.
- Read `webapp/src/themes/README.md` before changing appearance. Reuse existing
  theme tokens and shared components; preserve light/dark mode and theme isolation.
- Follow the existing React + TypeScript + Vite architecture. Apply the React
  guidance that fits this client app; Next.js, server components, server actions,
  and SSR guidance only applies if that infrastructure is actually introduced.
- Preserve financial calculations, currency/date semantics, active filters, and
  existing workflows during visual changes. Prioritize legibility of financial
  tables, charts, and forms across desktop and mobile.
- Project requirements and the user's requested scope take precedence over
  generic upstream style preferences. Installing these skills does not authorize
  an unsolicited redesign or new dependencies.

## Architecture and compatibility

- Read `webapp/SESSION_HANDOFF.md` and
  `webapp/docs/CALCULATION_ENGINE_ARCHITECTURE.md` before changing business logic.
  UI renders service-provided view models and dispatches commands. Application
  services own validation, authorization, and persistence; deterministic financial
  calculations go through `CalculationEngine`. Composition providers may manage
  presentation state, but must not become new financial engines or persistence layers.
- This app uses Firebase **Realtime Database**, not Firestore. Preserve
  `users/{uid}` isolation, the existing cloud-first sync guards, and the separate
  shared market-data paths. Firestore `request.auth` examples are not RTDB rules;
  RTDB uses `auth`. Keep existing redirect sign-in behavior and Android/WebView
  bridge constraints documented in `android/README.md` and the auth implementation.
- Use the current Firebase project configuration. Auth skill provisioning/deploy
  examples apply only when the requested task includes changing remote auth setup.
- Check `webapp/package.json` and the lockfile before applying API/config examples.
  The installed Vitest reference targets 5.1 beta while this app uses Vitest 4;
  verify API availability against the installed version and use compatible APIs.
  Do not upgrade dependencies just to match skill examples.
- Preserve Vite's `/WealthCrescent/` asset base and existing chunking constraints.
  The Vite reference targets 8.3 while the app declares 8.2; verify options before use.
- Browser-testing helpers require Python, Playwright, and a browser installation;
  these are not installed by adding the skill. On Windows prefer an already-running
  dev server or native process management: the upstream server helper terminates
  direct subprocesses and does not guarantee cleanup of Windows child processes.
  For this long-lived Firebase app, wait for a specific rendered UI state if
  network-idle never arrives. Use local/demo fixtures for interaction checks.
- Run focused tests for affected behavior from `webapp/`; its production build
  includes both TypeScript checks. Follow the existing full-suite/build merge
  requirements in `webapp/README.md`. Skills-only changes need skill/reference
  validation rather than an application build.

## Finance, research, backend, security, and analytics

- Reconciliation and variance skills supply analysis methods, not a replacement
  accounting model. Preserve official FIFO versus advisory lot views, broker
  isolation, pending/cleared distinctions, fee treatment, and currency units.
  Do not silently adjust transactions to force reconciliation. Derive implemented
  financial metrics through CalculationEngine and application services.
- Research uses available local evidence, GitHub, official product docs, exchange/
  regulator publications, and explicitly connected sources. Verify current facts,
  record dates and units, cite the exact source, separate evidence from inference,
  and flag conflicting results. Connector placeholders do not imply those tools
  are installed or grant permission to publish, send messages, or upload data.
- Backend examples must fit the existing Firebase Functions and Realtime Database
  architecture. Do not introduce Express, Fastify, PostgreSQL, microservices, or
  a new authentication layer just to follow an example. Keep idempotency, retries,
  atomic ledger/execution updates, provider rate budgets, and testable adapters in
  view. Scheduled auto-pay only creates pending in-app ledger records; it never
  moves real money. Retain backend-only market/FX API access.
- Security guidance must cover actual exposed boundaries: per-user RTDB data,
  shared market data, Firebase Admin privileges, imported files, persisted HTML,
  the Android JS bridge, extension messaging, and CI credentials as applicable.
  Distinguish exploitable secrets from public Firebase client configuration.
  Generic Express/cookie examples are not Firebase-specific controls, and this
  skill bundle does not include Kotlin security rules. Use official platform
  guidance where framework references are missing.
- For app charts use the existing npm `chart.js` / `react-chartjs-2` integration,
  shared registration, theme/style helpers, filters, and interaction conventions.
  Read `webapp/src/lib/chartSetup.ts`, `chartVisuals.ts`, `chartLabels.ts`, and
  any current shared chart style/interaction helpers before adding parallel ones.
  Do not paste the standalone dashboard HTML/CDN scripts into React product pages.
  Python visualization examples are for analysis/export artifacts, not new app
  runtime dependencies. Upstream CDN examples require network access and do not
  by themselves produce fully offline dashboards.
- Chart data and summaries must share the same service-provided filtered dataset.
  Label currencies, denominators, dates, units, and forecast versus actual values.
  Distinguish zero from missing data, handle empty/negative/zero-baseline cases,
  preserve theme contrast, reduced motion, and mobile sizing, and provide an
  accessible text/table equivalent for canvas information. Statistical and
  variance formulas need boundary and decomposition checks before implementation.
- Property-based testing is most useful for lot conservation, balance invariants,
  serialization round-trips, date boundaries, and migration parity. Verify that a
  property expresses the real contract; ordering and commutativity often do not
  hold for financial ledgers. A new test generator is a separate dependency
  decision; installing the skill does not install fast-check or change tests.
