import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TopBarControls, TopBarSelect, QuickEntitySwitch } from '../TopBarControls';
import { DateValue } from '../DateValue';
import { DateInput } from '../ui/Field';
import { useAppearanceStore } from '../../store/appearanceStore';
import { StandardCard } from '../StandardCard';
import { SummaryGroupCard } from '../SummaryGroupCard';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from '../TopBar';
import { usePageTopBarStore } from '../../store/pageTopBarStore';

afterEach(cleanup);
describe('Consistent navigation and presentation',()=>{
  it('omits the main-module switcher while preserving banking child dropdowns and accessible names',()=>{
    usePageTopBarStore.getState().setRightSlot(<TopBarControls><TopBarSelect label="Bank" className="account-switch-select" value="" options={[{value:'',label:'All banks'}]} /><QuickEntitySwitch label="Account" value="" options={[{value:'',label:'All accounts'}]} onChange={()=>{}} /></TopBarControls>);
    try {
      render(<MemoryRouter initialEntries={['/bank']}><TopBar /></MemoryRouter>);
      expect(screen.queryByRole('combobox',{name:'Module'})).toBeNull();
      expect(screen.getByRole('combobox',{name:'Bank'})).toBeVisible();
      expect(screen.getByRole('combobox',{name:'Account'})).toBeVisible();
      expect(screen.getAllByRole('combobox')).toHaveLength(2);
    } finally {
      act(()=>usePageTopBarStore.getState().setRightSlot(null));
    }
  });
  it('keeps parent and sibling navigation visible while filters open separately',()=>{
    const change=vi.fn();
    render(<TopBarControls><QuickEntitySwitch label="Fund" value="a" options={[{value:'',label:'All funds'},{value:'a',label:'Fund A'},{value:'b',label:'Fund B'}]} onChange={change} /><TopBarSelect label="Category" value="all" onChange={()=>{}} options={[{value:'all',label:'All categories'}]} /></TopBarControls>);
    expect(screen.getByRole('combobox',{name:'Fund'})).toBeVisible();
    expect(screen.queryByRole('combobox',{name:'Category'})).toBeNull();
    fireEvent.change(screen.getByRole('combobox',{name:'Fund'}),{target:{value:'b'}});
    expect(change).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByRole('button',{name:'Filters'}));
    expect(screen.getByRole('combobox',{name:'Category'})).toBeVisible();
    expect(screen.getByRole('combobox',{name:'Fund'}).closest('.modal-overlay')).toBeNull();
  });
  it('honors date preferences for display and entry while saving ISO dates',()=>{
    const prior=useAppearanceStore.getState().appearance.dateFormat;
    useAppearanceStore.getState().update({dateFormat:'MM/DD/YYYY'});
    const change=vi.fn();
    render(<><DateValue value="2026-11-01" /><DateInput aria-label="Date" value="2026-11-01" onChange={change} /></>);
    expect(screen.getByText('11/01/2026')).toBeTruthy();
    expect(screen.getByRole('textbox',{name:'Date'})).toHaveValue('11/01/2026');
    fireEvent.change(screen.getByRole('textbox',{name:'Date'}),{target:{value:'11/03/2026'}});
    fireEvent.blur(screen.getByRole('textbox',{name:'Date'}));
    expect(change).toHaveBeenCalledWith({target:{value:'2026-11-03'}});
    act(()=>useAppearanceStore.getState().update({dateFormat:'DD/MM/YYYY'}));
    expect(screen.getByText('01/11/2026')).toBeTruthy();
    act(()=>useAppearanceStore.getState().update({dateFormat:prior}));
  });
  it('preserves summary metric cards and flattens a redundant single-card wrapper',()=>{
    const {container}=render(<><StandardCard title="Account summary"><SummaryGroupCard title="Actual balance">100</SummaryGroupCard></StandardCard><StandardCard title="Wrapper"><StandardCard title="Advanced options">Existing controls</StandardCard></StandardCard></>);
    expect(container.querySelectorAll('.card')).toHaveLength(3);
    expect(screen.getByText('Existing controls')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:/Advanced options/}));
    expect(screen.queryByText('Existing controls')).toBeNull();
  });
});
