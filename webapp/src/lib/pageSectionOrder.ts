/** Common finance-page order. Equal-ranked sections retain their original order. */
export function sectionOrder(section: { key: string; label: string }) {
  const label = section.label.toLowerCase();
  const key = section.key.toLowerCase();
  if (/\bdetails?\b/.test(label) || key === 'details') return 1;
  if (/summary|balances|valuation/.test(label) || /^(summary|balances|valuation)$/.test(key)) return 0;
  if (/settings|import|data management|preferences/.test(label) || key === 'settings') return 6;
  if (/analytics|risk analysis|categories|alerts/.test(label) || key === 'analytics') return 5;
  if (/transactions|payments|income & expenses|trade list|cash ledger|history|transfers|dividends|adjustments|add trades|add transaction/.test(label) || key === 'transactions') return 4;
  if (/plans|planning/.test(label) || /^(plans|planning)$/.test(key)) return 3;
  return 2;
}

export function orderedPageSections<T extends { key: string; label: string }>(sections: T[]): T[] {
  return [...sections].sort((a, b) => sectionOrder(a) - sectionOrder(b));
}
