import { CheckIcon } from '../icons';

export function YesNoChips({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="chip-tabs" style={{ flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
      {[true, false].map((option) => (
        <button
          key={String(option)}
          type="button"
          className={`chip${value === option ? ' active' : ''}`}
          style={{ flexShrink: 0 }}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {value === option && <CheckIcon size={11} />}
          {option ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );
}
