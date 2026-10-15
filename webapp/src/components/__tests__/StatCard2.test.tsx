import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { StatCard2 } from '../StatCard2';
import { RecordDetailModal } from '../RecordDetailModal';
afterEach(cleanup);
it('uses independent key/value colors and explicit common classes', () => {
  render(<StatCard2 label="Exit fees" value="7.55 QAR" description="At current price" keyColor="red" valueColor="green" />);
  expect(screen.getByText('Exit fees')).toHaveClass('stat-card-2-key');
  expect(screen.getByText('Exit fees')).toHaveStyle({ color: 'rgb(255, 0, 0)' });
  expect(screen.getByText('7.55 QAR')).toHaveStyle({ color: 'rgb(0, 128, 0)' });
  expect(screen.getByText('At current price')).toHaveClass('stat-card-2-description');
});
it('uses the same compact card in details while preserving field colors', () => {
  render(<RecordDetailModal title="Details" fields={[{ label: 'Amount', value: '12.24', valueColor: 'red' }]} onClose={() => {}} />);
  expect(screen.getByText('Amount').closest('.stat-card-2')).toContainElement(screen.getByText('12.24'));
  expect(screen.getByText('12.24')).toHaveStyle({ color: 'rgb(255, 0, 0)' });
});
