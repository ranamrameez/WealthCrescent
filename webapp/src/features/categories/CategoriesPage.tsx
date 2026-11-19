import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { useTablePagination } from '../../hooks/useTablePagination';
import { createEmptyCategoriesWorkbook } from '../../store/defaultCategoriesWorkbook';
import { useCategoryStore } from '../../store/categoryStore';
import { CategoriesSection } from '../account/pages/AccountPage';
import { categoryTransactions } from '../search/recordSearch';
import { useSearchRecords, type SearchWorkbook } from '../search/useSearchRecords';

const defaults = createEmptyCategoriesWorkbook().categories;

export function CategoriesPage({ owner, categoryOwner, workbookOwners }: {
  owner?: string;
  categoryOwner?: string;
  workbookOwners: Record<SearchWorkbook, string | undefined>;
}) {
  const { categoryId } = useParams();
  const canManage = !!owner && owner === categoryOwner;
  const categories = useCategoryStore(state => canManage ? state.workbook.categories : defaults);
  const available = new Set((Object.keys(workbookOwners) as SearchWorkbook[]).filter(key => !!owner && workbookOwners[key] === owner));
  const records = useSearchRecords(available);
  const category = categories.find(item => item.id === categoryId);
  const matches = category ? categoryTransactions(records, category.id) : [];
  const { rows, controls } = useTablePagination(matches);

  return <div className="standard-page stack-md">
    <PageHeading back={categoryId ? <Link to="/organize/categories">All categories</Link> : null}>
      <h1>{category?.name ?? 'Categories'}</h1>
    </PageHeading>
    {categoryId ? <>
      {!owner ? <p>Sign in to view category transactions.</p> :
        !category ? <p>Category unavailable.</p> :
          !matches.length ? <p>No transactions found in your synced workbooks.</p> :
            <>
              <div className="table-scroll"><table>
                <caption>{category.name} transactions</caption>
                <thead><tr><th>Date</th><th>Transaction</th><th>Module</th><th>Source</th></tr></thead>
                <tbody>{rows.map(record => <tr key={record.key}>
                  <td>{record.date ?? '—'}</td><td><Link to={record.url}>{record.title}</Link></td>
                  <td>{record.module}</td><td>{record.scope}</td>
                </tr>)}</tbody>
              </table></div>
              {controls}
            </>}
    </> : <>
      <div className="table-scroll"><table>
        <caption>Browse transactions by category</caption>
        <thead><tr><th>Category</th><th>Scope</th></tr></thead>
        <tbody>{[...categories].sort((a, b) => a.name.localeCompare(b.name)).map(item => <tr key={item.id}>
          <td><Link to={'/organize/categories/' + encodeURIComponent(item.id)}>{item.name}</Link></td>
          <td>{item.scope === 'app' ? 'App' : 'Custom'}</td>
        </tr>)}</tbody>
      </table></div>
      {canManage ? <CategoriesSection showGroups={false} /> : <p>{owner ? 'Category management is available after your category workbook syncs.' : 'Sign in to manage your categories.'}</p>}
    </>}
  </div>;
}
