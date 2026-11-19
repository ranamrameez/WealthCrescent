import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { ChartFilterBar } from '../ChartFilterBar';
import { TopBar } from '../TopBar';
import { useUrlChartFilters } from '../../hooks/useUrlChartFilters';
afterEach(cleanup);
function Analytics() {
  const [filter, setFilter] = useUrlChartFilters();
  const location = useLocation();
  return <><TopBar/><ChartFilterBar tickers={['ABC', 'XYZ']} filter={filter} onChange={setFilter}/><output data-testid="scope">{JSON.stringify(filter)}</output><output data-testid="url">{location.search}</output></>;
}
it('uses one shared period navigator and filter popup, retaining URL-backed chart scope', () => {
  render(<MemoryRouter initialEntries={['/analytics?period=custom&from=2026-09-01&to=2026-10-31&entities=ABC']}><Analytics/></MemoryRouter>);
  expect(screen.getAllByRole('group', { name: 'Reporting period' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: /^Filters/ })).toHaveLength(1);
  expect(screen.getByTestId('scope')).toHaveTextContent('"tickers":["ABC"]');
  fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
  expect(screen.getByTestId('scope')).toHaveTextContent('"fromDate":"2026-08-01"');
  expect(screen.getByTestId('scope')).toHaveTextContent('"toDate":"2026-09-30"');
  expect(screen.getByTestId('url')).toHaveTextContent('entities=ABC');
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
  fireEvent.click(screen.getByRole('button', { name: 'XYZ' }));
  expect(screen.getByTestId('scope')).toHaveTextContent('"tickers":["ABC","XYZ"]');
  expect(screen.getByTestId('scope')).toHaveTextContent('"fromMonth":"2026-08"');
});
