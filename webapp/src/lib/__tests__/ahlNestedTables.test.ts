import { expect, it } from 'vitest';
import { parseAhlOrderHistory } from '../ahlOrderHistory';
import { readPsxBrokerTables } from '../psxCashStatement';

it('reads distinct order tables nested in a portal layout without flattening their rows', async () => {
  const orders = (ticker: string) => `<table>
    <thead><tr><th>Scrip</th><th>Quantity</th><th>Gross Rate</th><th>Type</th><th>Execution Date</th></tr></thead>
    <tbody><tr><td>${ticker}</td><td>10</td><td>12.50</td><td>Buy</td><td>13/11/2026</td></tr></tbody>
  </table>`;
  const html = `<table><tr><td><h2>Order history</h2>${orders('AAA')}${orders('BBB')}</td></tr></table>`;
  const { tables, dateSystem } = await readPsxBrokerTables(new File([html], 'orders.html.txt'));

  expect(parseAhlOrderHistory(tables, dateSystem).map(fill => fill.ticker)).toEqual(['AAA', 'BBB']);
});
