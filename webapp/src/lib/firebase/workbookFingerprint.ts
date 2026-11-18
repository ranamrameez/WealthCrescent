/** RTDB snapshots may enumerate identical object keys in different orders. */
export function fingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, node: unknown) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
    return Object.fromEntries(Object.entries(node).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  });
}
