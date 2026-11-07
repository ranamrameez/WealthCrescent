import { useSyncExternalStore } from 'react';
import { getRecentTransactions, subscribeRecentTransactions } from '../services/finance/recentActivityService';
export function useRecentTransactions() { return useSyncExternalStore(subscribeRecentTransactions, getRecentTransactions); }
