import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppEntityFinder } from '../AppEntityFinder';
import { usePageTopBarStore } from '../../store/pageTopBarStore';
import { useUrlEntitySelection } from '../../hooks/useUrlEntitySelection';
const data = vi.hoisted(() => [{ title: 'EMI loans', items: [{value:'emi:car',id:'car',kind:'emi',label:'Car loan',url:'/emi-loans?loan=car',isFavorite:false,keywords:'EMI'}] }]);
vi.mock('../../services/navigationService', () => ({ subscribeNavigation: () => () => {}, getNavigationItems: () => data, findNavigationItem: () => data[0].items[0], toggleNavigationFavorite: vi.fn() }));
vi.mock('../../lib/firebase/useEnsureSignedIn', () => ({useEnsureSignedIn: () => async () => false}));
afterEach(() => { cleanup(); usePageTopBarStore.getState().setLoading(false); });
function Location() { const location = useLocation(); return <output>{location.pathname + location.search}</output>; }
it('navigates to an item detail from the shared finder without changing its records', () => {
  render(<MemoryRouter initialEntries={['/dashboard']}><AppEntityFinder/><Location/></MemoryRouter>);
  const input = screen.getByRole('combobox', {name:'Find an item'}); fireEvent.focus(input);
  fireEvent.change(input, {target:{value:'Car'}}); fireEvent.keyDown(input, {key:'Enter'});
  expect(screen.getByText('/emi-loans?loan=car')).toBeVisible();
});
it('does not leave the top bar loading when switching details on the same page', () => {
  render(<MemoryRouter initialEntries={['/emi-loans?loan=old']}><AppEntityFinder/><Location/></MemoryRouter>);
  fireEvent.focus(screen.getByRole('combobox', {name:'Find an item'}));
  fireEvent.keyDown(screen.getByRole('combobox', {name:'Find an item'}), {key:'Enter'});
  expect(screen.getByText('/emi-loans?loan=car')).toBeVisible();
  expect(usePageTopBarStore.getState().loading).toBe(false);
});
function FundSelection() {
  const [fund, selectFund] = useUrlEntitySelection('fund', [{id:'fund'}], 'broker');
  const [broker, selectBroker] = useUrlEntitySelection('broker', [{id:'broker'}], 'fund');
  return <><button onClick={() => selectFund({id:'fund'})}>Fund</button><button onClick={() => selectBroker({id:'broker'})}>Broker</button><output data-testid="selected">{fund?.id ?? broker?.id}</output><Location/></>;
}
it('restores deep-linked selections and clears mutually exclusive fund/broker details', () => {
  render(<MemoryRouter initialEntries={['/funds?broker=broker&period=all']}><FundSelection/></MemoryRouter>);
  expect(screen.getByTestId('selected')).toHaveTextContent('broker');
  fireEvent.click(screen.getByRole('button',{name:'Fund'}));
  expect(screen.getByTestId('selected')).toHaveTextContent('fund');
  expect(screen.getByText('/funds?period=all&fund=fund')).toBeVisible();
});
