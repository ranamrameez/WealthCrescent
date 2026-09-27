# Finance module template

Banking (Banks & Accounts) is the reference interaction model for every finance module. New entity pages should use `ModuleDetailTemplate` and `StandardPageSections` so navigation, filters, actions, fullscreen cards, hue, and top-bar controls stay consistent.

## Detail page contract

1. Page heading with a compact back action and the entity name.
2. Shared top-bar controls for date period, search, and module filters.
3. Sections in this order when applicable: **Summary**, **Details**, **Plans**, **Transactions/Payments**, **Analytics**.
4. Each section is a `StandardCard` section with a concise summary, overflow actions, optional header controls, and the entity hue.
5. Activity sections support import, export, batch edit, and a date-period filter. Use the appearance store's date format for every displayed date.
6. Destructive actions remain in the section action menu and follow account settings, appearance settings, archive rules, and confirmation behavior.

## Reuse

```tsx
<ModuleDetailTemplate
  backLabel="All items"
  onBack={onBack}
  title={item.name}
  hue={item.color}
  topBarRight={filters}
  sections={sections}
  defaultKey="summary"
>
  {modals}
</ModuleDetailTemplate>
```

Do not create module-specific section shells when the content can be expressed as a standard section. Domain-specific fields and calculations belong inside the section content; the surrounding behavior belongs in the template.
