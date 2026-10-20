import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

const UICtx = createContext(null);
export const useUI = () => useContext(UICtx);

/** Toasts, "data changed" refresh counter and the add/edit transaction sheet state. */
export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [formState, setFormState] = useState(null); // { tx } | null
  const idRef = useRef(0);

  const toast = useCallback((message, type = 'success') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const value = useMemo(
    () => ({
      toast,
      refreshKey,
      bump: () => setRefreshKey((k) => k + 1),
      formState,
      openForm: (tx = null) => setFormState({ tx }),
      closeForm: () => setFormState(null),
    }),
    [toast, refreshKey, formState],
  );

  return (
    <UICtx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md animate-rise items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              t.type === 'error' ? 'bg-red-600' : 'bg-slate-800'
            }`}
          >
            {t.type === 'error' ? <XCircle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-300" />}
            {t.message}
          </div>
        ))}
      </div>
    </UICtx.Provider>
  );
}
