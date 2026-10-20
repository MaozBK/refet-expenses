import { useEffect } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
}

export function PageLoader({ label = 'טוען…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
      <Spinner /> {label}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, size = 'md', dismissable = true }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && dismissable && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, dismissable]);

  const sizes = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 animate-fade bg-slate-900/45 backdrop-blur-[2px]"
        onClick={dismissable ? onClose : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[94dvh] w-full animate-sheet flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${sizes[size]}`}
      >
        <header className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {dismissable && (
            <button type="button" className="icon-btn -me-2" onClick={onClose} aria-label="סגירה">
              <X className="h-5 w-5" />
            </button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-1">{children}</div>
        {footer && (
          <div className="rounded-b-3xl border-t border-slate-100 bg-white px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'אישור', danger = true, busy, onConfirm, onCancel, children }) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      dismissable={!busy}
      footer={
        <div className="flex gap-2">
          <button type="button" className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1`} onClick={onConfirm} disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} {confirmLabel}
          </button>
          <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={busy}>
            ביטול
          </button>
        </div>
      }
    >
      <div className="flex gap-3">
        {danger && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
        )}
        <div className="text-sm leading-6 text-slate-600">
          {message}
          {children}
        </div>
      </div>
    </Modal>
  );
}

export function Empty({ icon: Icon, title, hint, children }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      {Icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon className="h-7 w-7" />
        </span>
      )}
      <p className="font-semibold text-slate-800">{title}</p>
      {hint && <p className="max-w-xs text-sm text-slate-500">{hint}</p>}
      {children}
    </div>
  );
}

export function Segmented({ value, onChange, options, className = '' }) {
  return (
    <div className={`inline-flex rounded-xl bg-slate-200/70 p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[36px] flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition ${
            value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorBox({ children }) {
  if (!children) return null;
  return <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{children}</div>;
}
