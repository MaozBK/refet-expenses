import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Ban, CheckCircle2, Clock, FileText, Link2, Paperclip, Pencil, Plus, ScanLine, Search,
  Trash2, Users, X,
} from 'lucide-react';
import PeriodPicker from '../components/PeriodPicker.jsx';
import PhoneLinks from '../components/PhoneLinks.jsx';
import ReceiptViewer from '../components/ReceiptViewer.jsx';
import { ConfirmDialog, Empty, ErrorBox, PageLoader, Segmented } from '../components/ui.jsx';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { usePeriod } from '../hooks/usePeriod.js';
import { useDocuments } from '../hooks/useDocuments.js';
import { useSignedUrls } from '../hooks/useSignedUrls.js';
import { useTransactions } from '../hooks/useTransactions.js';
import { createVoidOrPendingDocs, deleteDocuments, setDocumentStatus, setNoReceiptNeeded } from '../lib/api.js';
import {
  DOC_TYPES, directionLabel, docDay, findGaps, formatDateTime, transactionsWithoutReceipt, typeLabel,
} from '../lib/documents.js';
import { formatDate, formatILS } from '../lib/format.js';
import { NO_CATEGORY } from '../lib/analytics.js';

const PAGE_SIZE = 30;

function Stat({ icon: Icon, label, value, tone, onClick }) {
  const tones = {
    green: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <button type="button" onClick={onClick} className="card flex items-center gap-3 !p-3 text-start transition hover:ring-brand-300">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-extrabold leading-tight text-slate-900">{value}</span>
        <span className="block truncate text-xs text-slate-500">{label}</span>
      </span>
    </button>
  );
}

function DocRow({ d, thumbUrl, selected, onToggle, canWrite, onView, onEdit, onDelete }) {
  const imgs = d.transaction_images || [];
  const pending = d.status === 'pending';
  const void_ = d.status === 'void';
  return (
    <li className={`flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 transition ${selected ? 'ring-2 ring-brand-500' : 'ring-slate-200'} ${void_ ? 'opacity-60' : ''}`}>
      {canWrite && <input type="checkbox" className="h-5 w-5 shrink-0 accent-brand-600" checked={selected} onChange={onToggle} aria-label="בחירת מסמך" />}
      <button
        type="button"
        onClick={() => (imgs.length ? onView(d) : onEdit(d))}
        className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200"
        aria-label={imgs.length ? 'צפייה במסמך' : 'עריכה'}
      >
        {imgs.length ? (
          thumbUrl ? <img src={thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Paperclip className="h-5 w-5 text-slate-300" />
        ) : (
          <FileText className="h-6 w-6 text-slate-300" />
        )}
        {imgs.length > 1 && <span className="absolute bottom-0.5 end-0.5 rounded bg-slate-900/70 px-1 text-[10px] font-bold text-white">{imgs.length}</span>}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-slate-900">{typeLabel(d.doc_type)}{d.doc_number ? ` ${d.doc_number}` : ''}</span>
          <span className="chip bg-slate-100 text-slate-600">{directionLabel(d.direction)}</span>
          {pending && <span className="chip bg-amber-100 text-amber-800">ממתין</span>}
          {void_ && <span className="chip bg-slate-200 text-slate-600">לא רלוונטי</span>}
          {d.transaction_id && <Link2 className="h-3.5 w-3.5 text-slate-400" aria-label="מקושר לתנועה" />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-600">
          {d.contacts?.name ? <span className="font-medium">{d.contacts.name}</span> : <span className="text-slate-400">ללא איש קשר</span>}
          {d.categories?.name && <span className="inline-flex items-center gap-1">· <span className="h-2 w-2 rounded-full" style={{ background: d.categories.color }} />{d.categories.name}</span>}
          {d.doc_date && <span>· {formatDate(d.doc_date)}</span>}
          {d.amount != null && <span className="font-semibold text-slate-800">· {formatILS(d.amount)}</span>}
        </div>
        <div className="text-xs text-slate-400">הועלה {formatDateTime(d.created_at)}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
        <PhoneLinks phone={d.contacts?.phone} email={d.contacts?.email} />
        {canWrite && (
          <span className="flex">
            <button type="button" className="icon-btn" onClick={() => onEdit(d)} aria-label="עריכה"><Pencil className="h-4 w-4" /></button>
            <button type="button" className="icon-btn hover:!bg-red-50 hover:!text-red-600" onClick={() => onDelete(d)} aria-label="מחיקה"><Trash2 className="h-4 w-4" /></button>
          </span>
        )}
      </div>
    </li>
  );
}

export default function Documents() {
  const [params, setParams] = useSearchParams();
  const period = usePeriod('month');
  const { docs, loading, error } = useDocuments();
  const { txs } = useTransactions(period.range);
  const { ownerId, canWrite, contacts, categories } = useFarm();
  const { openDocForm, openForm, bump, toast } = useUI();

  const [tab, setTab] = useState('docs'); // docs | missing
  const [basis, setBasis] = useState('doc'); // doc | upload
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dirFilter, setDirFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [contactFilter, setContactFilter] = useState(params.get('contact') || '');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [noRcptLimit, setNoRcptLimit] = useState(10);

  useEffect(() => setLimit(PAGE_SIZE), [query, typeFilter, dirFilter, statusFilter, contactFilter, basis, period.range.from, period.range.to]);

  const inRange = (day) => (!period.range.from || day >= period.range.from) && (!period.range.to || day <= period.range.to);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs
      .filter((d) => {
        if (statusFilter === 'active' && d.status === 'void') return false;
        if (statusFilter !== 'active' && statusFilter !== 'all' && d.status !== statusFilter) return false;
        if (typeFilter !== 'all' && d.doc_type !== typeFilter) return false;
        if (dirFilter !== 'all' && d.direction !== dirFilter) return false;
        if (contactFilter && d.contact_id !== contactFilter) return false;
        if (categoryFilter && d.category_id !== categoryFilter) return false;
        if (!inRange(basis === 'upload' ? d.created_at.slice(0, 10) : docDay(d))) return false;
        if (!q) return true;
        return [d.doc_number, d.contacts?.name, d.notes].some((s) => s && String(s).toLowerCase().includes(q));
      })
      .sort((a, b) => (basis === 'upload' ? b.created_at.localeCompare(a.created_at) : docDay(b).localeCompare(docDay(a)) || b.created_at.localeCompare(a.created_at)));
  }, [docs, query, typeFilter, dirFilter, statusFilter, contactFilter, categoryFilter, basis, period.range.from, period.range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = visible.slice(0, limit);
  const thumbPaths = shown.map((d) => d.transaction_images?.[0]).filter(Boolean).map((i) => i.thumb_path || i.path);
  const urls = useSignedUrls(thumbPaths);

  useEffect(() => {
    setSelected((cur) => {
      const ids = new Set(visible.map((d) => d.id));
      const next = new Set([...cur].filter((id) => ids.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [visible]);

  // ---- missing-document tracking ----
  const pendingDocs = useMemo(() => docs.filter((d) => d.status === 'pending'), [docs]);
  const gaps = useMemo(() => findGaps(docs), [docs]);
  const gapCount = gaps.reduce((n, g) => n + g.missing.length, 0);
  const noReceipt = useMemo(() => transactionsWithoutReceipt(txs, docs), [txs, docs]);
  const receivedInPeriod = visible.filter((d) => d.status === 'received').length;

  const toggle = (id) => setSelected((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = visible.length > 0 && selected.size === visible.length;

  const act = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast(okMsg);
      bump();
    } catch (e) {
      toast(e.message || 'הפעולה נכשלה', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = () => act(async () => { await deleteDocuments(confirm); setSelected(new Set()); setConfirm(null); }, `${confirm.length} מסמכים נמחקו`);
  const openView = (d) => setViewer({ images: d.transaction_images, title: `${typeLabel(d.doc_type)}${d.doc_number ? ` ${d.doc_number}` : ''}`, subtitle: [d.contacts?.name, d.doc_date && formatDate(d.doc_date)].filter(Boolean).join(' · ') });

  const setContact = (v) => {
    setContactFilter(v);
    const next = new URLSearchParams(params);
    v ? next.set('contact', v) : next.delete('contact');
    setParams(next, { replace: true });
  };

  const missingTotal = pendingDocs.length + gapCount + noReceipt.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-slate-900">מסמכים ותעודות</h1>
        <div className="flex items-center gap-2">
          <Link to="/contacts" className="btn-secondary !min-h-[40px]"><Users className="h-4 w-4" /> אנשי קשר</Link>
          {canWrite && (
            <button type="button" className="btn-primary !min-h-[40px]" onClick={() => openDocForm()}>
              <Plus className="h-4 w-4" /> מסמך חדש
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={CheckCircle2} tone="green" label="התקבלו (בתקופה)" value={receivedInPeriod} onClick={() => { setTab('docs'); setStatusFilter('received'); }} />
        <Stat icon={Clock} tone="amber" label="ממתינים לקבלה" value={pendingDocs.length} onClick={() => setTab('missing')} />
        <Stat icon={AlertTriangle} tone={gapCount ? 'red' : 'slate'} label="פערים במספור" value={gapCount} onClick={() => setTab('missing')} />
        <Stat icon={Paperclip} tone={noReceipt.length ? 'red' : 'slate'} label="תנועות ללא קבלה" value={noReceipt.length} onClick={() => setTab('missing')} />
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        className="w-full sm:w-auto"
        options={[{ value: 'docs', label: `כל המסמכים` }, { value: 'missing', label: `מה חסר לי${missingTotal ? ` (${missingTotal})` : ''}` }]}
      />

      <PeriodPicker period={period} />
      <ErrorBox>{error}</ErrorBox>

      {loading ? (
        <PageLoader />
      ) : tab === 'docs' ? (
        <div className="space-y-3 animate-rise">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input className="input !ps-10 !pe-10" type="search" placeholder="חיפוש לפי מספר, איש קשר או הערה" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <button type="button" className="icon-btn absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2" onClick={() => setQuery('')} aria-label="ניקוי"><X className="h-4 w-4" /></button>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="סוג מסמך">
              <option value="all">כל סוגי המסמכים</option>
              {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className="input" value={contactFilter} onChange={(e) => setContact(e.target.value)} aria-label="איש קשר">
              <option value="">כל אנשי הקשר</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="input sm:col-span-2" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="קטגוריה">
              <option value="">כל הקטגוריות</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.group_name ? `${c.group_name} · ` : ''}{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented value={dirFilter} onChange={setDirFilter} options={[{ value: 'all', label: 'הכל' }, { value: 'incoming', label: 'שקיבלתי' }, { value: 'outgoing', label: 'שהנפקתי' }]} />
            <Segmented value={statusFilter} onChange={setStatusFilter} options={[{ value: 'active', label: 'פעילים' }, { value: 'received', label: 'התקבלו' }, { value: 'pending', label: 'ממתינים' }, { value: 'void', label: 'בוטלו' }]} />
            <Segmented value={basis} onChange={setBasis} options={[{ value: 'doc', label: 'לפי תאריך המסמך' }, { value: 'upload', label: 'לפי תאריך העלאה' }]} />
          </div>

          {visible.length === 0 ? (
            <div className="card">
              <Empty icon={FileText} title={docs.length ? 'לא נמצאו מסמכים תואמים' : 'עדיין אין מסמכים'} hint={docs.length ? 'נסו לשנות את הסינון או את התקופה.' : 'הוסיפו תעודת משלוח או קבלה: מספר, תאריך, סכום, קטגוריה ותמונה.'}>
                {canWrite && !docs.length && <button type="button" className="btn-primary mt-2" onClick={() => openDocForm()}><Plus className="h-4 w-4" /> הוספת מסמך ראשון</button>}
              </Empty>
            </div>
          ) : (
            <>
              {canWrite && (
                <label className="flex min-h-[44px] items-center gap-3 rounded-xl bg-white px-4 ring-1 ring-slate-200">
                  <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((d) => d.id)))} />
                  <span className="text-sm font-semibold text-slate-700">{selected.size ? `נבחרו ${selected.size} מתוך ${visible.length}` : `בחירת הכל (${visible.length})`}</span>
                </label>
              )}
              <ul className="space-y-2">
                {shown.map((d) => (
                  <DocRow
                    key={d.id}
                    d={d}
                    thumbUrl={urls[d.transaction_images?.[0]?.thumb_path || d.transaction_images?.[0]?.path]}
                    selected={selected.has(d.id)}
                    onToggle={() => toggle(d.id)}
                    canWrite={canWrite}
                    onView={openView}
                    onEdit={(x) => openDocForm(x)}
                    onDelete={(x) => setConfirm([x])}
                  />
                ))}
              </ul>
              {visible.length > shown.length && (
                <button type="button" className="btn-secondary w-full" onClick={() => setLimit((l) => l + PAGE_SIZE)}>הצגת עוד ({visible.length - shown.length})</button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5 animate-rise">
          {missingTotal === 0 && (
            <div className="card"><Empty icon={CheckCircle2} title="הכול מסודר" hint="אין מסמכים חסרים, פערים במספור או תנועות ללא קבלה בתקופה שנבחרה." /></div>
          )}

          {/* pending */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">מסמכים שממתינים לקבלה ({pendingDocs.length})</h2>
              {canWrite && <button type="button" className="btn-secondary !min-h-[36px] !px-3" onClick={() => openDocForm(null, { status: 'pending' })}><Plus className="h-4 w-4" /> מסמך צפוי</button>}
            </div>
            {pendingDocs.length === 0 ? (
              <p className="text-sm text-slate-500">אין מסמכים ממתינים. אם אתם מחכים לתעודה או לקבלה מספק, הוסיפו "מסמך צפוי" כדי שלא תשכחו.</p>
            ) : (
              <ul className="space-y-2">
                {pendingDocs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50/60 p-3 ring-1 ring-amber-200">
                    <div className="min-w-0">
                      <div className="font-bold">{typeLabel(d.doc_type)}{d.doc_number ? ` ${d.doc_number}` : ''} <span className="chip bg-white text-slate-600 ring-1 ring-slate-200">{directionLabel(d.direction)}</span></div>
                      <div className="text-sm text-slate-600">{d.contacts?.name || 'ללא איש קשר'} · נוסף {formatDate(d.created_at.slice(0, 10))}{d.notes ? ` · ${d.notes}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <PhoneLinks phone={d.contacts?.phone} email={d.contacts?.email} />
                      {canWrite && (
                        <>
                          <button type="button" className="btn-primary !min-h-[36px] !px-3" onClick={() => openDocForm(d)}><ScanLine className="h-4 w-4" /> התקבל – העלאה</button>
                          <button type="button" className="icon-btn" title="לא רלוונטי" aria-label="לא רלוונטי" disabled={busy} onClick={() => act(() => setDocumentStatus([d.id], 'void'), 'סומן כלא רלוונטי')}><Ban className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* gaps in numbering */}
          <section className="space-y-2">
            <h2 className="font-bold">פערים במספור ({gapCount})</h2>
            {gaps.length === 0 ? (
              <p className="text-sm text-slate-500">לא נמצאו מספרים חסרים. המערכת בודקת רצף של תעודות מאותו ספק/לקוח ומאותו סוג.</p>
            ) : (
              <ul className="space-y-2">
                {gaps.map((g) => (
                  <li key={`${g.contact_id}${g.doc_type}${g.direction}`} className="rounded-2xl bg-white p-3 ring-1 ring-red-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold">{g.contact?.name || 'איש קשר'} · {typeLabel(g.doc_type)} <span className="chip bg-slate-100 text-slate-600">{directionLabel(g.direction)}</span></div>
                        <div className="text-xs text-slate-500">רצף קיים: {g.from}–{g.to} · חסרים {g.missing.length}</div>
                      </div>
                      <PhoneLinks phone={g.contact?.phone} email={g.contact?.email} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.missing.map((n) => (
                        <button
                          key={n}
                          type="button"
                          disabled={!canWrite}
                          className="chip bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                          title="העלאת המסמך הזה"
                          onClick={() => openDocForm(null, { doc_type: g.doc_type, direction: g.direction, contact_id: g.contact_id, doc_number: n })}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    {canWrite && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="btn-secondary !min-h-[36px] !px-3" disabled={busy} onClick={() => act(() => createVoidOrPendingDocs(ownerId, g, g.missing, 'pending'), 'נוספו כמסמכים ממתינים')}>
                          <Clock className="h-4 w-4" /> סמן הכל כממתין
                        </button>
                        <button type="button" className="btn-ghost !min-h-[36px] !px-3" disabled={busy} onClick={() => act(() => createVoidOrPendingDocs(ownerId, g, g.missing, 'void'), 'סומן כלא רלוונטי')}>
                          <Ban className="h-4 w-4" /> לא רלוונטי (בוטלו)
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* transactions without receipt */}
          <section className="space-y-2">
            <h2 className="font-bold">תנועות ללא קבלה בתקופה ({noReceipt.length})</h2>
            {noReceipt.length === 0 ? (
              <p className="text-sm text-slate-500">לכל התנועות בתקופה מצורפת קבלה.</p>
            ) : (
              <ul className="space-y-2">
                {noReceipt.slice(0, noRcptLimit).map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                    <div className="min-w-0">
                      <div className="font-semibold">{t.contacts?.name || t.vendor || t.categories?.name || NO_CATEGORY}</div>
                      <div className="text-sm text-slate-500">{formatDate(t.tx_date)} · {t.categories?.name || NO_CATEGORY} · <span className={t.type === 'income' ? 'text-brand-700' : 'text-red-600'}>{formatILS(t.amount)}</span></div>
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-1">
                        <button type="button" className="btn-primary !min-h-[36px] !px-3" onClick={() => openForm(t)}><Paperclip className="h-4 w-4" /> הוספת קבלה</button>
                        <button type="button" className="icon-btn" title="לא נדרשת קבלה" aria-label="לא נדרשת קבלה" disabled={busy} onClick={() => act(() => setNoReceiptNeeded([t.id], true), 'סומן – לא נדרשת קבלה')}><Ban className="h-4 w-4" /></button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {noReceipt.length > noRcptLimit && <button type="button" className="btn-secondary w-full" onClick={() => setNoRcptLimit((l) => l + 20)}>הצגת עוד ({noReceipt.length - noRcptLimit})</button>}
          </section>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md animate-rise items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xl md:bottom-6 md:ms-[17rem]">
          <span className="text-sm font-semibold">נבחרו {selected.size}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost !text-white hover:!bg-white/10" onClick={() => setSelected(new Set())}>ביטול</button>
            <button type="button" className="btn-danger" onClick={() => setConfirm(visible.filter((d) => selected.has(d.id)))}><Trash2 className="h-4 w-4" /> מחיקה</button>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.length === 1 ? 'מחיקת מסמך' : `מחיקת ${confirm.length} מסמכים`}
          confirmLabel="מחיקה לצמיתות"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={doDelete}
          message={confirm.length === 1 ? 'המסמך יימחק יחד עם התמונות שלו. תנועה מקושרת תישאר. לא ניתן לשחזר.' : `${confirm.length} המסמכים יימחקו יחד עם התמונות שלהם. לא ניתן לשחזר.`}
        />
      )}
      {viewer && <ReceiptViewer images={viewer.images} title={viewer.title} subtitle={viewer.subtitle} onClose={() => setViewer(null)} />}
    </div>
  );
}
