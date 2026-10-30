import { create, type UseBoundStore, type StoreApi } from 'zustand';
import { toInstantMs } from '../lib/datetime';
import { backfillSeq, nextSeq, nextSeqForEntity, syncTransactionIndexes } from '../lib/seq';
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
  /** Versioned one-time migration marker for exchange-wide legacy rows into broker profiles. */
  brokerMigrationVersion?: number;
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
  const latest = [...history].sort((a, b) => (a.time || a.date).localeCompare(b.time || b.date)).pop()!;
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
    // One-time, non-destructive migration: the first version of broker
    // profiles treats the legacy top-level portfolio as the original account.
    // For PSX that original account is explicitly JS Zindagi, regardless of
    // which profile happened to be selected. Later writes carry version 1 and
    // are never reassigned.
    const shouldMigrateLegacy = (wb.brokerMigrationVersion ?? 0) < 1;
    const hasLegacyRecords = shouldMigrateLegacy && (
      wb.transactions.length + wb.transfers.length + wb.adjustments.length + wb.dividends.length + wb.tradePlans.length > 0
    );
    const zindigiProfile = profiles.find((p) => p.id === 'psx-js-zindigi' || /zindagi|zindigi/i.test(p.name));
    const migrationProfile = hasLegacyRecords ? (zindigiProfile ?? profiles.find((p) => p.id === wb.activeBrokerId && !p.archived && !p.deactivated) ?? profiles.find((p) => !p.archived && !p.deactivated)) : undefined;
    const activeProfile = migrationProfile
      ?? profiles.find((p) => p.id === wb.activeBrokerId && !p.archived && !p.deactivated)
      ?? profiles.find((p) => !p.archived && !p.deactivated);
    const activeBrokerId = activeProfile?.id ?? wb.activeBrokerId;
    const brokerProfiles = hasLegacyRecords && migrationProfile
      ? profiles.map((p) => p.id === migrationProfile.id ? { ...p, settings: wb.settings } : p)
      : profiles;
    const transactionsWithBroker = wb.transactions.map((t) => ({
      ...t,
      ...(shouldMigrateLegacy && migrationProfile?.id ? { brokerId: migrationProfile.id } : t.brokerId || !activeBrokerId ? {} : { brokerId: activeBrokerId }),
    }));
    const transactionsWithId = transactionsWithBroker.map((t) => (t.id ? t : { ...t, id: crypto.randomUUID() }));
    // Backfill a stable global order once for legacy records. Existing indexes are
    // preserved; only missing indexes are appended after the current maximum.
    const indexedTransactions = (() => {
      const maxIndex = Math.max(0, ...transactionsWithId.map(t => Number.isInteger(t.globalTransactionIndex) ? t.globalTransactionIndex! : Number.isInteger(t.transactionIndex) ? t.transactionIndex! : 0));
      let nextIndex = maxIndex;
      const legacy = [...transactionsWithId.filter(t => !Number.isInteger(t.globalTransactionIndex) && !Number.isInteger(t.transactionIndex))].sort((a, b) => {
        const at = a.timestamp ? Date.parse(a.timestamp) : Number.POSITIVE_INFINITY;
        const bt = b.timestamp ? Date.parse(b.timestamp) : Number.POSITIVE_INFINITY;
        if (at !== bt) return at - bt;
        const byDate = a.date.localeCompare(b.date);
        if (byDate) return byDate;
        return (a.time ?? '').localeCompare(b.time ?? '');
      });
      const byId = new Map(legacy.map(t => [t.id, { ...t, transactionIndex: ++nextIndex }]));
      return transactionsWithId.map(t => Number.isInteger(t.globalTransactionIndex) || Number.isInteger(t.transactionIndex) ? { ...t, globalTransactionIndex: t.globalTransactionIndex ?? t.transactionIndex, transactionIndex: t.globalTransactionIndex ?? t.transactionIndex } : byId.get(t.id)!);
    })();
    const syncedTransactions = syncTransactionIndexes(indexedTransactions);
    const transfersWithId = wb.transfers.map((t) => ({ ...t, ...(shouldMigrateLegacy && migrationProfile?.id ? { brokerId: migrationProfile.id } : t.brokerId || !activeBrokerId ? {} : { brokerId: activeBrokerId }), ...(t.id ? {} : { id: crypto.randomUUID() }) }));
    const adjustmentsWithId = wb.adjustments.map((a) => ({ ...a, ...(shouldMigrateLegacy && migrationProfile?.id ? { brokerId: migrationProfile.id } : a.brokerId || !activeBrokerId ? {} : { brokerId: activeBrokerId }), ...(a.id ? {} : { id: crypto.randomUUID() }) }));
    const dividendsWithId = wb.dividends.map((d) => ({ ...d, ...(shouldMigrateLegacy && migrationProfile?.id ? { brokerId: migrationProfile.id } : d.brokerId || !activeBrokerId ? {} : { brokerId: activeBrokerId }), ...(d.id ? {} : { id: crypto.randomUUID() }) }));
    const plansWithId = wb.tradePlans.map((p) => ({ ...p, ...(shouldMigrateLegacy && migrationProfile?.id ? { brokerId: migrationProfile.id } : p.brokerId || !activeBrokerId ? {} : { brokerId: activeBrokerId }), id: p.id || crypto.randomUUID(), legs: p.legs || [] }));
    const normalized = {
      ...wb,
      ...(profiles.length ? { brokerProfiles, activeBrokerId } : {}),
      ...(profiles.length ? { brokerMigrationVersion: 1 } : {}),
      transactions: syncedTransactions,
      transfers: backfillSeq(transfersWithId, chronologicalByInstant(transfersWithId)),
      adjustments: backfillSeq(adjustmentsWithId, chronologicalByInstant(adjustmentsWithId)),
      dividends: backfillSeq(dividendsWithId, chronologicalByInstant(dividendsWithId)),
      tradePlans: plansWithId,
    } as TWorkbook;
    // Route every record into the profile named by its brokerId. This is
    // deliberately done before exposing the active arrays: a workbook can
    // contain legacy unassigned rows alongside already-profiled rows, and
    // copying the whole top-level array into one profile would cross-contaminate
    // accounts. Exchange market data/watchlists are intentionally untouched.
    if (!normalized.brokerProfiles?.length) return normalized;
    const mergeById = <T extends { id?: string }>(existing: T[], incoming: T[]): T[] => {
      const merged = new Map<string, T>();
      existing.forEach((item, index) => merged.set(item.id ?? `legacy-existing-${index}`, item));
      incoming.forEach((item, index) => merged.set(item.id ?? `legacy-incoming-${index}`, item));
      return [...merged.values()];
    };
    const profilesWithData = normalized.brokerProfiles.map((profile) => {
      const existing = profile.data ?? { transactions: [], transfers: [], adjustments: [], dividends: [], tradePlans: [] };
      const transactions = mergeById(
        existing.transactions.map((item) => ({ ...item, brokerId: item.brokerId ?? profile.id })),
        normalized.transactions.filter((item) => item.brokerId === profile.id),
      );
      const transfers = mergeById(
        existing.transfers.map((item) => ({ ...item, brokerId: item.brokerId ?? profile.id })),
        normalized.transfers.filter((item) => item.brokerId === profile.id),
      );
      const adjustments = mergeById(
        existing.adjustments.map((item) => ({ ...item, brokerId: item.brokerId ?? profile.id })),
        normalized.adjustments.filter((item) => item.brokerId === profile.id),
      );
      const dividends = mergeById(
        existing.dividends.map((item) => ({ ...item, brokerId: item.brokerId ?? profile.id })),
        normalized.dividends.filter((item) => item.brokerId === profile.id),
      );
      const tradePlans = mergeById(
        existing.tradePlans.map((item) => ({ ...item, brokerId: item.brokerId ?? profile.id })),
        normalized.tradePlans.filter((item) => item.brokerId === profile.id),
      );
      return {
        ...profile,
        ...(profile.id === normalized.activeBrokerId ? { settings: normalized.settings } : {}),
        data: { transactions, transfers, adjustments, dividends, tradePlans },
      };
    });
    const active = profilesWithData.find((profile) => profile.id === normalized.activeBrokerId);
    if (!active) return { ...normalized, brokerProfiles: profilesWithData };
    return {
      ...normalized,
      transactions: active.data!.transactions,
      transfers: active.data!.transfers,
      adjustments: active.data!.adjustments,
      dividends: active.data!.dividends,
      tradePlans: active.data!.tradePlans,
      brokerProfiles: profilesWithData,
    };
  }

  function loadFromLocalStorage(): TWorkbook {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return normalize({ ...createEmpty(), ...parsed, brokerMigrationVersion: parsed.brokerMigrationVersion ?? 0 });
      }
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
        const perTickerIndex = Number.isInteger(tx.perTickerIndex) ? tx.perTickerIndex! : nextSeqForEntity(wb.transactions, (t) => t.ticker, tx.ticker);
        const timestamp = tx.timestamp ?? new Date().toISOString();
        const id = tx.id ?? crypto.randomUUID();
        const globalTransactionIndex = Number.isInteger(tx.globalTransactionIndex) ? tx.globalTransactionIndex! : Number.isInteger(tx.transactionIndex) ? tx.transactionIndex! : Math.max(0, ...wb.transactions.map(t => t.globalTransactionIndex ?? t.transactionIndex ?? 0)) + 1;
        const transactions = syncTransactionIndexes([...wb.transactions, { ...tx, ...(tx.brokerId || !wb.activeBrokerId ? {} : { brokerId: wb.activeBrokerId }), id, seq: perTickerIndex, perTickerIndex, globalTransactionIndex, transactionIndex: globalTransactionIndex, timestamp }]);
        return { ...wb, transactions };
      }),
      addTransactions: (txs) => mutate((wb) => {
        const now = new Date().toISOString();
        let nextGlobalTransactionIndex = Math.max(0, ...wb.transactions.map(t => t.globalTransactionIndex ?? t.transactionIndex ?? 0));
        const perTickerCounters = new Map<string, number>();
        for (const existing of wb.transactions) perTickerCounters.set(existing.ticker, Math.max(perTickerCounters.get(existing.ticker) ?? 0, existing.perTickerIndex ?? existing.seq ?? 0));
        const withIdAndTimestamp = txs.map((t) => {
          const globalTransactionIndex = Number.isInteger(t.globalTransactionIndex) ? t.globalTransactionIndex! : Number.isInteger(t.transactionIndex) ? t.transactionIndex! : ++nextGlobalTransactionIndex;
          const perTickerIndex = Number.isInteger(t.perTickerIndex) ? t.perTickerIndex! : Number.isInteger(t.seq) ? t.seq! : (perTickerCounters.get(t.ticker) ?? 0) + 1;
          perTickerCounters.set(t.ticker, Math.max(perTickerCounters.get(t.ticker) ?? 0, perTickerIndex));
          return { ...t, ...(t.brokerId || !wb.activeBrokerId ? {} : { brokerId: wb.activeBrokerId }), id: t.id ?? crypto.randomUUID(), globalTransactionIndex, perTickerIndex, transactionIndex: globalTransactionIndex, seq: perTickerIndex, timestamp: t.timestamp ?? now };
        });
        return { ...wb, transactions: syncTransactionIndexes([...wb.transactions, ...withIdAndTimestamp]) };
      }),
      updateTransaction: (index, patch) => mutate((wb) => ({ ...wb, transactions: syncTransactionIndexes(wb.transactions.map((t, i) => (i === index ? { ...t, ...patch } : t))) })),
      deleteTransaction: (index) => mutate((wb) => ({ ...wb, transactions: syncTransactionIndexes(wb.transactions.filter((_, i) => i !== index)) })),
      addTransfer: (t) => mutate((wb) => {
        const withId = t.id ? t : { ...t, id: crypto.randomUUID() };
        const brokerId = withId.brokerId ?? wb.activeBrokerId;
        const targetTransfers = wb.brokerProfiles?.find((profile) => profile.id === brokerId)?.data?.transfers ?? (brokerId === wb.activeBrokerId ? wb.transfers : []);
        const record = { ...withId, ...(brokerId ? { brokerId } : {}), seq: withId.seq !== undefined ? withId.seq : nextSeq(targetTransfers), timestamp: withId.timestamp ?? new Date().toISOString() };
        if (wb.brokerProfiles?.length && brokerId && brokerId !== wb.activeBrokerId) {
          return {
            ...wb,
            brokerProfiles: wb.brokerProfiles.map((profile) => profile.id === brokerId
              ? { ...profile, data: { ...profile.data, transactions: profile.data?.transactions ?? [], transfers: [...(profile.data?.transfers ?? []), record], adjustments: profile.data?.adjustments ?? [], dividends: profile.data?.dividends ?? [], tradePlans: profile.data?.tradePlans ?? [] } }
              : profile),
          };
        }
        return { ...wb, transfers: [...wb.transfers, record] };
      }),
      updateTransfer: (id, patch) => mutate((wb) => {
        if (wb.transfers.some((t) => t.id === id)) return { ...wb, transfers: wb.transfers.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
        return { ...wb, brokerProfiles: wb.brokerProfiles?.map((profile) => profile.data?.transfers.some((t) => t.id === id)
          ? { ...profile, data: { ...profile.data!, transfers: profile.data!.transfers.map((t) => t.id === id ? { ...t, ...patch } : t) } }
          : profile) };
      }),
      deleteTransfer: (id) => mutate((wb) => {
        if (wb.transfers.some((t) => t.id === id)) return { ...wb, transfers: wb.transfers.filter((t) => t.id !== id) };
        return { ...wb, brokerProfiles: wb.brokerProfiles?.map((profile) => profile.data?.transfers.some((t) => t.id === id)
          ? { ...profile, data: { ...profile.data!, transfers: profile.data!.transfers.filter((t) => t.id !== id) } }
          : profile) };
      }),
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
        const target = profiles?.find((p) => p.id === brokerId && !p.archived && !p.deactivated);
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
        const globalTransactionIndex = Math.max(0, ...wb.transactions.map(t => t.globalTransactionIndex ?? t.transactionIndex ?? 0)) + 1;
        const perTickerIndex = nextSeqForEntity(wb.transactions, (t) => t.ticker, leg.ticker);
        const tx: Transaction = { id: crypto.randomUUID(), brokerId: wb.activeBrokerId, globalTransactionIndex, perTickerIndex, transactionIndex: globalTransactionIndex, seq: perTickerIndex, timestamp: new Date().toISOString(), date: leg.date || new Date().toISOString().slice(0, 10), ticker: leg.ticker, action: leg.action, shares: leg.shares, price: leg.price, targetLotBuyId: leg.targetLotBuyId };
        return { ...wb, transactions: syncTransactionIndexes([...wb.transactions, tx]), tradePlans: wb.tradePlans.map((p) => p.id === planId ? { ...p, legs: p.legs.map((l, i) => i === legIndex ? { ...l, executed: true, executedTransactionId: tx.id } : l) } : p) };
      }),
    };
  });
}
