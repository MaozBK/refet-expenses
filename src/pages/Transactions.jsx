import { useEffect, useMemo, useState } from 'react';
import { Paperclip, Pencil, Receipt, Search, Trash2, X } from 'lucide-react';
import PeriodPicker from '../components/PeriodPicker.jsx';
import ReceiptViewer from '../components/ReceiptViewer.jsx';
import { ConfirmDialog, Empty, ErrorBox, PageLoader, Segmented } from '../components/ui.jsx';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { usePeriod } from '../hooks/usePeriod.js';
import { useTransactions } from '../hooks/useTransactions.js';
import { deleteTransactions } from '../lib/api.js';
import { NO_CATEGORY, NO_CATEGORY_COLOR, sumTotals } from '../lib/analytics.js';
import { formatDate, formatILS } from '../lib/format.js';

export default function Transactions() {
  const period = usePeriod('month');
  const { txs, loading, error } = useTransactions(period.range);
  const { canWrite } = useFarm();
  const { openForm, bump, toast } = useUI();

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null); // array of txs to delete
  const [deleting, setDeleting] = useState(false);
  const [viewer, setViewer] = useState(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txs.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (!q) return true;
      return [t.vendor, t.categories?.name, t.notes].some((s) => s && s.toLowerCase().includes(q));
    });
  }, [txs, query, typeFilter]);

  // drop selections that are no longer visible
  useEffect(() => {
    setSelected((cur) => {
      const ids = new Set(visible.map((t) => t.id));
      const next = new Set([...cur].filter((id) => ids.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [visible]);

  const totals = useMemo(() => sumTotals(visible), [visible]);
  const allSelected = visible.length > 0 && selected.size === visible.length;
  const toggle = (id) =>
    setSelected((cur) => {
      const n = new Set(cur);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteTransactions(confirm);
      toast(confirm.length === 1 ? 'התנועה נמחקה' : `${confirm.length} תנועות נמחקו`);
      setSelected(new Set());
      setConfirm(null);
      bump();
    } catch (e) {
      toast(e.message || 'המחיקה נכשלה', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-slate-900">תנועות</h1>
      <PeriodPicker period={period} />

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            className="input !ps-10 !pe-10"
            type="search"
            placeholder="חיפוש לפי ספק, קטגוריה או הערה"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="icon-btn absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2" onClick={() => setQuery('')} aria-label="ניקוי חיפוש">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Segmented
          value={typeFilter}
          onChange={setTypeFilter}
          className="w-full sm:w-auto"
          options={[
            { value: 'all', label: 'הכל' },
            { value: 'expense', label: 'הוצאות' },
            { value: 'income', label: 'הכנסות' },
          ]}
        />
      </div>

      <ErrorBox>{error}</ErrorBox>

      {loading ? (
        <PageLoader />
      ) : visible.length === 0 ? (
        <div className="card">
          <Empty
            icon={Receipt}
            title={txs.length ? 'לא נמצאו תנועות תואמות' : 'אין תנועות בתקופה זו'}
            hint={txs.length ? 'נסו לשנות את החיפוש או את הסינון.' : canWrite ? 'לחצו על כפתור ההוספה כדי לרשום את התנועה הראשונה.' : undefined}
          />
        </div>
      ) : (
        <div className="animate-rise space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-brand-50 px-2 py-2">
              <div className="text-[11px] text-brand-800">הכנסות</div>
              <div className="text-sm font-extrabold text-brand-800">{formatILS(totals.income)}</div>
            </div>
            <div className="rounded-xl bg-red-50 px-2 py-2">
              <div className="text-[11px] text-red-700">הוצאות</div>
              <div className="text-sm font-extrabold text-red-700">{formatILS(totals.expense)}</div>
            </div>
            <div className="rounded-xl bg-slate-100 px-2 py-2">
              <div className="text-[11px] text-slate-600">יתרה</div>
              <div className="text-sm font-extrabold text-slate-800">{formatILS(totals.net)}</div>
            </div>
          </div>

          {canWrite && (
            <label className="flex min-h-[44px] items-center gap-3 rounded-xl bg-white px-4 ring-1 ring-slate-200">
              <input
                type="checkbox"
                className="h-5 w-5 accent-brand-600"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((t) => t.id)))}
              />
              <span className="text-sm font-semibold text-slate-700">
                {selected.size ? `נבחרו ${selected.size} מתוך ${visible.length}` : `בחירת הכל (${visible.length})`}
              </span>
            </label>
          )}

          <ul className="space-y-2">
            {visible.map((t) => {
              const isSel = selected.has(t.id);
              const imgs = t.transaction_images || [];
              return (
                <li
                  key={t.id}
                  className={`flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 transition ${
                    isSel ? 'ring-2 ring-brand-500' : 'ring-slate-200'
                  }`}
                >
                  {canWrite && (
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-brand-600"
                      checked={isSel}
                      onChange={() => toggle(t.id)}
                      aria-label="בחירת תנועה"
                    />
                  )}
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-start"
                    onClick={() => (canWrite ? openForm(t) : imgs.length && setViewer(imgs))}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ background: t.categories?.color || NO_CATEGORY_COLOR }}
                    >
                      <Receipt className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900">{t.vendor || t.categories?.name || NO_CATEGORY}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {formatDate(t.tx_date)} · {t.categories?.name || NO_CATEGORY}
                        {t.notes ? ` · ${t.notes}` : ''}
                      </span>
                    </span>
                    <span className={`shrink-0 text-base font-extrabold ${t.type === 'income' ? 'text-brand-700' : 'text-red-600'}`} dir="ltr">
                      {t.type === 'income' ? '+' : '−'}
                      {formatILS(t.amount)}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center">
                    {imgs.length > 0 && (
                      <button type="button" className="icon-btn relative" onClick={() => setViewer(imgs)} aria-label="צפייה בקבלות">
                        <Paperclip className="h-5 w-5" />
                        <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                          {imgs.length}
                        </span>
                      </button>
                    )}
                    {canWrite && (
                      <>
                        <button type="button" className="icon-btn hidden sm:inline-flex" onClick={() => openForm(t)} aria-label="עריכה">
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button type="button" className="icon-btn hover:!bg-red-50 hover:!text-red-600" onClick={() => setConfirm([t])} aria-label="מחיקה">
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md animate-rise items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xl md:bottom-6 md:ms-[17rem]">
          <span className="text-sm font-semibold">נבחרו {selected.size}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost !text-white hover:!bg-white/10" onClick={() => setSelected(new Set())}>
              ביטול
            </button>
            <button type="button" className="btn-danger" onClick={() => setConfirm(visible.filter((t) => selected.has(t.id)))}>
              <Trash2 className="h-4 w-4" /> מחיקה
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.length === 1 ? 'מחיקת תנועה' : `מחיקת ${confirm.length} תנועות`}
          confirmLabel="מחיקה לצמיתות"
          busy={deleting}
          onCancel={() => setConfirm(null)}
          onConfirm={doDelete}
          message={
            confirm.length === 1
              ? `התנועה "${confirm[0].vendor || confirm[0].categories?.name || NO_CATEGORY}" בסך ${formatILS(confirm[0].amount)} תימחק יחד עם התמונות המצורפות. לא ניתן לשחזר.`
              : `${confirm.length} התנועות שנבחרו יימחקו יחד עם כל התמונות המצורפות אליהן. לא ניתן לשחזר.`
          }
        />
      )}
      {viewer && <ReceiptViewer images={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
