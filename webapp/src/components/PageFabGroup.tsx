import { useLocation } from 'react-router-dom';
import { categoryForPath } from './CategoryNav';
import { allExtraActions, useFabActionsStore } from '../store/fabActionsStore';
import { FabPanel } from './ui/Fab';

/** Banking and stocks already have a single renderer; other pages share this one. */
export function PageFabGroup() {
  const category = categoryForPath(useLocation().pathname);
  const actions = useFabActionsStore(state => state.actionsByKey);
  return category === 'bank' || category === 'stocks' ? null : <FabPanel actions={allExtraActions(actions)} />;
}
