import type { Transaction, Transfer, Adjustment, Dividend } from '../../types/workbook';
import type { BankWorkbook } from '../../types/bankWorkbook';
import type { CashEntry } from '../../types/cashWorkbook';
import type { RentalsWorkbook } from '../../types/rentalsWorkbook';
import type { CreditCardWorkbook } from '../../types/creditCard';
import type { PersonalLoansWorkbook } from '../../types/personalLoansWorkbook';
import type { EMIWorkbook } from '../../types/emiWorkbook';
import type { FundsWorkbook } from '../../types/fundsWorkbook';
import { transferCashAmount } from './transferBalance';

type ExchangeWorkbook = {
  settings: { currency: string };
  activeBrokerId?: string;
  transactions: Transaction[];
  transfers: Transfer[];
  adjustments: Adjustment[];
  dividends: Dividend[];
  brokerProfiles?: Array<{
    id: string; name: string; settings: { currency: string }; archived?: boolean; deactivated?: boolean;
    data?: { transactions: Transaction[]; transfers: Transfer[]; adjustments: Adjustment[]; dividends: Dividend[] };
  }>;
};

export interface RecentTransactionRow {
  id: string;
  date: string;
  time?: string;
  module: string;
  description: string;
  currency: string;
  amount: number;
  pending?: boolean;
  href: string;
  amountBasis?: string;
}

function tradeDescription(action: 'BUY' | 'SELL', shares: number, price: number, ticker: string): string {
  return `${action} ${shares.toLocaleString('en-US')} ${ticker} @ ${price}`;
}


export interface RecentActivityInputs { cash: CashEntry[]; bank: BankWorkbook; rentals: RentalsWorkbook; cards: CreditCardWorkbook; personalLoans: PersonalLoansWorkbook; emi: EMIWorkbook; funds: FundsWorkbook; qse: ExchangeWorkbook; psx: ExchangeWorkbook; }
/** Lifetime source records, without aggregating unlike modules into cash flow. */
export function recentTransactions(input: RecentActivityInputs): RecentTransactionRow[] {
  const { cash, bank, rentals, cards, personalLoans, emi, funds, qse, psx } = input;
    const rows: RecentTransactionRow[] = [];
    const add = (row: RecentTransactionRow) => {
      if (!row.date || !Number.isFinite(row.amount)) return;
      rows.push(row);
    };

    cash.forEach(entry => add({
      id: `cash:${entry.id}`, date: entry.date, time: entry.time, module: 'Cash',
      description: entry.title || entry.note || (entry.isDeposit ? 'Cash in' : 'Cash out'),
      currency: entry.currencyCode, amount: entry.isDeposit ? entry.amount : -entry.amount,
      pending: entry.isPending, href: '/cash',
    }));

    const accountById = new Map(bank.settings.accounts.filter(account => !account.migratedToCreditCardId).map(account => [account.id, account]));
    bank.transactions.forEach(tx => {
      const account = accountById.get(tx.accountId);
      if (!account) return;
      add({
        id: `bank:${tx.id}`, date: tx.date, time: tx.time, module: `Bank · ${account.name}`,
        description: tx.description, currency: account.currencyCode, amount: tx.amount,
        pending: tx.isPending, href: '/bank',
      });
    });

    const propertyById = new Map(rentals.settings.properties.map(property => [property.id, property]));
    rentals.entries.forEach(entry => {
      const property = propertyById.get(entry.propertyId);
      if (!property) return;
      add({
        id: `rentals:${entry.id}`, date: entry.date, time: entry.time, module: `Rentals · ${property.name}`,
        description: entry.title || entry.note || (entry.isDeposit ? 'Rental income' : 'Rental expense'),
        currency: property.currencyCode, amount: entry.isDeposit ? entry.amount : -entry.amount,
        pending: entry.isPending, href: '/rentals',
      });
    });

    const cardById = new Map(cards.cards.map(card => [card.id, card]));
    cards.transactions.forEach(tx => {
      const card = cardById.get(tx.cardId);
      if (!card) return;
      add({
        id: `card:${tx.id}`, date: tx.date, time: tx.time, module: `Credit card · ${card.name}`,
        description: tx.description || tx.kind, currency: card.currencyCode,
        amount: tx.kind === 'payment' ? tx.amount : -tx.amount, href: '/bank',
      });
    });

    const personalLoanById = new Map(personalLoans.loans.map(loan => [loan.id, loan]));
    personalLoans.loans.forEach(loan => add({
      id: `personal-loan-open:${loan.id}`, date: loan.date, module: 'Personal Loans',
      description: `Loan opened · ${loan.person}`, currency: loan.currencyCode,
      amount: loan.direction === 'owed_to_me' ? loan.principal : -loan.principal, href: '/personal-loans',
    }));
    personalLoans.repayments.forEach(repayment => {
      const loan = personalLoanById.get(repayment.loanId);
      if (!loan) return;
      add({
        id: `personal-loan-repayment:${repayment.id}`, date: repayment.date, time: repayment.time,
        module: `Personal Loans · ${loan.person}`, description: repayment.description || 'Loan repayment',
        currency: loan.currencyCode, amount: loan.direction === 'owed_to_me' ? -repayment.amount : repayment.amount,
        pending: repayment.isPending, href: '/personal-loans',
      });
    });

    const emiById = new Map(emi.entries.map(loan => [loan.id, loan]));
    emi.entries.forEach(loan => add({
      id: `emi-open:${loan.id}`, date: loan.startDate, module: 'EMI/Loans',
      description: `Loan opened · ${loan.name}`, currency: loan.currencyCode,
      amount: -loan.principal, href: '/emi-loans',
    }));
    emi.repayments.forEach(repayment => {
      const loan = emiById.get(repayment.loanId);
      if (!loan) return;
      add({
        id: `emi-repayment:${repayment.id}`, date: repayment.date, module: `EMI/Loans · ${loan.name}`,
        description: repayment.description || `Installment ${repayment.month}`, currency: loan.currencyCode,
        amount: -(repayment.amount + (repayment.fine ?? 0)), amountBasis: 'Installment and fine paid', href: '/emi-loans',
      });
    });

    const fundById = new Map(funds.funds.map(fund => [fund.id, fund]));
    funds.transactions.forEach((tx, index) => {
      const fund = fundById.get(tx.ticker);
      if (!fund) return;
      add({
        id: `fund-trade:${tx.id ?? index}`, date: tx.date, time: tx.time, module: `Funds · ${fund.name}`,
        description: tradeDescription(tx.action, tx.shares, tx.price, fund.code),
        currency: fund.currencyCode, amount: (tx.action === 'BUY' ? -1 : 1) * tx.shares * tx.price,
        pending: tx.isPending, amountBasis: 'Trade value before fees', href: '/funds',
      });
    });
    funds.transfers.forEach(tx => add({
      id: `fund-transfer:${tx.id}`, date: tx.date, time: tx.time, module: 'Funds · Cash',
      description: tx.description || (tx.type === 'DEPOSIT' ? 'Cash deposited' : 'Cash withdrawn'),
      currency: tx.currencyCode ?? funds.settings.legacyTransferCurrency ?? funds.settings.defaultCurrency,
      amount: transferCashAmount(tx), amountBasis: 'Cash movement including transfer fees', href: '/funds',
    }));
    funds.dividends.forEach((tx, index) => {
      const fund = fundById.get(tx.ticker);
      if (!fund) return;
      add({ id: `fund-dividend:${tx.id ?? index}`, date: tx.date, time: tx.time, module: `Funds · ${fund.name}`, description: 'Dividend', currency: fund.currencyCode, amount: tx.amount, href: '/funds' });
    });

    const addExchange = (exchange: 'QSE' | 'PSX', workbook: ExchangeWorkbook) => {
      const profiles = workbook.brokerProfiles ?? [];
      const sources = profiles.length
        ? profiles.map(profile => ({ id: profile.id, name: profile.name, currency: profile.id === workbook.activeBrokerId ? workbook.settings.currency : profile.settings.currency, data: profile.id === workbook.activeBrokerId ? { transactions: workbook.transactions, transfers: workbook.transfers, adjustments: workbook.adjustments, dividends: workbook.dividends } : profile.data }))
        : [{ id: 'legacy', name: 'Account', currency: workbook.settings.currency, data: { transactions: workbook.transactions, transfers: workbook.transfers, adjustments: workbook.adjustments, dividends: workbook.dividends } }];
      sources.forEach(profile => {
        const data = profile.data;
        if (!data) return;
        (data.transactions ?? []).forEach((tx, index) => add({
          id: `${exchange.toLowerCase()}-trade:${profile.id}:${tx.id ?? index}`, date: tx.date, time: tx.time,
          module: `${exchange} · ${profile.name}`, description: tradeDescription(tx.action, tx.shares, tx.price, tx.ticker),
          currency: profile.currency, amount: (tx.action === 'BUY' ? -1 : 1) * tx.shares * tx.price,
          pending: tx.isPending, amountBasis: 'Trade value before fees', href: exchange === 'QSE' ? '/qse' : '/psx',
        }));
        (data.transfers ?? []).forEach(tx => add({
          id: `${exchange.toLowerCase()}-transfer:${profile.id}:${tx.id}`, date: tx.date, time: tx.time,
          module: `${exchange} · ${profile.name}`, description: tx.description || (tx.type === 'DEPOSIT' ? 'Cash deposited' : 'Cash withdrawn'),
          currency: tx.currencyCode ?? profile.currency, amount: transferCashAmount(tx), amountBasis: 'Cash movement including transfer fees',
          href: exchange === 'QSE' ? '/qse' : '/psx',
        }));
        (data.adjustments ?? []).forEach((tx, index) => add({
          id: `${exchange.toLowerCase()}-adjustment:${profile.id}:${tx.id ?? index}`, date: tx.date, time: tx.time,
          module: `${exchange} · ${profile.name}`, description: tx.note || 'Account adjustment',
          currency: profile.currency, amount: tx.amount, href: exchange === 'QSE' ? '/qse' : '/psx',
        }));
        (data.dividends ?? []).forEach((tx, index) => add({
          id: `${exchange.toLowerCase()}-dividend:${profile.id}:${tx.id ?? index}`, date: tx.date, time: tx.time,
          module: `${exchange} · ${profile.name}`, description: `${tx.ticker} dividend`,
          currency: profile.currency, amount: tx.amount, href: exchange === 'QSE' ? '/qse' : '/psx',
        }));
      });
    };
    addExchange('QSE', qse);
    addExchange('PSX', psx);

    return rows.sort((a, b) => b.date.localeCompare(a.date)
      || (b.time ?? '12:00').localeCompare(a.time ?? '12:00')
      || b.id.localeCompare(a.id));
}
