import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('module section ownership', () => {
  for (const file of [
    'personalLoans/pages/PersonalLoansPage.tsx',
    'emi/pages/EMIPage.tsx',
    'funds/pages/FundsPage.tsx',
    'subscriptions/pages/SubscriptionsPage.tsx',
  ]) {
    it(`${file} renders its sections only through the template`, () => {
      const path = resolve('src/features', file);
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      let templates = 0;
      function visit(node: ts.Node) {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'ModuleDetailTemplate') {
          templates++;
          function checkChild(child: ts.Node) {
            if (ts.isJsxSelfClosingElement(child) || ts.isJsxOpeningElement(child)) {
              expect(child.tagName.getText(source)).not.toBe('StandardPageSections');
            }
            ts.forEachChild(child, checkChild);
          }
          node.children.forEach(checkChild);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      expect(templates).toBeGreaterThan(0);
    });
  }
});
