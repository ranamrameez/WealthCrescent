import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StandardDropdown, type DropdownSection } from '../ui/StandardDropdown';
afterEach(cleanup);
const sections: DropdownSection[] = [
  { title: 'Accounts', items: [{ value: 'a', label: 'Current account', icon: <span data-testid="account-icon">A</span>, isFavorite: true }, { value: 'closed', label: 'Closed account', disabled: true }] },
  { title: 'Cash', items: [{ value: 'qar', label: 'QAR wallet', keywords: 'Qatar' }] },
];
describe('StandardDropdown', () => {
  it('accepts section titles, item icons and a separate favorite action', async () => {
    const change = vi.fn(), favorite = vi.fn();
    render(<StandardDropdown label="Finance" value="a" sections={sections} onChange={change} onFavoriteToggle={favorite} />);
    const input = screen.getByRole('combobox', { name: 'Finance' });
    expect(input).toHaveAttribute('readonly'); fireEvent.click(input);
    const grid = screen.getByRole('grid', { name: 'Finance options' });
    expect(within(grid).getByRole('rowgroup', { name: 'Accounts' })).toBeVisible();
    expect(within(grid).getByTestId('account-icon')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Unfavorite Current account' }));
    await waitFor(() => expect(favorite).toHaveBeenCalledWith('a'));
    expect(change).not.toHaveBeenCalled(); expect(grid).toBeVisible();
  });
  it('searches when isTypeable is enabled and chooses with Enter', () => {
    const change = vi.fn();
    render(<StandardDropdown label="Finance" value="a" sections={sections} onChange={change} isTypeable />);
    const input = screen.getByRole('combobox', { name: 'Finance' });
    fireEvent.focus(input); fireEvent.change(input, { target: { value: 'Qatar' } });
    expect(screen.getByRole('button', { name: 'QAR wallet' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Current account' })).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenCalledWith('qar'); expect(screen.queryByRole('grid')).toBeNull();
  });
  it('does not accept typed input when isTypeable is false and skips disabled rows', () => {
    const change = vi.fn();
    render(<StandardDropdown label="Finance" value="a" sections={sections} onChange={change} isTypeable={false} />);
    const input = screen.getByRole('combobox', { name: 'Finance' });
    fireEvent.change(input, { target: { value: 'replacement' } }); expect(input).toHaveValue('Current account');
    fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenCalledWith('qar');
  });
  it('keeps failed favorites reviewable and supports Escape and outside dismissal', async () => {
    render(<StandardDropdown label="Finance" value="a" sections={sections} onChange={vi.fn()} isTypeable onFavoriteToggle={async () => { throw new Error('Retry favorite'); }} />);
    const input = screen.getByRole('combobox', { name: 'Finance' }); fireEvent.focus(input);
    fireEvent.click(screen.getByRole('button', { name: 'Unfavorite Current account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Retry favorite');
    fireEvent.keyDown(input, { key: 'Escape' }); expect(screen.queryByRole('grid')).toBeNull();
    fireEvent.click(input); fireEvent.pointerDown(document.body); expect(screen.queryByRole('grid')).toBeNull();
  });
});
