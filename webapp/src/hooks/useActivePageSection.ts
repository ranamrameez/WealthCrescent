import { useEffect, useState } from 'react';

/** Track the last section reached below the fixed topbar, including nested scrolling. */
export function useActivePageSection(sections: { key: string; id: string }[]) {
  const [activeSection, setActiveSection] = useState(sections[0]?.key ?? '');
  const signature = JSON.stringify(sections);
  useEffect(() => {
    const anchors = JSON.parse(signature) as { key: string; id: string }[];
    let frame = 0;
    const update = () => {
      frame = 0;
      const available = anchors.flatMap(anchor => {
        const element = document.getElementById(anchor.id);
        return element ? [{ ...anchor, top: element.getBoundingClientRect().top }] : [];
      });
      const reached = available.filter(anchor => anchor.top <= 112);
      setActiveSection((reached.at(-1) ?? available[0])?.key ?? '');
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    anchors.forEach(anchor => {
      const element = document.getElementById(anchor.id);
      if (element) observer?.observe(element);
    });
    return () => {
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [signature]);
  return { activeSection, setActiveSection };
}
