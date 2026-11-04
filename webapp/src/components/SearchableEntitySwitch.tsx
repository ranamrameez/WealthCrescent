import { StandardDropdown, type DropdownItem } from './ui/StandardDropdown';
export interface EntitySwitchOption extends DropdownItem { group?: string }

/** Compatibility adapter: all rich entity pickers share StandardDropdown. */
export function SearchableEntitySwitch({ label, value, options, onChange, isTypeable = true, onFavoriteToggle }: {
  label: string; value: string; options: EntitySwitchOption[]; onChange: (value: string) => void;
  isTypeable?: boolean; onFavoriteToggle?: (value: string) => void | Promise<void>;
}) {
  const titles = [...new Set(options.map(option => option.group ?? ''))];
  return <StandardDropdown label={label} value={value} onChange={onChange} isTypeable={isTypeable}
    onFavoriteToggle={onFavoriteToggle} sections={titles.map(title => ({title, items: options.filter(option => (option.group ?? '') === title)}))} />;
}
