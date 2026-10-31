import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../DateValue', () => ({
  DateValue: ({ value }: { value: string }) => <time dateTime={value}>{`formatted:${value}`}</time>,
}));

import { SummaryMetric } from '../SummaryGroupCard';

afterEach(cleanup);

it('formats ISO date values through DateValue', () => {
  render(<SummaryMetric label="Date" value="2026-10-31" />);
  expect(screen.getByText('formatted:2026-10-31')).toHaveAttribute('dateTime', '2026-10-31');
});

it('leaves ordinary strings as ordinary summary values', () => {
  render(<SummaryMetric label="Status" value="Pending" />);
  expect(screen.getByText('Pending')).toBeInTheDocument();
  expect(screen.queryByRole('time')).not.toBeInTheDocument();
});
