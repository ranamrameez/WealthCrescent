import { describe, expect, it } from 'vitest';
import { useCategoryGroupStore } from '../categoryGroupStore';

describe('category group workbook normalization', () => {
  it('repairs groups from older/partial persisted records before consumers render', () => {
    useCategoryGroupStore.getState().setWorkbook({
      groups: [{ id: 'legacy', name: 'Legacy group' } as never],
    });
    const group = useCategoryGroupStore.getState().workbook.groups[0];
    expect(group.categoryIds).toEqual([]);
    expect(group.serialNumber).toBe(1);
  });
});
