import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BalanceSummaryCards } from '../BalanceSummaryCards';

afterEach(cleanup);

function changeTone(start: number, current: number) {
  const { container } = render(<BalanceSummaryCards kind="creditCard" currency="QAR" summary={{
    start, current, inflow: 0, outflow: 0, pendingInflow: 0, pendingOutflow: 0, plannedInflow: 0, plannedOutflow: 0,
  }} />);
  const section = [...container.querySelectorAll('.current-position-section')]
    .find(item => item.querySelector('h4')?.textContent === 'Outstanding card debt');
  const change = [...(section?.querySelectorAll('.current-position-metric') ?? [])]
    .find(item => item.textContent?.includes('Change'));
  return change?.querySelector('strong');
}

it('treats increasing credit-card debt as negative and decreasing debt as positive', () => {
  const increase = changeTone(100, 120);
  expect(increase).toHaveClass('text-loss');
  cleanup();
  const decrease = changeTone(120, 100);
  expect(decrease).toHaveClass('text-profit');
});
