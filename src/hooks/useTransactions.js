import { useEffect, useState } from 'react';
import { fetchTransactions } from '../lib/api.js';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';

/** Loads the active farm's transactions for a date range; reloads when data changes. */
export function useTransactions(range) {
  const { ownerId, ready } = useFarm();
  const { refreshKey } = useUI();
  const [state, setState] = useState({ txs: [], loading: true, error: null });

  useEffect(() => {
    if (!ready) return undefined;
    let off = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchTransactions(ownerId, range)
      .then((txs) => !off && setState({ txs, loading: false, error: null }))
      .catch((e) => !off && setState({ txs: [], loading: false, error: e.message || 'שגיאה בטעינת הנתונים' }));
    return () => {
      off = true;
    };
  }, [ownerId, ready, range.from, range.to, refreshKey]);

  return state;
}
