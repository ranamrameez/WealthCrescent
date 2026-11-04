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
