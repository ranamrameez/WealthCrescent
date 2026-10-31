import type { ReactNode } from 'react';
import { StandardPageSections } from './StandardPageSections';
import type { StandardCardAction } from './StandardCard';

export interface TabDef {
  table?: boolean;
  key: string;
  label: string;
  content: ReactNode;
  headerExtra?: ReactNode;
  actions?: StandardCardAction[];
  defaultOpen?: boolean;
}

/** Compatibility adapter onto the standard URL-aware page section stack.
 * Existing modules retain the Tabs API while section state becomes deep-linkable
 * through ?section=<key> and section cards use the shared StandardCard. */
export function Tabs({ tabs, defaultKey }: { tabs: TabDef[]; defaultKey?: string }) {
  return (
    <StandardPageSections
      defaultKey={defaultKey}
      sections={tabs.map((tab) => ({
        table: tab.table,
        key: tab.key,
        label: tab.label,
        content: tab.content,
        headerEnd: tab.headerExtra,
        actions: tab.actions,
        defaultOpen: tab.defaultOpen,
      }))}
    />
  );
}
