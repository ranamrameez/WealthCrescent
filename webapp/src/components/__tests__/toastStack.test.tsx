import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Toast, toast, useToastStore } from '../Toast';
afterEach(()=>{cleanup();vi.useRealTimers();useToastStore.setState({message:null,messages:[]});});
it('stacks messages and expires each independently',()=>{
  vi.useFakeTimers();render(<Toast />);
  act(()=>toast('First notification'));
  act(()=>vi.advanceTimersByTime(1000));
  act(()=>toast('Second notification'));
  expect(screen.getAllByRole('status')).toHaveLength(2);
  act(()=>vi.advanceTimersByTime(1600));
  expect(screen.queryByText('First notification')).toBeNull();
  expect(screen.getByText('Second notification')).toBeTruthy();
  act(()=>vi.advanceTimersByTime(1000));
  expect(screen.queryByRole('status')).toBeNull();
});
