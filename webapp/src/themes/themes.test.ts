/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import postcss from 'postcss';
import { COLOR_THEMES } from './catalog';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const themes = COLOR_THEMES.flatMap(group => group.options.map(([id]) => id));

it('loads exactly the selectable themes and shared tokens', () => {
  const imports: string[] = [];
  postcss.parse(read('./index.css')).walkAtRules('import', rule => { imports.push(rule.params); });
  expect(imports).toEqual(['base', ...themes].map(id => `'./${id}.css'`));
});

it.each(themes)('%s scopes every rule to its own theme', id => {
  postcss.parse(read(`./${id}.css`)).walkRules(rule => {
    for (const selector of rule.selectors) expect(selector).toContain(`[data-color="${id}"]`);
  });
});

it.each(themes.flatMap(id => ['light', 'dark'].map(mode => [id, mode])))('%s supplies a usable %s palette', (id, mode) => {
  document.documentElement.dataset.color = id;
  document.documentElement.dataset.theme = mode;
  const style = document.createElement('style');
  style.textContent = read('./base.css') + read(`./${id}.css`);
  document.head.append(style);
  try {
    const computed = getComputedStyle(document.documentElement);
    for (const token of ['--bg', '--panel', '--panel-2', '--border', '--text', '--muted', '--accent', '--accent-soft', '--on-accent', '--profit', '--loss']) {
      expect(computed.getPropertyValue(token).trim(), token).not.toBe('');
    }
    expect(computed.getPropertyValue('--text')).not.toBe(computed.getPropertyValue('--panel'));
    expect(computed.getPropertyValue('--accent')).not.toBe(computed.getPropertyValue('--on-accent'));
    expect(computed.colorScheme).toBe(mode);
    const classicAccents: Record<string, string> = { ocean: '#1f6fb2', forest: '#1f8a5c', violet: '#6d4fc9' };
    if (classicAccents[id]) expect(computed.getPropertyValue('--accent')).toBe(classicAccents[id]);
  } finally {
    style.remove();
    delete document.documentElement.dataset.color;
    delete document.documentElement.dataset.theme;
  }
});
