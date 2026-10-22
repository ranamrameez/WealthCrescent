import { useEffect, useState } from 'react';
import { fetchPsx, type PsxResponse } from '../../../lib/stockData/psxApi';

export function usePsxApi<T = unknown>(path: string) {
  const [state, setState] = useState<{ path: string; response?: PsxResponse<T>; error?: string }>({ path: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stopped = false;
    if (!path) return;
    const refresh = () => void fetchPsx<T>(path).then(response => { if (!stopped) setState({ path, response }); }, error => { if (!stopped) setState({ path, error: String(error.message || error) }); });
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [path, attempt]);
  return { response: state.path === path ? state.response : undefined, error: state.path === path ? state.error : undefined, retry: () => { setState({ path: '' }); setAttempt(value => value + 1); } };
}
