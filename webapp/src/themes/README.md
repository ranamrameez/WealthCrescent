# Appearance themes

`index.css` loads shared tokens from `base.css`, followed by each selectable
theme's palette and component rules. `main.tsx` imports it after `main.css`, the
single shared stylesheet for layout, components, typography, and popups.
Keep theme-specific selectors in the corresponding theme file;
every selector must include that theme's `data-color` attribute.

`catalog.ts` is the source for the appearance picker's options and preference
validation. New themes need both a catalog entry and a stylesheet import.
Both light and dark modes must supply readable surfaces and accent text.

Retired or unknown saved theme IDs fall back to Ocean. Other saved preferences
are preserved. The supported themes are Ocean, Forest, Violet, Aurora, Cobalt,
Teal, Copper, Gold, and Material Teal.

Run the focused checks with:

```sh
npm run test -- src/themes/themes.test.ts src/store/__tests__/appearanceStore.test.ts
```

These check palette tokens, selector isolation, the stylesheet catalog, and
preference persistence. They do not replace a browser visual review.
