import { create, type UseBoundStore, type StoreApi } from 'zustand';
import { toInstantMs } from '../lib/datetime';
import { assignSeqForEntities, backfillSeq, nextSeq, nextSeqForEntity } from '../lib/seq';
import { sortTransactionsChronological } from '../lib/calc/sortTransactions';
import type { Adjustment, BrokerPortfolioData, BrokerProfile, Dividend, PricePoint, Transaction, TradePlan, Transfer, WatchlistItem } from '../types/workbook';
import { scheduleLocalStorageWrite } from '../lib/localStoragePersistence';

function chronologicalByInstant<T extends { date: string; time?: string; timezone?: string }>(records: T[]): T[] {
  return [...records].sort((a, b) => toInstantMs(a.date, a.time, a.timezone) - toInstantMs(b.date, b.time, b.timezone));
}

export interface BaseWorkbook<TSettings> {
  settings: TSettings;
  transactions: Transaction[];
  transfers: Transfer[];
  adjustments: Adjustment[];
  marketPrices: Record<string, number>;
  priceHistory: Record<string, PricePoint[]>;
  watchlist: WatchlistItem[];
  dividends: Dividend[];
  dividendEstimates: Record<string, number>;
  tradePlans: TradePlan[];
  /** Optional profile fields: present in QSE/PSX workbooks, absent in other modules. */
  brokerProfiles?: BrokerProfile<TSettings>[];
  activeBrokerId?: string;
}

export interface WorkbookStoreState<TWorkbook extends BaseWorkbook<unknown>> {
  workbook: TWorkbook;
  setWorkbook: (wb: TWorkbook, opts?: { skipPersist?: boolean }) => void;
  addTransaction: (tx: Transaction) => void;
  addTransactions: (txs: Transaction[]) => void;
  updateTransaction: (index: number, patch: Partial<Transaction>) => void;
  deleteTransaction: (index: number) => void;
  addTransfer: (t: Transfer) => void;
  updateTransfer: (id: string, patch: Partial<Transfer>) => void;
  deleteTransfer: (id: string) => void;
  addAdjustment: (a: Adjustment) => void;
  updateAdjustment: (index: number, patch: Partial<Adjustment>) => void;
  deleteAdjustment: (index: number) => void;
  addWatchlistItem: (w: WatchlistItem) => void;
  updateWatchlistItem: (ticker: string, patch: Partial<WatchlistItem>) => void;
  removeWatchlistItem: (ticker: string) => void;
  setMarketPrice: (ticker: string, price: number) => void;
  updatePricePoint: (ticker: string, index: number, patch: Partial<PricePoint>) => void;
  deletePricePoint: (ticker: string, index: number) => void;
  addDividend: (d: Dividend) => void;
  updateDividend: (index: number, patch: Partial<Dividend>) => void;
  removeDividend: (index: number) => void;
  setDividendEstimate: (ticker: string, annualPerShare: number) => void;
  updateSettings: (patch: Partial<TWorkbook['settings']>) => void;
  setActiveBroker: (brokerId: string) => void;
  addTradePlan: (plan: TradePlan) => void;
  updateTradePlan: (id: string, patch: Partial<TradePlan>) => void;
  deleteTradePlan: (id: string) => void;
  executeTradePlanLeg: (planId: string, legIndex: number) => void;
}

function syncLatestMarketPrice(marketPrices: Record<string, number>, ticker: string, history: PricePoint[]): Record<string, number> {
  if (!history.length) {
    const next = { ...marketPrices };
    delete next[ticker];
    return next;
  }
  // The effective calendar date is authoritative. `time` only orders
  // multiple observations on the same date; retaining an old timestamp
  // must not undo a user's historical-date edit.
  const latest = [...history].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')).pop()!;
  return { ...marketPrices, [ticker]: latest.price };
}

export function createWorkbookStore<TWorkbook extends BaseWorkbook<unknown>>(
  storageKey: string,
  createEmpty: () => TWorkbook,
): UseBoundStore<StoreApi<WorkbookStoreState<TWorkbook>>> {
  function normalize(wb: TWorkbook): TWorkbook {
    const asArray = <T,>(value: unknown): T[] => Array.isArray(value)
      ? value as T[]
      : value && typeof value === 'object'
        ? Object.values(value as Record<string, T>)
        : [];
    const rawProfiles = asArray<BrokerProfile<TWorkbook['settings']>>(wb.brokerProfiles);
    const profiles = rawProfiles.map((profile) => profile.data ? {
      ...profile,
      data: {
        transactions: asArray<Transaction>(profile.data.transactions),
        transfers: asArray<Transfer>(profile.data.transfers),
        adjustments: asArray<Adjustment>(profile.data.adjustments),
        dividends: asArray<Dividend>(profile.data.dividends),
        tradePlans: asArray<TradePlan>(profile.data.tradePlans),
      },
    } : profile);
    const activeProfile = profiles.find((p) => p.id === wb.activeBrokerId && !p.archived)
      ?? profiles.find((p) => !p.archived);
    const activeBrokerId = activeProfile?.id ?? wb.activeBrokerId;
    // One-time, non-destructive migration: historical trades without a broker
    // are assigned to the original/default active profile. Preserve all trade
    // fields and seed that profile's settings from the legacy workbook settings.
    const hasUnassignedRecords = wb.transactions.some((t) => !t.brokerId)
      || wb.transfers.some((t) => !t.brokerId)
      || wb.adjustments.some((a) => !a.brokerId)
      || wb.dividends.some((d) => !d.brokerId)
      || wb.tradePlans.some((p) => !p.brokerId);
    const brokerProfiles = hasUnassignedRecords && activeProfile
      ? profiles.map((p) => p.id === activeProfile.id ? { ...p, settings: wb.settings } : p)
      : profiles;
    const transactionsWithBroker = wb.transactions.map((t) => ({
      ...t,
      ...(t.brokerId || !activeBrokerId ? {} : { brokerId: activeBrokerId }),
    }));
    const transactionsWithId = transactionsWithBroker.map((t) => (t.id ? t : { ...t, id: crypto.randomUUID() }));
    const transfersWithId = wb.transfers.map((t) => ({ ...t, ...(t.brokerId || !activeBrokerId ? {} : { brokerId: activeBrokerId }), ...(t.id ? {} : { id: crypto.randomUUID() }) }));
    const adjustmentsWithId = wb.adjustments.map((a) => ({ ...a, ...(a.brokerId || !activeBrokerId ? {} : { brokerId: activeBrokerId }), ...(a.id ? {} : { id: crypto.randomUUID() }) }));
    const dividendsWithId = wb.dividends.map((d) => ({ ...d, ...(d.brokerId || !activeBrokerId ? {} : { brokerId: activeBrokerId }), ...(d.id ? {} : { id: crypto.randomUUID() }) }));
    const plansWithId = wb.tradePlans.map((p) => ({ ...p, ...(p.brokerId || !activeBrokerId ? {} : { brokerId: activeBrokerId }), id: p.id || crypto.randomUUID(), legs: p.legs || [] }));
    const normalized = {
      ...wb,
      ...(profiles.length ? { brokerProfiles, activeBrokerId } : {}),
      transactions: backfillSeq(transactionsWithId, sortTransactionsChronological(transactionsWithId)),
      transfers: backfillSeq(transfersWithId, chronologicalByInstant(transfersWithId)),
      adjustments: backfillSeq(adjustmentsWithId, chronologicalByInstant(adjustmentsWithId)),
      dividends: backfillSeq(dividendsWithId, chronologicalByInstant(dividendsWithId)),
      tradePlans: plansWithId,
    } as TWorkbook;
    // Legacy workbooks store one exchange-wide portfolio. The migration above
    // assigns its existing records to the default profile; snapshot that full
    // history into the active profile so future broker switches are isolated.
    const active = normalized.brokerProfiles?.find((p) => p.id === normalized.activeBrokerId);
    if (!active) return normalized;
    const data: BrokerPortfolioData = {
      transactions: normalized.transactions,
      transfers: normalized.transfers,
      adjustments: normalized.adjustments,
      dividends: normalized.dividends,
      tradePlans: normalized.tradePlans,
    };
    return {
      ...normalized,
      brokerProfiles: normalized.brokerProfiles!.map((p) => p.id === active.id
        ? { ...p, settings: normalized.settings, data }
        : p),
    };
  }

  function loadFromLocalStorage(): TWorkbook {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return normalize({ ...createEmpty(), ...JSON.parse(raw) });
    } catch (e) {
      console.warn(`Failed to load workbook from localStorage (${storageKey})`, e);
    }
    return createEmpty();
  }

  function persist(workbook: TWorkbook) {
    scheduleLocalStorageWrite(storageKey, workbook, (e) => {
      console.error(`Failed to save workbook to localStorage (${storageKey}) — your last change may not have persisted.`, e);
    });
  }

  return create<WorkbookStoreState<TWorkbook>>((set, get) => {
    const snapshotActiveProfile = (wb: TWorkbook): TWorkbook => {
      const profiles = wb.brokerProfiles;
      const activeId = wb.activeBrokerId;
      if (!profiles?.length || !activeId) return wb;
      const data: BrokerPortfolioData = {
        transactions: wb.transactions,
        transfers: wb.transfers,
        adjustments: wb.adjustments,
        dividends: wb.dividends,
        tradePlans: wb.tradePlans,
      };
      return {
        ...wb,
        brokerProfiles: profiles.map((profile) => profile.id === activeId
          ? { ...profile, settings: wb.settings, data }
          : profile),
      };
    };
    const mutate = (updater: (wb: TWorkbook) => TWorkbook) => {
      const next = snapshotActiveProfile(updater(get().workbook));
      set({ workbook: next });
      persist(next);
    };

    return {
      workbook: loadFromLocalStorage(),
      setWorkbook: (wb, opts) => {
        const next = normalize(wb);
        set({ workbook: next });
        if (!opts?.skipPersist) persist(next);
      },
      addTransaction: (tx) => mutate((wb) => {
        const seq = tx.seq !== undefined ? tx.seq : nextSeqForEntity(wb.transactions, (t) => t.ticker, tx.ticker);
        const timestamp = tx.timestamp ?? new Date().toISOString();
        const id = tx.id ?? crypto.randomUUID();
        return { ...wb, transactions: [...wb.transactions, { ...tx, ...(tx.brokerId || !wb.activeBrokerId ? {} : { brokerId: wb.activeBrokerId }), id, seq, timestamp }] };
      }),
      addTransactions: (txs) => mutate((wb) => {
        const now = new Date().toISOString();
        const withSeq = assignSeqForEntities(wb.transactions, txs, (t) => t.ticker);
        const withIdAndTimestamp = withSeq.map((t) => ({ ...t, ...(t.brokerId || !wb.activeBrokerId ? {} : { brokerId: wb.activeBrokerId }), id: t.id ?? crypto.randomUUID(), timestamp: t.timestamp ?? now }));
        return { ...wb, transactions: [...wb.transactions, ...withIdAndTimestamp] };
      }),
      updateTransaction: (index, patch) => mutate((wb) => ({ ...wb, transactions: wb.transactions.map((t, i) => (i === index ? { ...t, ...patch } : t)) })),
      deleteTransaction: (index) => mutate((wb) => ({ ...wb, transactions: wb.transactions.filter((_, i) => i !== index) })),
      addTransfer: (t) => mutate((wb) => {
        const withId = t.id ? t : { ...t, id: crypto.randomUUID() };
        return { ...wb, transfers: [...wb.transfers, { ...withId, ...(withId.brokerId || !wb.activeBrokerId ? {} : { brokerId: wb.activeBrokerId }), seq: withId.seq !== undefined ? withId.seq : nextSeq(wb.transfers), timestamp: withId.timestamp ?? new Date().toISOString() }] };
      }),
      updateTransfer: (id, patch) => mutate((wb) => ({ ...wb, transfers: wb.transfers.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      deleteTransfer: (id) => mutate((wb) => ({ ...wb, transfers: wb.transfers.filter((t) => t.id !== id) })),
      addAdjustment: (a) => mutate((wb) => {
        const withId = a.id ? a : { ...a, id: crypto.randomUUID() };
        const seq = withId.seq !== undefined ? withId.seq : nextSeq(wb.adjustments);
        return { ...wb, adjustments: [...wb.adjustments, { ...withId, ...(withId.brokerId || !wb.activeBrokerId ? {} : { brokerId: wb.activeBrokerId }), seq, timestamp: withId.timestamp ?? new Date().toISOString() }] };
      }),
      updateAdjustment: (index, patch) => mutate((wb) => ({ ...wb, adjustments: wb.adjustments.map((a, i) => (i === index ? { ...a, ...patch } : a)) })),
      deleteAdjustment: (index) => mutate((wb) => ({ ...wb, adjustments: wb.adjustments.filter((_, i) => i !== index) })),
      addWatchlistItem: (w) => mutate((wb) => ({ ...wb, watchlist: [...wb.watchlist, w] })),
      updateWatchlistItem: (ticker, patch) => mutate((wb) => ({ ...wb, watchlist: wb.watchlist.map((w) => (w.ticker === ticker ? { ...w, ...patch } : w)) })),
      removeWatchlistItem: (ticker) => mutate((wb) => ({ ...wb, watchlist: wb.watchlist.filter((w) => w.ticker !== ticker) })),
      setMarketPrice: (ticker, price) => mutate((wb) => {
        const today = new Date().toISOString().slice(0, 10);
        const history = wb.priceHistory[ticker] || [];
        const point: PricePoint = { date: today, time: new Date().toISOString(), price };
        return { ...wb, marketPrices: { ...wb.marketPrices, [ticker]: price }, priceHistory: { ...wb.priceHistory, [ticker]: [...history, point] } };
      }),
      updatePricePoint: (ticker, index, patch) => mutate((wb) => {
        const history = wb.priceHistory[ticker] || [];
        if (index < 0 || index >= history.length) return wb;
        const nextHistory = history.map((p, i) => (i === index ? { ...p, ...patch } : p));
        return { ...wb, priceHistory: { ...wb.priceHistory, [ticker]: nextHistory }, marketPrices: syncLatestMarketPrice(wb.marketPrices, ticker, nextHistory) };
      }),
      deletePricePoint: (ticker, index) => mutate((wb) => {
        const history = wb.priceHistory[ticker] || [];
        if (index < 0 || index >= history.length) return wb;
        const nextHistory = history.filter((_, i) => i !== index);
        return { ...wb, priceHistory: { ...wb.priceHistory, [ticker]: nextHistory }, marketPrices: syncLatestMarketPrice(wb.marketPrices, ticker, nextHistory) };
      }),
      addDividend: (d) => mutate((wb) => {
        const withId = d.id ? d : { ...d, id: crypto.randomUUID() };
        const seq = withId.seq !== undefined ? withId.seq : nextSeqForEntity(wb.dividends, (x) => x.ticker, withId.ticker);
        return { ...wb, dividends: [...wb.dividends, { ...withId, ...(withId.brokerId || !wb.activeBrokerId ? {} : { brokerId: wb.activeBrokerId }), seq, timestamp: withId.timestamp ?? new Date().toISOString() }] };
      }),
      updateDividend: (index, patch) => mutate((wb) => ({ ...wb, dividends: wb.dividends.map((d, i) => (i === index ? { ...d, ...patch } : d)) })),
      removeDividend: (index) => mutate((wb) => ({ ...wb, dividends: wb.dividends.filter((_, i) => i !== index) })),
      setDividendEstimate: (ticker, annualPerShare) => mutate((wb) => ({ ...wb, dividendEstimates: { ...wb.dividendEstimates, [ticker]: annualPerShare } })),
      updateSettings: (patch) => mutate((wb) => {
        const settings = { ...(wb.settings as object), ...patch } as TWorkbook['settings'];
        const profiles = wb.brokerProfiles;
        return {
          ...wb,
          settings,
          ...(profiles?.length && wb.activeBrokerId ? {
            brokerProfiles: profiles.map((p) => p.id === wb.activeBrokerId ? { ...p, settings } : p),
          } : {}),
        };
      }),
      setActiveBroker: (brokerId) => mutate((wb) => {
        if (brokerId === wb.activeBrokerId) return wb;
        const currentData: BrokerPortfolioData = {
          transactions: wb.transactions,
          transfers: wb.transfers,
          adjustments: wb.adjustments,
          dividends: wb.dividends,
          tradePlans: wb.tradePlans,
        };
        const profiles = wb.brokerProfiles?.map((p) => p.id === wb.activeBrokerId
          ? { ...p, settings: wb.settings, data: currentData }
          : p);
        const target = profiles?.find((p) => p.id === brokerId && !p.archived);
        if (!target) return wb;
        const targetData: Partial<BrokerPortfolioData> = target.data ?? {};
        const data: BrokerPortfolioData = {
          transactions: targetData.transactions ?? [],
          transfers: targetData.transfers ?? [],
          adjustments: targetData.adjustments ?? [],
          dividends: targetData.dividends ?? [],
          tradePlans: targetData.tradePlans ?? [],
        };
        return {
          ...wb,
          brokerProfiles: profiles,
          activeBrokerId: target.id,
          settings: target.settings as TWorkbook['settings'],
          transactions: data.transactions,
          transfers: data.transfers,
          adjustments: data.adjustments,
          dividends: data.dividends,
          tradePlans: data.tradePlans,
        };
      }),
      addTradePlan: (plan) => mutate((wb) => ({ ...wb, tradePlans: [...wb.tradePlans, { ...plan, ...(plan.brokerId || !wb.activeBrokerId ? {} : { brokerId: wb.activeBrokerId }), id: plan.id || crypto.randomUUID(), legs: plan.legs || [] }] })),
      updateTradePlan: (id, patch) => mutate((wb) => ({ ...wb, tradePlans: wb.tradePlans.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deleteTradePlan: (id) => mutate((wb) => ({ ...wb, tradePlans: wb.tradePlans.filter((p) => p.id !== id) })),
      executeTradePlanLeg: (planId, legIndex) => mutate((wb) => {
        const plan = wb.tradePlans.find((p) => p.id === planId);
        const leg = plan?.legs[legIndex];
        if (!plan || !leg || leg.executed || leg.ignored) return wb;
        const tx: Transaction = { id: crypto.randomUUID(), brokerId: wb.activeBrokerId, seq: nextSeqForEntity(wb.transactions, (t) => t.ticker, leg.ticker), timestamp: new Date().toISOString(), date: leg.date || new Date().toISOString().slice(0, 10), ticker: leg.ticker, action: leg.action, shares: leg.shares, price: leg.price, targetLotBuyId: leg.targetLotBuyId };
        return { ...wb, transactions: [...wb.transactions, tx], tradePlans: wb.tradePlans.map((p) => p.id === planId ? { ...p, legs: p.legs.map((l, i) => i === legIndex ? { ...l, executed: true, executedTransactionId: tx.id } : l) } : p) };
      }),
    };
  });
}
