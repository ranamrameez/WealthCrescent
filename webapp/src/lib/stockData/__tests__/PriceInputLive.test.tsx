import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect,it } from 'vitest';
import { PriceInput } from '../../../components/ui/PriceInput';
afterEach(cleanup);
it('updates resting default prices but keeps focused drafts',()=>{
 const {rerender}=render(<PriceInput exchange="qse" aria-label="quote" defaultValue={10}/>);
 const input=screen.getByLabelText('quote') as HTMLInputElement;
 rerender(<PriceInput exchange="qse" aria-label="quote" defaultValue={12}/>);expect(Number(input.value)).toBe(12);
 fireEvent.focus(input);fireEvent.change(input,{target:{value:'11'}});
 rerender(<PriceInput exchange="qse" aria-label="quote" defaultValue={13}/>);expect(Number(input.value)).toBe(11);
 fireEvent.blur(input);expect(Number(input.value)).toBe(13);
});
