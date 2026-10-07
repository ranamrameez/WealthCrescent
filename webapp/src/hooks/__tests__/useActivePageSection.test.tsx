import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useActivePageSection } from '../useActivePageSection';

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.useRealTimers(); });

it('tracks the active anchor on scrolling and layout changes', () => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  const sections = [{ key: 'alerts', id: 'alerts' }, { key: 'plan', id: 'plan' }, { key: 'calculator', id: 'calculator' }];
  const tops = [90, 300, 700];
  sections.forEach((section, index) => {
    const element = document.createElement('section');
    element.id = section.id;
    element.getBoundingClientRect = () => ({ top: tops[index] }) as DOMRect;
    document.body.appendChild(element);
  });
  const { result } = renderHook(() => useActivePageSection(sections));
  expect(result.current.activeSection).toBe('alerts');
  act(() => { tops[0] = -200; tops[1] = 100; window.dispatchEvent(new Event('scroll')); vi.runAllTimers(); });
  expect(result.current.activeSection).toBe('plan');
  act(() => { tops[1] = -300; tops[2] = 96; window.dispatchEvent(new Event('resize')); vi.runAllTimers(); });
  expect(result.current.activeSection).toBe('calculator');
  act(() => { tops[0] = 90; tops[1] = 300; tops[2] = 700; window.dispatchEvent(new Event('scroll')); vi.runAllTimers(); });
  expect(result.current.activeSection).toBe('alerts');
});
