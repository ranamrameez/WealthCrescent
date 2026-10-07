export function orderedFabActions<T extends { label: string }>(actions: T[]) {
  const identity = (label: string) => label.toLowerCase().replace(/\b(an?|the)\b/g, '').replace(/\s+/g, ' ').trim().replace(/^transfers$/, 'transfer');
  const rank = (label: string) => /add.*plan/.test(label) ? 0 : /add/.test(label) ? 1 : /transfer/.test(label) ? 2 : 3;
  const seen = new Set<string>();
  return actions.filter(action => { const key = identity(action.label); if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => rank(identity(a.label)) - rank(identity(b.label)));
}
