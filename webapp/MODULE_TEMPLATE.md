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

## Migration coverage

- Personal Loans: template owns the sections exactly once; batch editor dialogs are children, never a second section stack.
- EMI: Summary, Details, Plans, Payments, and Analytics detail sections; Summary, Loans, and Settings landing sections.
- Funds: fund Summary & Details, transaction entry, valuation, Transactions, and Balance history; broker Summary & Details and Funds.
- Subscriptions: Summary, paying account, Plans, and Alerts detail sections; separate landing Summary.
- Cash and Rentals: separate landing Summary and activity/entity sections, using StandardPageSections directly.

Stock Exchange modules are excluded from this migration. Cash and Rentals now support lazy-loaded transaction batch editing with formula amounts, edited-column indicators, category choices, and date periods. Cash edits are scoped to a currency; Rentals edits are scoped to a property. Saves validate all rows before one store update and reject stale drafts, invalid amounts, or linked records requiring the single-record editor. Rentals' date controls now filter both the visible ledger and its export period.

Remaining parity work: batch editors for Funds, EMI, Credit Cards, and applicable planning records; broader settings and filter alignment across their detail views.

The template owns navigation and section rendering. Its children are reserved for dialogs and floating actions. Never render another StandardPageSections with the same sections inside it: doing so duplicates page content after dialogs close.
