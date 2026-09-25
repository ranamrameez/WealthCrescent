import { createEntryStore } from './createEntryStore';
import { createEmptySubscriptionsWorkbook } from './defaultSubscriptionsWorkbook';
import { removeSubscriptionPlans } from '../lib/planLifecycle';

export const useSubscriptionsWorkbookStore = createEntryStore('WealthCrescent_subscriptions_workbook_v1', createEmptySubscriptionsWorkbook, {
  onDelete: removeSubscriptionPlans,
  onUpdate: (id, patch) => {
    if ('paidVia' in patch) removeSubscriptionPlans(id, patch.paidVia);
  },
});
