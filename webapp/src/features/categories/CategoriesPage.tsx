import { useState } from 'react';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { useTablePagination } from '../../hooks/useTablePagination';
import { createEmptyCategoriesWorkbook } from '../../store/defaultCategoriesWorkbook';
import { useCategoryStore } from '../../store/categoryStore';
import { CategoriesSection } from '../account/pages/AccountPage';
import { categoryTransactions } from '../search/recordSearch';
import { useSearchRecords, type SearchWorkbook } from '../search/useSearchRecords';

const defaults = createEmptyCategoriesWorkbook().categories;

export function CategoriesPage({ owner, categoryOwner, groupOwner, workbookOwners }: {
  owner?: string;
  categoryOwner?: string;
  groupOwner?: string;
  workbookOwners: Record<SearchWorkbook, string | undefined>;
}) {
  const { categoryId } = useParams();
  const canManage = !!owner && owner === categoryOwner;
  const categories = useCategoryStore(state => canManage ? state.workbook.categories : defaults);
  const available = new Set((Object.keys(workbookOwners) as SearchWorkbook[]).filter(key => !!owner && workbookOwners[key] === owner));
  const records = useSearchRecords(available);
  const category = categories.find(item => item.id === categoryId);
  const matches = category ? categoryTransactions(records, category.id) : [];


  return <div className="standard-page stack-md">
    <PageHeading back={categoryId ? <Link to="/organize/categories">All categories</Link> : null}>
      <h1>{category?.name ?? 'Categories'}</h1>
    </PageHeading>
    {categoryId ? <>
      {!owner ? <p>Sign in to view category transactions.</p> :
        !category ? <p>Category unavailable.</p> :
          !matches.length ? <p>No transactions found in your synced workbooks.</p> :
            <CategoryActivity key={category.id} matches={matches} />}
    </> : <>
      <div className="table-scroll"><table>
        <caption>Browse transactions by category</caption>
        <thead><tr><th>Category</th><th>Scope</th></tr></thead>
        <tbody>{[...categories].sort((a, b) => a.name.localeCompare(b.name)).map(item => <tr key={item.id}>
          <td><Link to={'/organize/categories/' + encodeURIComponent(item.id)}>{item.name}</Link></td>
          <td>{item.scope === 'app' ? 'App' : 'Custom'}</td>
        </tr>)}</tbody>
      </table></div>
      {canManage ? <CategoriesSection showGroups={owner === groupOwner} /> : <p>{owner ? 'Category management is available after your category workbook syncs.' : 'Sign in to manage your categories.'}</p>}
    </>}
  </div>;
}

const sourceKey = (record: ReturnType<typeof categoryTransactions>[number]) => JSON.stringify([record.module, record.scopeId]);

function CategoryActivity({ matches }: { matches: ReturnType<typeof categoryTransactions> }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [source, setSource] = useState('');
  const sources = new Map(matches.map(record => [sourceKey(record), [record.module, record.scope].filter(Boolean).join(' · ')]));
  const filtered = matches.filter(record => (!from || !!record.date && record.date >= from) &&
    (!to || !!record.date && record.date <= to) && (!source || sourceKey(record) === source));
  const currencies = new Map<string, typeof matches>();
  for (const record of filtered) {
    const currency = record.currencyCode || 'Currency unavailable';
    const group = currencies.get(currency) ?? [];
    group.push(record);
    currencies.set(currency, group);
  }

  return <>
    <div className="row gap-sm">
      <Field label="From"><TextInput type="date" value={from} onChange={event => setFrom(event.target.value)} /></Field>
      <Field label="To"><TextInput type="date" value={to} onChange={event => setTo(event.target.value)} /></Field>
      <Field label="Source"><Select value={source} onChange={event => setSource(event.target.value)}>
        <option value="">All sources</option>
        {[...sources].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </Select></Field>
    </div>
    {!filtered.length && <p role="status">No transactions match these filters.</p>}
    {[...currencies].sort(([a], [b]) => a.localeCompare(b)).map(([currency, records]) =>
      <CurrencyTransactions key={currency} currency={currency} records={records} />)}
  </>;
}

function CurrencyTransactions({ currency, records }: { currency: string; records: ReturnType<typeof categoryTransactions> }) {
  const { rows, controls } = useTablePagination(records);
  return <>
    <div className="table-scroll"><table>
      <caption>{currency} transactions</caption>
      <thead><tr><th>Date</th><th>Transaction</th><th>Module</th><th>Source</th></tr></thead>
      <tbody>{rows.map(record => <tr key={record.key}>
        <td>{record.date ?? '—'}</td><td><Link to={record.url}>{record.title}</Link></td>
        <td>{record.module}</td><td>{record.scope}</td>
      </tr>)}</tbody>
    </table></div>
    {controls}
  </>;
}
