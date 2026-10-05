import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BatchEditGrid, type BatchColumn } from '../BatchEditGrid';

type Row = { id: string; description: string; amount: number; pending?: boolean; date?: string };
const rows: Row[] = [{ id: 'a', description: 'First', amount: 10 }, { id: 'b', description: 'Second', amount: 20 }];
const columns: BatchColumn<Row>[] = [{ key: 'description', label: 'Description' }, { key: 'amount', label: 'Amount', type: 'amount' }, { key: 'pending', label: 'Pending', type: 'boolean' }];
afterEach(cleanup);
function setup(extra = {}) {
  const save = vi.fn(), close = vi.fn();
  const props = { title: 'Edit payments', rows, columns, getRowId: (r: Row) => r.id, onSave: save, onClose: close, validateRow: (r: Row) => r.amount <= 0 ? { amount: 'Must be positive' } : {}, ...extra };
  return { ...render(<BatchEditGrid {...props} />), save, close, props };
}
describe('BatchEditGrid', () => {
  it('adds a formula row and deletes an existing row in one staged save', async () => {
    const { save } = setup({ createRow: () => ({ id: 'new', description: '', amount: 0 }) });
    fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
    fireEvent.change(screen.getByLabelText('Row 3, Description'), { target: { value: 'Added' } });
    fireEvent.change(screen.getByLabelText('Row 3, Amount'), { target: { value: '=4*5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete row 1' }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Save all changes'));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][1]).toEqual({ added: [{ id: 'new', description: 'Added', amount: 20 }], deleted: [rows[0]] });
  });
  it('reorders same-date rows and persists numeric sequence swaps', async () => {
    type Ordered = Row & { seq?: number };
    const originals: Ordered[] = [{ ...rows[0], date: '2026-10-01', seq: 1 }, { ...rows[1], date: '2026-10-01', seq: 2 }, { id: 'c', date: '2026-10-02', description: 'Third', amount: 30, seq: 3 }];
    const save = vi.fn();
    render(<BatchEditGrid<Ordered> title="Reorder" rows={originals} columns={[...columns as BatchColumn<Ordered>[], { key: 'seq', label: '#', type: 'number', editable: false }]} getRowId={row => row.id} getRowDate={row => row.date!} orderKey="seq" createRow={() => ({ id: 'new', date: '2026-10-01', description: '', amount: 0, seq: 4 })} onSave={save} onClose={() => {}} />);
    expect((screen.getByRole('button', { name: 'Move row 2 down' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Move row 1 down' }));
    expect((screen.getByLabelText('Row 1, Description') as HTMLInputElement).value).toBe('Second');
    fireEvent.click(screen.getByText('Save all changes'));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].find((change: { after: Ordered }) => change.after.id === 'a').after.seq).toBe(2);
  });
  it('stages multiple cells, preserves source rows, and commits once', async () => {
    const { save, close } = setup();
    fireEvent.change(screen.getByLabelText('Row 1, Amount'), { target: { value: '15.25' } });
    fireEvent.change(screen.getByLabelText('Row 2, Description'), { target: { value: 'Changed' } });
    expect(save).not.toHaveBeenCalled();
    expect(rows[0].amount).toBe(10);
    expect(screen.getByRole('status').textContent).toContain('2 changed rows · 2 changed cells');
    fireEvent.click(screen.getByText('Save all changes'));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toEqual([{ before: rows[0], after: { ...rows[0], amount: 15.25 } }, { before: rows[1], after: { ...rows[1], description: 'Changed' } }]);
  });
  it('blocks the entire save for invalid and blank numeric cells', () => {
    const { save } = setup();
    fireEvent.change(screen.getByLabelText('Row 1, Description'), { target: { value: 'Valid change' } });
    fireEvent.change(screen.getByLabelText('Row 2, Amount'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save all changes'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a finite number or valid formula.')).toBeTruthy();
    expect(screen.getByLabelText('Row 2, Amount').getAttribute('aria-invalid')).toBe('true');
  });
  it('requires explicit discard, supports escape and revert-to-clean', () => {
    const { close, save } = setup();
    const input = screen.getByLabelText('Row 1, Description');
    fireEvent.change(input, { target: { value: 'Draft' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Keep editing'));
    fireEvent.change(input, { target: { value: 'First' } });
    expect(screen.getByRole('status').textContent).toContain('No changes');
    fireEvent.change(input, { target: { value: 'Draft' } });
    fireEvent.click(screen.getByText('Cancel / Discard'));
    fireEvent.click(screen.getByText('Discard changes'));
    expect(close).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });
  it('keeps drafts on source refresh and failed save, and navigates vertically', async () => {
    const fail = vi.fn().mockRejectedValue(new Error('Conflict'));
    const { rerender, props, close } = setup({ onSave: fail });
    const input = screen.getByLabelText('Row 1, Description');
    fireEvent.change(input, { target: { value: 'Draft' } });
    rerender(<BatchEditGrid {...props} rows={[{ ...rows[0], description: 'Cloud update' }, rows[1]]} />);
    expect((input as HTMLInputElement).value).toBe('Draft');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Row 2, Description')));
    fireEvent.keyDown(document.activeElement!, { key: 'Enter', shiftKey: true });
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.click(screen.getByText('Save all changes'));
    await screen.findByText('Conflict');
    expect(close).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('Draft');
  });
  it('does not render editors for locked rows', () => {
    setup({ rowReadOnly: (row: Row) => row.id === 'a' ? 'Linked transfer' : undefined });
    expect(screen.queryByLabelText('Row 1, Amount')).toBeNull();
    expect(screen.getByText('Read-only').getAttribute('title')).toBe('Linked transfer');
    expect(screen.getByLabelText('Row 2, Amount')).toBeTruthy();
  });
  it('evaluates formulas on Save and highlights edited columns', async () => {
    const { save } = setup();
    fireEvent.change(screen.getByLabelText('Row 1, Amount'), { target: { value: '=5*986.5' } });
    expect(screen.getByText('= 4932.5')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Amount\s*Edited/ }).className).toContain('column-dirty');
    fireEvent.click(screen.getByText('Save all changes'));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0][0].after.amount).toBe(4932.5);
  });
  it('loads rows on demand and retains filtered-out drafts in the save', async () => {
    const source: Row[] = Array.from({ length: 120 }, (_, index) => ({ id: String(index), description: `Row ${index}`, amount: index + 1, date: index < 60 ? '2026-01-10' : '2026-02-10' }));
    const save = vi.fn();
    render(<BatchEditGrid title="Many rows" rows={source} columns={columns} getRowId={row => row.id} getRowDate={row => row.date ?? ''} onSave={save} onClose={() => {}} />);
    expect(screen.queryByLabelText('Row 51, Amount')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Load 50 more/ }));
    expect(screen.getByLabelText('Row 51, Amount')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Row 1, Amount'), { target: { value: '=2*3' } });
    fireEvent.change(screen.getByLabelText('Batch from date'), { target: { value: '2026-02-01' } });
    expect(screen.queryByLabelText('Row 1, Amount')).toBeNull();
    expect(screen.getByText(/1 changed rows outside this view/)).toBeTruthy();
    fireEvent.click(screen.getByText('Save all changes'));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0][0].after.amount).toBe(6);
  });
  it('reveals invalid drafts hidden by the date filter without saving', async () => {
    const save = vi.fn();
    render(<BatchEditGrid<Row> title="Dates" rows={[{ ...rows[0], date: '2026-01-10' }]} columns={columns} getRowId={row => row.id} getRowDate={row => row.date ?? ''} onSave={save} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Row 1, Amount'), { target: { value: '=1/0' } });
    fireEvent.change(screen.getByLabelText('Batch from date'), { target: { value: '2026-02-01' } });
    fireEvent.click(screen.getByText('Save all changes'));
    await waitFor(() => expect(screen.getByLabelText('Row 1, Amount').getAttribute('aria-invalid')).toBe('true'));
    expect(save).not.toHaveBeenCalled();
  });
});
