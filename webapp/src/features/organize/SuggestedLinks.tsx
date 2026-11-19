import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { PageHeading } from '../../components/PageHeading';
import { StandardButton } from '../../components/standard';
import { fmtMoney } from '../../lib/format';
import { useTablePagination } from '../../hooks/useTablePagination';
import { acceptSuggestedLink, canScanSuggestedLinks, getReviewedSubscriptionPayments, scanSuggestedLinks, subscribeSuggestedLinkSources, type SuggestedLink, type SuggestedLinkOwners } from '../../services/finance/suggestedLinksService';

interface Preferences { popup: boolean; rejected: string[] }
const defaultPreferences: Preferences = { popup: false, rejected: [] };
const storageKey = (owner: string) => 'wc:suggested-links:' + owner;
function loadPreferences(owner?: string): Preferences {
  if (!owner) return defaultPreferences;
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(owner)) ?? 'null');
    return { popup: value?.popup === true, rejected: Array.isArray(value?.rejected) ? value.rejected.filter((id: unknown) => typeof id === 'string') : [] };
  } catch {
    return defaultPreferences;
  }
}

interface Inbox {
  owner?: string;
  ready: boolean;
  rows: SuggestedLink[];
  autoPopup: boolean;
  scan: () => void;
  open: () => void;
  close: () => void;
  setAutoPopup: (enabled: boolean) => void;
  decide: (row: SuggestedLink, accept: boolean) => void;
  status: string;
  reviewed: ReturnType<typeof getReviewedSubscriptionPayments>;
}
const InboxContext = createContext<Inbox | null>(null);

export function SuggestedLinksProvider({ owner, owners, children }: { owner?: string; owners: SuggestedLinkOwners; children: ReactNode }) {
  const { cash, bank, cards, subscriptions, categories } = owners;
  const [prefs, setPrefs] = useState(() => loadPreferences(owner));
  const [rows, setRows] = useState<SuggestedLink[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const ready = !!owner && canScanSuggestedLinks(owner, owners);
  const scan = useCallback(() => {
    if (!owner) return [];
    return scanSuggestedLinks(owner, { cash, bank, cards, subscriptions, categories }).filter(row => !prefs.rejected.includes(row.id));
  }, [owner, cash, bank, cards, subscriptions, categories, prefs.rejected]);
  const updatePrefs = (next: Preferences) => {
    setPrefs(next);
    if (owner) {
      try { localStorage.setItem(storageKey(owner), JSON.stringify(next)); }
      catch { setStatus('Preferences could not be saved on this device.'); }
    }
  };
  useEffect(() => {
    const initial = scan();
    setRows(initial);
    let previous = new Set(initial.map(row => row.id));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = subscribeSuggestedLinkSources(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = scan();
        if (prefs.popup && next.some(row => !previous.has(row.id))) setOpen(true);
        previous = new Set(next.map(row => row.id));
        setRows(next);
      }, 350);
    });
    return () => { clearTimeout(timer); stop(); };
  }, [scan, prefs.popup]);
  const inbox: Inbox = {
    owner, ready, rows: ready ? rows : [], status,
    reviewed: ready && owner ? getReviewedSubscriptionPayments(owner, owners) : [],
    autoPopup: prefs.popup, open: () => setOpen(true), close: () => setOpen(false),
    setAutoPopup: popup => updatePrefs({ ...prefs, popup }),
    scan: () => {
      const next = scan();
      setRows(next);
      setStatus(next.length ? `${next.length} suggestions to review.` : 'No matching payments found.');
    },
    decide: (row, accept) => {
      if (!ready || row.owner !== owner) return;
      setStatus('');
      try {
        if (accept) {
          acceptSuggestedLink(row, owners);
          setRows(scan());
          setStatus('Linked the existing payment to the subscription.');
        } else {
          updatePrefs({ ...prefs, rejected: [...new Set([...prefs.rejected, row.id])] });
          setRows(current => current.filter(item => item.id !== row.id));
          setStatus('Suggestion rejected.');
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'The suggestion could not be saved.');
        setRows(scan());
      }
    },
  };
  return <InboxContext.Provider value={inbox}>
    {children}
    {open && owner && <Modal title="Suggested links" onClose={inbox.close} manageFocus widthClass="60"><InboxContent inbox={inbox} />
      <p><Link to="/organize/suggested-links" onClick={inbox.close}>Open full inbox</Link></p>
    </Modal>}
  </InboxContext.Provider>;
}

export function useReviewedSubscriptionPayments() {
  return useContext(InboxContext)?.reviewed ?? [];
}

export function SuggestedLinksActions() {
  const inbox = useContext(InboxContext);
  if (!inbox?.owner) return null;
  return <>
    <StandardButton size="small" tone="secondary" onClick={inbox.open}>Suggested links{inbox.rows.length ? ` (${inbox.rows.length})` : ''}</StandardButton>
    <StandardButton size="small" tone="secondary" disabled={!inbox.ready} onClick={() => { inbox.scan(); inbox.open(); }}>Scan now</StandardButton>
  </>;
}

export function SuggestedLinksPage() {
  const inbox = useContext(InboxContext);
  return <main className="standard-page stack-md"><PageHeading back={null}><h1>Suggested links</h1></PageHeading>
    {inbox?.owner ? <InboxContent inbox={inbox} /> : <p>Sign in to review suggestions for your payments.</p>}
  </main>;
}

function InboxContent({ inbox }: { inbox: Inbox }) {
  const { rows, controls } = useTablePagination(inbox.rows);
  return <div className="stack-md">
    <div className="row gap-sm">
      <StandardButton size="small" disabled={!inbox.ready} onClick={inbox.scan}>Scan now</StandardButton>
      <label><input type="checkbox" checked={inbox.autoPopup} onChange={event => inbox.setAutoPopup(event.target.checked)} /> Open a popup for new suggestions</label>
    </div>
    {inbox.status && <p role="status">{inbox.status}</p>}
    {!inbox.ready ? <p>Wait for your subscriptions and payment workbooks to sync.</p> : !inbox.rows.length && <p>No suggestions to review.</p>}
    {rows.length > 0 && controls}
    {rows.map(row => <article key={row.id} className="card stack-sm">
      <h4>{row.subscriptionName} · {row.occurrenceDate}</h4>
      <Link to={row.payment.url} onClick={inbox.close}>{row.payment.description || row.payment.sourceLabel}</Link>
      <p>{row.payment.sourceLabel} · {row.payment.date} · {fmtMoney(row.payment.amount, row.payment.currencyCode)}</p>
      <p>{row.reasons.join(' · ')}</p>
      <div className="row gap-sm">
        <StandardButton size="small" onClick={() => inbox.decide(row, true)}>Accept</StandardButton>
        <StandardButton size="small" tone="secondary" onClick={() => inbox.decide(row, false)}>Reject</StandardButton>
      </div>
    </article>)}
  </div>;
}
