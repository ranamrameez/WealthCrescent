import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TopBarChip } from '../store/pageTopBarStore';

interface PageSection { key: string; label: string; element: HTMLElement; registered?: TopBarChip }
const sectionSelector = '[data-page-section], .standard-section-anchor[id], .standard-card, .card, section[id]';

/** Include standalone page cards alongside explicitly registered sections, in DOM order. */
export function collectTopBarSections(root: HTMLElement, registered: TopBarChip[]): PageSection[] {
  const candidates = [...root.querySelectorAll<HTMLElement>(sectionSelector)];
  const result: PageSection[] = [];
  for (const element of candidates) {
    if (element.closest('.page-topbar, .modal-overlay, .stat-card, .fab-btn')) continue;
    if (result.some(parent => parent.element.contains(element))) continue;
    const key = element.dataset.pageSection || element.id.replace(/^trade-plan-/, '');
    const known = registered.find(chip => chip.key === key);
    const titleSelector = ':scope > .standard-card-header .standard-card-title, :scope > h2, :scope > h3, :scope > [role="button"]';
    const title = element.querySelector<HTMLElement>(titleSelector);
    const label = element.dataset.sectionLabel || known?.label || title?.textContent?.trim().replace(/^[\s\u25b8\u25b6]+/, '');
    if (!label) continue;
    const sectionKey = key || `page-card-${result.length}`;
    if (result.some(section => section.key === sectionKey)) continue;
    result.push({ key: sectionKey, label, element, registered: known });
  }
  return result;
}

export function useTopBarPageSections(bar: { current: HTMLDivElement | null }, registered: TopBarChip[], route: string): TopBarChip[] {
  const latest = useRef(registered);
  useLayoutEffect(() => { latest.current = registered; }, [registered]);
  const [sections, setSections] = useState<PageSection[]>([]);
  const [active, setActive] = useState('');
  const signature = JSON.stringify(registered.map(chip => [chip.key, chip.label]));
  useEffect(() => {
    const root = bar.current?.parentElement;
    if (!root) return;
    let frame = 0;
    let positionFrame = 0;
    let current: PageSection[] = [];
    const updatePosition = () => {
      const boundary = (bar.current?.getBoundingClientRect().bottom ?? 96) + 12;
      const reached = current.filter(section => section.element.getBoundingClientRect().top <= boundary);
      setActive((reached.at(-1) ?? current[0])?.key ?? '');
    };
    const refresh = () => {
      frame = 0;
      current = collectTopBarSections(root, latest.current);
      setSections(previous => previous.length === current.length && previous.every((item, index) => item.key === current[index].key && item.label === current[index].label && item.element === current[index].element) ? previous : current);
      updatePosition();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(refresh); };
    const schedulePosition = () => { if (!positionFrame) positionFrame = requestAnimationFrame(() => { positionFrame = 0; updatePosition(); }); };
    refresh();
    const observer = new MutationObserver(records => {
      const pageChanges = records.filter(record => !(record.target instanceof Element && record.target.closest('.page-topbar')));
      if (!pageChanges.length) return;
      const sectionsChanged = pageChanges.some(record =>
        (record.target instanceof Element && record.target.matches('.standard-card-title, h2, h3')) ||
        [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches(sectionSelector) || node.querySelector(sectionSelector))),
      );
      // Price fields, table cells and alerts can update frequently. Rescan only
      // when section structure changes; ordinary content updates need geometry.
      if (sectionsChanged) schedule();
      else schedulePosition();
    });
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener('scroll', schedulePosition, true);
    window.addEventListener('resize', schedulePosition);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); cancelAnimationFrame(positionFrame); window.removeEventListener('scroll', schedulePosition, true); window.removeEventListener('resize', schedulePosition); };
  }, [bar, route, signature]);
  if (!sections.length) return registered;
  return [
    ...registered.filter(chip => chip.key === '__all__' || chip.key === 'all').map(chip => ({ ...chip, active: false })),
    ...sections.map(section => ({ key: section.key, label: section.label, active: section.key === active, onClick: () => {
      section.element.style.scrollMarginTop = `${(bar.current?.getBoundingClientRect().height || 84) + 12}px`;
      const current = latest.current.find(chip => chip.key === section.key);
      if (current) current.onClick();
      else {
        const toggle = section.element.querySelector<HTMLElement>(':scope > .standard-card-header .standard-card-toggle[aria-expanded="false"], :scope > .standard-card > .standard-card-header .standard-card-toggle[aria-expanded="false"], :scope > [role="button"][aria-expanded="false"]');
        toggle?.click();
      }
      setActive(section.key);
      requestAnimationFrame(() => section.element.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } })),
  ];
}
