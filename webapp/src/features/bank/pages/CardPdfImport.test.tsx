import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCreditCardWorkbookStore } from '../../../store/creditCardWorkbookStore';
import type { CreditCard } from '../../../types/creditCard';
import { CardPdfImport } from './CardPdfImport';

vi.mock('../../../lib/firebase/useAuthState', () => ({ getCurrentUser: () => ({ uid: 'fixture-owner' }) }));
vi.mock('../../../lib/firebase/useEnsureSignedIn', () => ({ useEnsureSignedIn: () => async () => true }));
vi.mock('../../../lib/bankStatementPdf', () => ({
  readBankStatementPdf: async () => [
    ['Date', 'Description', 'Amount'],
    ['2026-11-01', 'Existing', '-15'],
    ['2026-11-02', 'New purchase', '-20.25'],
    ['2026-11-03', 'Unclassified credit', '40'],
  ],
}));

afterEach(cleanup);

it('imports only explicitly classified rows, keeps existing records, and imports positive card magnitudes', async () => {
  const card = { id: 'fixture', name: 'Fixture card', currencyCode: 'QAR' } as CreditCard;
  const existing = { id: 'existing', cardId: card.id, date: '2026-11-01', kind: 'charge' as const, amount: 15, description: 'Existing' };
  useCreditCardWorkbookStore.getState().setWorkbook({ cards: [card], transactions: [existing] });
  const close = vi.fn();
  render(<CardPdfImport card={card} onClose={close} />);
  fireEvent.change(screen.getByLabelText('Credit card statement'), { target: { files: [new File([], 'statement.pdf')] } });

  const kind = await screen.findByRole('combobox', { name: 'Import type for row 2' });
  expect(screen.queryByRole('combobox', { name: 'Import type for row 1' })).toBeNull();
  expect((screen.getByRole('button', { name: 'Import selected (0)' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(kind, { target: { value: 'charge' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import selected (1)' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(useCreditCardWorkbookStore.getState().workbook.transactions).toMatchObject([
    existing,
    { cardId: card.id, date: '2026-11-02', kind: 'charge', amount: 20.25, source: 'statement-import' },
  ]);
});

it('lets the user map an unrecognized card amount column before classifying a TSV row', async () => {
  const card = { id: 'tsv-card', name: 'TSV card', currencyCode: 'QAR' } as CreditCard;
  useCreditCardWorkbookStore.getState().setWorkbook({ cards: [card], transactions: [] });
  const close = vi.fn();
  render(<CardPdfImport card={card} onClose={close} />);
  fireEvent.change(screen.getByLabelText('Credit card statement'), { target: {
    files: [new File(['Memo\tPosting Date\tCard total\nGroceries\t2026-11-26\t-33.70'], 'card.tsv')],
  } });
  const amount = await screen.findByRole('combobox', { name: 'Amount column' });
  expect(screen.queryByRole('combobox', { name: 'Import type for row 1' })).toBeNull();
  fireEvent.change(amount, { target: { value: 'Card total' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Import type for row 1' }), { target: { value: 'charge' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import selected (1)' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(useCreditCardWorkbookStore.getState().workbook.transactions).toMatchObject([
    { cardId: card.id, date: '2026-11-26', description: 'Groceries', amount: 33.70, kind: 'charge' },
  ]);
});
