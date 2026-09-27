import { useId, type InputHTMLAttributes } from 'react';
import { resolveNumericInput } from '../../lib/mathExpression';

/** Controlled raw text is intentional: parent forms can validate unfinished
 * formulas on Save instead of silently submitting the previous numeric value.
 * Uses the shared arithmetic parser, never JavaScript evaluation.
 */
export function FormulaInput({ value, onValueChange, showResult = true, ...props }: {
  value: string;
  onValueChange: (text: string) => void;
  showResult?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const resultId = useId();
  const isFormula = value.trim().startsWith('=') || /[*/()]/.test(value) || /\d\s*[+-]/.test(value);
  const result = isFormula ? resolveNumericInput(value) : null;
  const preview = showResult && isFormula;
  return <>
    <input {...props} type="text" inputMode={props.inputMode ?? 'text'} value={value}
      aria-describedby={[props['aria-describedby'], preview ? resultId : undefined].filter(Boolean).join(' ') || undefined}
      onChange={event => onValueChange(event.target.value)} />
    {preview && <small id={resultId} className="formula-input-result">{result === null ? 'Incomplete or invalid formula' : `= ${result}`}</small>}
  </>;
}
