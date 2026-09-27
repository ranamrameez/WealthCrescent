import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CollapseIcon, ExpandIcon, ExportIcon } from './icons';
import { Tooltip } from './Tooltip';
import { IconButton } from './ui/IconButton';

export function AnalyticsChartCard({ title, tooltip, children, fileName, height = 'mid' }: { title: string; tooltip: string; children: ReactNode; fileName?: string; height?: 'sm' | 'mid' | 'lg' | 'xl' }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    const update = () => setFullScreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggleFullScreen = async () => {
    if (document.fullscreenElement === rootRef.current) await document.exitFullscreen();
    else await rootRef.current?.requestFullscreen();
  };
  const exportPng = () => {
    const canvas = rootRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${fileName ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  return <div ref={rootRef} className={`analytics-chart chart-height-${height}`}>
    <div className="analytics-chart-header">
      <Tooltip text={tooltip}><h4 className="clickable">{title}</h4></Tooltip>
      <div className="analytics-chart-actions">
        <IconButton label="Export PNG" icon={<ExportIcon size={14} />} align="right" onClick={exportPng} />
        <IconButton label={fullScreen ? 'Exit full screen' : 'Full screen'} icon={fullScreen ? <CollapseIcon size={14} /> : <ExpandIcon size={14} />} align="right" onClick={() => void toggleFullScreen()} />
      </div>
    </div>
    <div className="chart-canvas-wrap">{children}</div>
  </div>;
}

export function AnalyticsChartControls({ title }: { title: string }) {
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    const update = () => setFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const cardFor = (target: EventTarget | null) => (target as HTMLElement | null)?.closest<HTMLElement>('.analytics-chart');
  return <div className="analytics-chart-actions">
    <IconButton label="Export PNG" icon={<ExportIcon size={14} />} align="right" onClick={(event) => { const canvas = cardFor(event.currentTarget)?.querySelector('canvas'); if (!canvas) return; const link = document.createElement('a'); link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`; link.href = canvas.toDataURL('image/png'); link.click(); }} />
    <IconButton label={fullScreen ? 'Exit full screen' : 'Full screen'} icon={fullScreen ? <CollapseIcon size={14} /> : <ExpandIcon size={14} />} align="right" onClick={(event) => { const card = cardFor(event.currentTarget); if (document.fullscreenElement) void document.exitFullscreen(); else void card?.requestFullscreen(); }} />
  </div>;
}

export function AnalyticsChartEnhancer() {
  const [cards, setCards] = useState<HTMLElement[]>([]);
  useLayoutEffect(() => {
    const grid = document.querySelector('.analytics-grid');
    setCards(grid ? Array.from(grid.querySelectorAll<HTMLElement>(':scope > .analytics-chart')) : []);
  }, []);
  return <>{cards.map((card, index) => createPortal(<AnalyticsChartControls title={card.querySelector('h4')?.textContent ?? `chart-${index + 1}`} />, card, index))}</>;
}
