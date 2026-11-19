import './recordSearch.css';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { StandardButton } from '../../components/standard';
import { Field, Select, TextInput } from '../../components/ui/Field';
import { useTablePagination } from '../../hooks/useTablePagination';
import { useAuthState } from '../../lib/firebase/useAuthState';
import { useEnsureSignedIn } from '../../lib/firebase/useEnsureSignedIn';
import { findSearchRecords } from './recordSearch';
import { useSearchRecords, type SearchWorkbook } from './useSearchRecords';

export function TopBarRecordSearch() {
  const { user } = useAuthState();
  return <QuickSearchForm key={user?.uid} owner={user?.uid} />;
}

function QuickSearchForm({ owner }: { owner?: string }) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  return <form className="topbar-record-search" role="search" aria-label="App records" onSubmit={event => {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;
    navigate('/search', { state: { query: keyword, owner } });
    setQuery('');
  }}>
    <TextInput type="search" aria-label="Search app records" placeholder="Search records…" maxLength={200}
      value={query} onChange={event => setQuery(event.target.value)} />
    <StandardButton type="submit" size="small">Search</StandardButton>
  </form>;
}

export function RecordSearchPage({ owner, workbookOwners }: { owner?: string; workbookOwners: Record<SearchWorkbook, string | undefined> }) {
  const location = useLocation();
  const ensureSignedIn = useEnsureSignedIn();
  if (!owner) return <div className="standard-page">
    <PageHeading back={null}><h1>Search records</h1></PageHeading>
    <StandardButton onClick={() => void ensureSignedIn('Sign in to search your records.')}>Sign in to search</StandardButton>
  </div>;

  const state = location.state;
  const query = state?.owner === owner && typeof state.query === 'string' ? state.query.slice(0, 200) : '';
  const available = new Set((Object.keys(workbookOwners) as SearchWorkbook[]).filter(key => workbookOwners[key] === owner));
  return <SearchResults key={owner + ':' + location.key} initialQuery={query} available={available} />;
}

function SearchResults({ initialQuery, available }: { initialQuery: string; available: ReadonlySet<SearchWorkbook> }) {
  const records = useSearchRecords(available);
  const [draft, setDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [module, setModule] = useState('');
  const [scopeId, setScopeId] = useState('');
  const modules = useMemo(() => [...new Set(records.map(row => row.module))].sort(), [records]);
  const selectedModule = modules.includes(module) ? module : '';
  const scopes = useMemo(() => [...new Map(records.filter(row => row.module === selectedModule && row.scopeId)
    .map(row => [row.scopeId, row.scope])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [records, selectedModule]);
  const selectedScope = scopes.some(([id]) => id === scopeId) ? scopeId : '';
  const matches = useMemo(() => findSearchRecords(records, query, selectedModule, selectedScope), [records, query, selectedModule, selectedScope]);
  const { rows, controls } = useTablePagination(matches);

  return <div className="standard-page stack-md">
    <PageHeading back={null}><h1>Search records</h1></PageHeading>
    <form className="row gap-sm" role="search" aria-label="Search results" onSubmit={event => {
      event.preventDefault();
      setQuery(draft.trim());
    }}>
      <Field label="Keyword"><TextInput type="search" value={draft} maxLength={200} onChange={event => setDraft(event.target.value)} /></Field>
      <StandardButton type="submit">Search</StandardButton>
      <Field label="Module"><Select value={selectedModule} onChange={event => {
        setModule(event.target.value);
        setScopeId('');
      }}>
        <option value="">All modules</option>
        {modules.map(name => <option key={name}>{name}</option>)}
      </Select></Field>
      {scopes.length > 0 && <Field label="Submodule"><Select value={selectedScope} onChange={event => setScopeId(event.target.value)}>
        <option value="">All submodules</option>
        {scopes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </Select></Field>}
    </form>
    <p role="status">{!available.size ? 'No synced account workbooks are available to search yet.' :
      !query ? 'Enter a keyword to find records.' : !matches.length ? 'No matching records.' : `${matches.length} matching records`}</p>
    {rows.length > 0 && <>
      {controls}
      <ul className="stack-sm">
        {rows.map(row => <li className="card stack-sm" key={row.key}>
          <Link to={row.url}>{row.title}</Link>
          <div className="text-muted">{[row.module, row.scope, row.kind, row.date].filter(Boolean).join(' · ')}</div>
          {row.detail && <p>{row.detail}</p>}
        </li>)}
      </ul>
    </>}
  </div>;
}
