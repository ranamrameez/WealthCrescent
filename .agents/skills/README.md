# WealthCrescent project skills

GitHub skills are installed locally in `.agents/skills/` and are available on the
next turn. They add agent instructions and reference material, with no application
runtime dependencies.

## Skills and pinned sources

| Directory / skill name | GitHub source | Purpose in this project |
| --- | --- | --- |
| `frontend-design` | [Anthropic](https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/frontend-design) | Layout, typography, visual polish |
| `web-design-guidelines` | [Vercel](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/web-design-guidelines) | Accessibility and interaction review |
| `react-best-practices` / `vercel-react-best-practices` | [Vercel](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/react-best-practices) | React rendering and bundle performance |
| `composition-patterns` / `vercel-composition-patterns` | [Vercel](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/composition-patterns) | Shared cards, editors, providers, and reusable component APIs |
| `vitest` | [Anthony Fu](https://github.com/antfu/skills/tree/7de210b51c8d48cc405a4eac3e17cbb1396c653b/skills/vitest) | Calculation, service, and React component regression tests |
| `vite` | [Anthony Fu](https://github.com/antfu/skills/tree/7de210b51c8d48cc405a4eac3e17cbb1396c653b/skills/vite) | Existing Vite build, plugins, asset base, and chunking |
| `firebase-auth-basics` | [Firebase / Google](https://github.com/firebase/agent-skills/tree/b76be96aaf5f152a5fb3112dde85c723c45539e7/skills/firebase-auth-basics) | Web and Android identity/authentication reference |
| `webapp-testing` | [Anthropic](https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/webapp-testing) | Local browser checks, console inspection, and screenshots |

## Why these fit

The review covered the webapp's dependencies and Vite/Vitest configuration,
Firebase Auth and Realtime Database synchronization, Zustand workbook stores,
the CalculationEngine facade and planning service, the current architecture
contract and session handoff, GitHub Actions checks, the Kotlin/WebView Android
shell and SMS bridge, and the Manifest V3 price-sync extension.

The most useful additions cover the existing regression suite, build configuration,
repeated component/editor patterns, multi-provider sign-in, and the outstanding
manual browser review. Firestore, React Native, Next.js hosting, and new market-data
API skills were deliberately excluded because they do not match the current stack.

## Apply with project constraints

Read the root `AGENTS.md`, `docs/PAGE_TEMPLATE_GUIDE.md`,
`webapp/docs/CALCULATION_ENGINE_ARCHITECTURE.md`, and
`webapp/src/themes/README.md` as applicable. Project requirements take precedence
over generic upstream examples.

- Financial calculations stay behind CalculationEngine and application services.
  Composition patterns do not justify moving business logic into providers.
- The app uses Realtime Database. Firestore rule examples in the auth references
  require different syntax and must not be copied into RTDB rules.
- Preserve the existing redirect sign-in and native bridge behavior. Installing
  an auth skill does not change providers or deploy remote configuration.
- The Vitest skill references 5.1.0-beta.1; this project declares Vitest 4.1.
  Verify examples against installed APIs. The Vite skill references 8.3.1;
  this project declares 8.2. Keep existing dependencies unless a task requires
  changing them.
- Browser testing requires Python Playwright and browser binaries, which this
  installation does not add. The supplied server wrapper does not guarantee
  Windows process-tree cleanup; prefer an existing dev server or native process
  management. Use rendered UI readiness rather than an unbounded network-idle
  wait when Firebase connections remain active.
- The web-design skill fetches current
  [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
  for each review; those live rules are not pinned by this installation.

## Example requests

- "Use vitest to add regression coverage for a recurring-payment date boundary."
- "Use vercel-composition-patterns to simplify the shared finance editors while preserving service boundaries."
- "Use vite to investigate production chunk loading under /WealthCrescent/."
- "Use firebase-auth-basics to investigate sign-in without changing the current providers."
- "Use webapp-testing to inspect the dashboard on mobile with local/demo data."
- "Use web-design-guidelines to review keyboard navigation and form labels."

## Provenance and licenses

Installed on 2026-11-04 using the Codex skill-installer helper. The links above
record exact commit revisions; complete upstream skill directories are retained.

- Anthropic licenses are included in each skill's `LICENSE.txt`.
- Vercel React/composition skills declare MIT in their frontmatter.
- Anthony Fu's repository MIT license is retained in
  `licenses/antfu-skills-LICENSE.md`.
- Firebase's repository Apache 2.0 license is retained in
  `licenses/firebase-agent-skills-LICENSE`.

## Updating

Review upstream changes and choose a new commit before replacing a skill. The
installer refuses to overwrite existing directories: install to a temporary
location, compare files, then replace only the intended skill. Retain supporting
references, license notices, and update the pinned source and compatibility notes.
