import { formatDate } from '../lib/format';
import { useAppearanceStore } from '../store/appearanceStore';

export function DateValue({ value }: { value: string | null | undefined }) {
  const format=useAppearanceStore(s=>s.appearance.dateFormat);
  return <>{formatDate(value,format)}</>;
}
