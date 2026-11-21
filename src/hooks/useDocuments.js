import { useEffect, useState } from 'react';
import { fetchDocuments } from '../lib/api.js';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';

/** All documents of the active farm (gap detection needs the full history). */
export function useDocuments() {
  const { ownerId, ready } = useFarm();
  const { refreshKey } = useUI();
  const [state, setState] = useState({ docs: [], loading: true, error: null });

  useEffect(() => {
    if (!ready) return undefined;
    let off = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchDocuments(ownerId)
      .then((docs) => !off && setState({ docs, loading: false, error: null }))
      .catch((e) => !off && setState({ docs: [], loading: false, error: e.message || 'שגיאה בטעינת המסמכים' }));
    return () => {
      off = true;
    };
  }, [ownerId, ready, refreshKey]);

  return state;
}
