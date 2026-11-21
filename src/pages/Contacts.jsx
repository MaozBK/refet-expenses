import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import ContactForm from '../components/ContactForm.jsx';
import PhoneLinks from '../components/PhoneLinks.jsx';
import { ConfirmDialog, Empty, Segmented } from '../components/ui.jsx';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useDocuments } from '../hooks/useDocuments.js';
import { useTransactions } from '../hooks/useTransactions.js';
import { KINDS, kindLabel } from '../lib/documents.js';
import { formatILS } from '../lib/format.js';
import { supabase } from '../lib/supabase.js';

const ALL_TIME = { from: null, to: null };
const KIND_TONE = {
  customer: 'bg-brand-100 text-brand-800',
  supplier: 'bg-sky-100 text-sky-800',
  accountant: 'bg-violet-100 text-violet-800',
  other: 'bg-slate-100 text-slate-700',
};

export default function Contacts() {
  const { contacts, canWrite, reloadContacts } = useFarm();
  const { toast, bump } = useUI();
  const { txs } = useTransactions(ALL_TIME);
  const { docs } = useDocuments();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [editing, setEditing] = useState(null); // contact | {} (new)
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const m = new Map();
    const get = (id) => {
      if (!m.has(id)) m.set(id, { income: 0, expense: 0, docs: 0, pending: 0 });
      return m.get(id);
    };
    for (const t of txs) if (t.contact_id) get(t.contact_id)[t.type] += t.amount;
    for (const d of docs) {
      if (!d.contact_id) continue;
      const s = get(d.contact_id);
      if (d.status === 'pending') s.pending += 1;
      else if (d.status === 'received') s.docs += 1;
    }
    return m;
  }, [txs, docs]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        (kind === 'all' || c.kind === kind) &&
        (!q || [c.name, c.phone, c.email, c.notes].some((s) => s && s.toLowerCase().includes(q))),
    );
  }, [contacts, query, kind]);

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.from('contacts').delete().eq('id', toDelete.id);
    setBusy(false);
    if (error) return toast(error.message, 'error');
    setToDelete(null);
    await reloadContacts();
    bump();
    toast('איש הקשר נמחק. המסמכים והתנועות שלו נשארו.');
  };

  return (
    <div className="space-y-4">
      <Link to="/documents" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowRight className="h-4 w-4" /> חזרה למסמכים
      </Link>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-slate-900">אנשי קשר</h1>
        {canWrite && (
          <button type="button" className="btn-primary !min-h-[40px]" onClick={() => setEditing({})}>
            <Plus className="h-4 w-4" /> איש קשר חדש
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input className="input !ps-10 !pe-10" type="search" placeholder="חיפוש לפי שם, טלפון או אימייל" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && <button type="button" className="icon-btn absolute end-1 top-1/2 h-8 w-8 -translate-y-1/2" onClick={() => setQuery('')} aria-label="ניקוי"><X className="h-4 w-4" /></button>}
      </div>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'הכל' }, ...KINDS]} className="w-full sm:w-auto" />

      {list.length === 0 ? (
        <div className="card">
          <Empty icon={Users} title={contacts.length ? 'לא נמצאו אנשי קשר' : 'עדיין אין אנשי קשר'} hint="הוסיפו לקוחות (מחלבה, סוחרי בקר), ספקים ורואה חשבון – כדי לחייג, לשלוח וואטסאפ ולראות את כל המסמכים שלהם." />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 animate-rise">
          {list.map((c) => {
            const s = stats.get(c.id) || { income: 0, expense: 0, docs: 0, pending: 0 };
            return (
              <li key={c.id} className="card space-y-3 !p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-bold">{c.name}</div>
                    <span className={`chip mt-1 ${KIND_TONE[c.kind]}`}>{kindLabel(c.kind)}</span>
                  </div>
                  <PhoneLinks phone={c.phone} email={c.email} size="md" />
                </div>
                {(c.phone || c.email) && (
                  <div className="space-y-0.5 text-sm text-slate-600" dir="ltr" style={{ textAlign: 'right' }}>
                    {c.phone && <div>{c.phone}</div>}
                    {c.email && <div className="truncate">{c.email}</div>}
                  </div>
                )}
                {c.notes && <p className="text-sm text-slate-500">{c.notes}</p>}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-brand-50 p-1.5"><div className="text-brand-800">הכנסות</div><div className="font-bold text-brand-800">{formatILS(s.income)}</div></div>
                  <div className="rounded-lg bg-red-50 p-1.5"><div className="text-red-700">הוצאות</div><div className="font-bold text-red-700">{formatILS(s.expense)}</div></div>
                  <div className="rounded-lg bg-slate-100 p-1.5"><div className="text-slate-600">מסמכים</div><div className="font-bold">{s.docs}{s.pending ? ` (+${s.pending} ממתינים)` : ''}</div></div>
                </div>
                <div className="flex items-center justify-between">
                  <Link to={`/documents?contact=${c.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-brand-700"><FileText className="h-4 w-4" /> המסמכים שלו</Link>
                  {canWrite && (
                    <span className="flex">
                      <button type="button" className="icon-btn" onClick={() => setEditing(c)} aria-label="עריכה"><Pencil className="h-4 w-4" /></button>
                      <button type="button" className="icon-btn hover:!bg-red-50 hover:!text-red-600" onClick={() => setToDelete(c)} aria-label="מחיקה"><Trash2 className="h-4 w-4" /></button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <ContactForm contact={editing.id ? editing : null} onClose={() => setEditing(null)} />}
      {toDelete && (
        <ConfirmDialog
          title="מחיקת איש קשר"
          message={`למחוק את "${toDelete.name}"? המסמכים והתנועות שלו יישארו, ללא קישור לאיש קשר.`}
          confirmLabel="מחיקה"
          busy={busy}
          onCancel={() => setToDelete(null)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}
