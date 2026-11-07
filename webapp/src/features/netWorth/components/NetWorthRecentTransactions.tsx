import { Link } from 'react-router-dom';
import { DateValue } from '../../../components/DateValue';
import { MoneyValue } from '../../../components/Card';
import { RecordRow } from '../../../components/RecordRow';
import { useTablePagination } from '../../../hooks/useTablePagination';

import { useRecentTransactions } from '../../../hooks/useRecentTransactions';

/** Render-only lifetime source ledger; financial signs and ownership are engine-owned. */
export function NetWorthRecentTransactions() {
  const allRows = useRecentTransactions();
  const pagination = useTablePagination(allRows, 25);
  return (
    <div className="stack-md">
      <div className="text-muted">Native source records; trade values exclude trading fees. Linked records can appear on both sides and are not a combined cash-flow total.</div>
      <div className="text-muted">Lifetime activity across all modules · newest first · {allRows.length.toLocaleString()} records</div>
      {allRows.length === 0 ? <div className="text-muted">No transactions recorded yet.</div> : (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Module</th><th>Description</th><th style={{ textAlign: 'right' }}>Recorded amount</th></tr></thead>
              <tbody>
                {pagination.rows.map(row => (
                  <RecordRow record={row} key={row.id}>
                    <td><DateValue value={row.date} /></td>
                    <td><Link to={row.href}>{row.module}</Link>{row.pending ? <span className="pill" style={{ marginLeft: 6 }}>Pending</span> : null}</td>
                    <td>{row.description}</td>
                    <td style={{ textAlign: 'right', color: row.amount >= 0 ? 'var(--profit)' : 'var(--loss)' }}><span title={row.amountBasis}><MoneyValue n={row.amount} currency={row.currency} /></span></td>
                  </RecordRow>
                ))}
              </tbody>
            </table>
          </div>
          {pagination.controls}
        </>
      )}
    </div>
  );
}
