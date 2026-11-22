import spreadsheetReaderUrl from '@e965/xlsx/dist/xlsx.full.min.js?url';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../../components/PageHeading';
import { StandardCard } from '../../../components/StandardCard';
import { useAppearanceStore } from '../../../store/appearanceStore';

const upstream = 'https://ranamrameez.github.io/Translation-Helper/';
const keys = new Set([
  'tj.data', 'tj.prices', 'tj.fees', 'tj.log', 'tj.ptime', 'tj.dayb',
  'tj.calculator.qa', 'tj.calculator.ps', 'tj.calculator.fees.qa', 'tj.calculator.fees.ps',
]);
const keyPrefix = 'WealthCrescent.tradeJournal.';

function appearance(theme: string) {
  const style = getComputedStyle(document.documentElement);
  const themeVariables = {
    '--wc-bg': '--bg', '--wc-card': '--panel', '--wc-ink': '--text',
    '--wc-line': '--line', '--wc-accent': '--accent', '--wc-muted': '--muted', '--wc-selected': '--accent-soft',
  };
  return { theme, colors: Object.fromEntries(Object.entries(themeVariables).map(([key, value]) => [key, style.getPropertyValue(value).trim()])) };
}

export function TradingToolPage({ tool }: { tool: 'journal-qse' | 'journal-psx' | 'profiler' }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const port = useRef<MessagePort | null>(null);
  const journal = tool !== 'profiler';
  const title = journal ? 'Trade Journal' : 'PSX Profiler';
  const theme = useAppearanceStore(state => state.appearance.theme);
  const color = useAppearanceStore(state => state.appearance.colorTheme);
  useEffect(() => {
    port.current?.postMessage(appearance(theme));
  }, [theme, color]);
  useEffect(() => () => port.current?.close(), [tool]);

  function updateJournalInset() {
    const element = frame.current;
    const header = element?.closest('.main')?.querySelector('.page-topbar');
    if (!element || !header) return;
    const inset = Math.max(0, Math.ceil(header.getBoundingClientRect().bottom - element.getBoundingClientRect().top));
    port.current?.postMessage({ journalInset: inset });
  }

  useEffect(() => {
    if (!journal) return;
    const header = frame.current?.closest('.main')?.querySelector('.page-topbar');
    const resize = new ResizeObserver(updateJournalInset);
    if (header) resize.observe(header);
    window.addEventListener('scroll', updateJournalInset, true);
    window.addEventListener('resize', updateJournalInset);
    return () => {
      resize.disconnect();
      window.removeEventListener('scroll', updateJournalInset, true);
      window.removeEventListener('resize', updateJournalInset);
    };
  }, [journal]);


  function connect() {
    port.current?.close();
    const target = frame.current?.contentWindow;
    if (!target) return;
    const { port1, port2 } = new MessageChannel();
    port.current = port1;
    const values: Record<string, string> = {};
    let error = false;
    if (journal) {
      try {
        for (const key of keys) {
          const value = localStorage.getItem(keyPrefix + key);
          if (value !== null) values[key] = value;
        }
      } catch {
        error = true;
      }
      port1.onmessage = ({ data }) => {
        if (!data || typeof data.key !== 'string' || !keys.has(data.key) || typeof data.value !== 'string') return;
        try {
          localStorage.setItem(keyPrefix + data.key, data.value);
        } catch {
          port1.postMessage({ error: true });
        }
      };
    }
    // The sandbox intentionally gives the frame an opaque origin. The port
    // is transferred only to the local document loaded by this iframe.
    target.postMessage({
      type: 'wealth-crescent-trading-tool', values, error, ...appearance(theme),
      spreadsheetReader: journal ? new URL(spreadsheetReaderUrl, document.baseURI).href : undefined,
    }, '*', [port2]);
    if (journal) updateJournalInset();
  }

  const file = journal ? `trade-journal.html#${tool === 'journal-psx' ? 'psx-import' : 'qse-import'}` : 'psx-profiler.html';
  return <div className="standard-page">
    <PageHeading back={null}><h1 className="pagetitle">{title}</h1></PageHeading>
    <div className="row gap-sm">
      <a href={upstream + (journal ? 'Trade%20Journal.html' : 'psx-command-deck.html')} target="_blank" rel="noreferrer">Original {title}</a>
      {journal ? <Link to={tool === 'journal-psx' ? '/psx' : '/qse'}>Go to broker dashboard</Link>
        : <a href="https://ahcml.com/assets/uploads/Normal_AOF.pdf" target="_blank" rel="noreferrer">Al Habib brokerage schedule</a>}
    </div>
    <p className="text-muted">{journal
      ? 'Journal datasets stay in this browser and are separate from Wealth Crescent broker records. To bring in your original Journal data, export its JSON backup and restore it here.'
      : 'November 2026 watchlist and returns snapshot. The fee guide models Al Habib estimates.'}</p>
    <StandardCard title={title}>
      <iframe key={tool} ref={frame} onLoad={connect} title={title} sandbox="allow-scripts allow-downloads"
        src={`${import.meta.env.BASE_URL}trading-tools/${file}`}
        style={{ width: '100%', height: '72dvh', minHeight: '30rem', border: 0, display: 'block' }} />
    </StandardCard>
  </div>;
}
