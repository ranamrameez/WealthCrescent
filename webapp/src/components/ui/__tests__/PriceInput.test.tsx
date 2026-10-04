import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PriceInput } from '../PriceInput';

describe('exchange price inputs', () => {
  it('formats QSE while preserving the editable value', () => {
    render(<PriceInput exchange="qse" aria-label="price" value="12.3456" onChange={vi.fn()} />);
    const input = screen.getByLabelText('price') as HTMLInputElement;
    expect(input.value).toBe('12.35');
    fireEvent.focus(input);
    expect(input.value).toBe('12.3456');
    fireEvent.blur(input);
    expect(input.value).toBe('12.35');
  });

  it('keeps PSX trailing zeros and supports inline default values', () => {
    render(<PriceInput exchange="psx" aria-label="inline" defaultValue={1.2} />);
    const input = screen.getByLabelText('inline') as HTMLInputElement;
    expect(input.value).toBe('1.20');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '2.345' } });
    fireEvent.blur(input);
    expect(input.value).toBe('2.35');
  });
});
