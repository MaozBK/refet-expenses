import { useEffect, useMemo, useState } from 'react';
import { Download, Mail, PackageOpen } from 'lucide-react';
import SendEmailModal from './SendEmailModal.jsx';
import { ErrorBox, PageLoader, Segmented, Spinner } from './ui.jsx';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useDocuments } from '../hooks/useDocuments.js';
import { cleanupExports } from '../lib/api.js';
import { DOC_TYPES, directionLabel, docDay, formatDateTime, typeLabel } from '../lib/documents.js';
import { formatDate } from '../lib/format.js';
import { getSignedUrls } from '../lib/images.js';
import { buildZip, downloadBlob, safeName, toCsv } from '../lib/zip.js';

const ext = (path) => (path.split('.').pop() || 'jpg').toLowerCase();

/**
 * "Document package": collects photos of delivery notes, receipts and invoices (and the receipt photos
 * attached to expenses / income) by period, type, contact and category – into a ZIP that can be
 * downloaded or e-mailed straight from the app.
 */
export default function DocumentExport({ period, txs }) {
  const { ownerId, contacts, categories, farmName } = useFarm();
  const { toast } = useUI();
  const { docs, loading } = useDocuments();

  const [withDocs, setWithDocs] = useState(true);
  const [withTx, setWithTx] = useState(true);
  const [types, setTypes] = useState(() => new Set(DOC_TYPES.map((t) => t.value)));
  const [direction, setDirection] = useState('all');
  const [contactId, setContactId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [emailing, setEmailing] = useState(false);

  useEffect(() => {
    cleanupExports(ownerId);
  }, [ownerId]);

  const inRange = (day) => (!period.range.from || day >= period.range.from) && (!period.range.to || day <= period.range.to);

  const selDocs = useMemo(
    () =>
      !withDocs
        ? []
        : docs.filter(
            (d) =>
              d.status === 'received' &&
              d.transaction_images?.length &&
              types.has(d.doc_type) &&
              (direction === 'all' || d.direction === direction) &&
              (!contactId || d.contact_id === contactId) &&
              inRange(docDay(d)),
          ),
    [docs, withDocs, types, direction, contactId, period.range.from, period.range.to], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const selTx = useMemo(
    () =>
      !withTx
        ? []
        : txs.filter(
            (t) =>
              t.transaction_images?.length &&
              (direction === 'all' || (direction === 'incoming' ? t.type === 'expense' : t.type === 'income')) &&
              (!contactId || t.contact_id === contactId) &&
              (!categoryId || t.category_id === categoryId),
          ),
    [txs, withTx, direction, contactId, categoryId],
  );

  const photoCount = selDocs.reduce((n, d) => n + d.transaction_images.length, 0) + selTx.reduce((n, t) => n + t.transaction_images.length, 0);
  const busy = Boolean(progress);

  const toggleType = (v) =>
    setTypes((cur) => {
      const n = new Set(cur);
      n.has(v) ? n.delete(v) : n.add(v);
      return n;
    });

  /** Builds { blob, filename, contentType } for download or e-mail. */
  const makePackage = async () => {
    setError('');
    const allPaths = [...selDocs, ...selTx].flatMap((x) => x.transaction_images.map((i) => i.path));
    setProgress('מכין קישורים…');
    const urls = await getSignedUrls(allPaths, 3600);

    const items = [];
    const rows = [];
    const root = safeName(period.type === 'all' ? 'כל התקופה' : period.label);

    for (const d of selDocs) {
      const contactName = d.contacts?.name || 'ללא איש קשר';
      const folder = `${root}/${safeName(typeLabel(d.doc_type))} - ${safeName(directionLabel(d.direction))}/${safeName(contactName)}`;
      d.transaction_images.forEach((img, i) => {
        const file = `${docDay(d)}_${safeName(d.doc_number || 'ללא מספר')}_${i + 1}.${ext(img.path)}`;
        if (urls[img.path]) items.push({ path: `${folder}/${file}`, url: urls[img.path] });
        rows.push([`${folder}/${file}`, typeLabel(d.doc_type), directionLabel(d.direction), d.doc_number, d.doc_date ? formatDate(d.doc_date) : '', contactName, d.contacts?.phone, d.amount ?? '', formatDateTime(img.created_at), d.notes]);
      });
    }
    for (const t of selTx) {
      const kind = t.type === 'income' ? 'קבלות הכנסות' : 'קבלות הוצאות';
      const contactName = t.contacts?.name || t.vendor || 'ללא איש קשר';
      const folder = `${root}/${kind}/${safeName(contactName)}`;
      t.transaction_images.forEach((img, i) => {
        const file = `${t.tx_date}_${safeName(t.categories?.name || 'ללא קטגוריה')}_${t.amount}_${i + 1}.${ext(img.path)}`;
        if (urls[img.path]) items.push({ path: `${folder}/${file}`, url: urls[img.path] });
        rows.push([`${folder}/${file}`, kind, t.type === 'income' ? 'הכנסה' : 'הוצאה', '', formatDate(t.tx_date), contactName, t.contacts?.phone, t.amount, formatDateTime(img.created_at), t.notes]);
      });
    }

    const header = ['קובץ', 'סוג', 'כיוון', 'מספר מסמך', 'תאריך מסמך', 'איש קשר', 'טלפון', 'סכום', 'הועלה בתאריך', 'הערות'];
    const { blob, added, failed } = await buildZip(items, [{ path: `${root}/index.csv`, content: toCsv(header, rows) }], (i, n) =>
      setProgress(`מוסיף תמונה ${i} מתוך ${n}…`),
    );
    if (failed) toast(`${failed} תמונות לא נטענו ולא נכללו`, 'error');
    if (!added) throw new Error('לא נוספו תמונות לחבילה');
    return { blob, filename: `documents-${period.range.from || 'all'}_${period.range.to || 'all'}.zip`, contentType: 'application/zip', added };
  };

  const download = async () => {
    try {
      const f = await makePackage();
      downloadBlob(f.blob, f.filename);
      toast(`החבילה ירדה – ${f.added} תמונות (${(f.blob.size / 1048576).toFixed(1)}MB)`);
    } catch (e) {
      setError(e.message || 'יצירת החבילה נכשלה');
    } finally {
      setProgress('');
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4 animate-rise">
      <section className="card space-y-4">
        <div>
          <h2 className="font-bold">מה לכלול בחבילה</h2>
          <p className="text-sm text-slate-500">כל התמונות של התקופה שנבחרה למעלה, מסודרות בתיקיות לפי סוג ואיש קשר, עם קובץ אינדקס.</p>
        </div>

        <div className="space-y-2">
          <label className="flex min-h-[40px] items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={withDocs} onChange={(e) => setWithDocs(e.target.checked)} />
            <span className="text-sm font-medium">תעודות משלוח, קבלות וחשבוניות ({selDocs.length} מסמכים)</span>
          </label>
          {withDocs && (
            <div className="flex flex-wrap gap-1.5 ps-8">
              {DOC_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => toggleType(t.value)} className={`chip !px-3 !py-1.5 ${types.has(t.value) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <label className="flex min-h-[40px] items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={withTx} onChange={(e) => setWithTx(e.target.checked)} />
            <span className="text-sm font-medium">תמונות קבלה שצורפו להוצאות והכנסות ({selTx.length} תנועות)</span>
          </label>
        </div>

        <Segmented
          value={direction}
          onChange={setDirection}
          className="w-full sm:w-auto"
          options={[{ value: 'all', label: 'הכל' }, { value: 'incoming', label: 'שקיבלתי / הוצאות' }, { value: 'outgoing', label: 'שהנפקתי / הכנסות' }]}
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <select className="input" value={contactId} onChange={(e) => setContactId(e.target.value)} aria-label="איש קשר">
            <option value="">כל אנשי הקשר (לקוחות וספקים)</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="קטגוריה" disabled={!withTx}>
            <option value="">כל הקטגוריות (לקבלות תנועות)</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.group_name ? `${c.group_name} · ` : ''}{c.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-brand-900">
          <PackageOpen className="h-6 w-6 shrink-0" />
          <div className="text-sm">
            <b>{photoCount}</b> תמונות מ-<b>{selDocs.length + selTx.length}</b> פריטים
            {photoCount > 150 && <span className="block text-xs text-brand-800">חבילה גדולה – ייתכן שתיבנה לאט בטלפון.</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-primary !min-h-[52px]" disabled={busy || photoCount === 0} onClick={download}>
            {busy ? <Spinner className="h-5 w-5" /> : <Download className="h-5 w-5" />}
            {busy ? progress : 'הורדת ZIP'}
          </button>
          <button type="button" className="btn-secondary !min-h-[52px]" disabled={busy || photoCount === 0} onClick={() => setEmailing(true)}>
            <Mail className="h-5 w-5" /> שליחה במייל
          </button>
        </div>
        <ErrorBox>{error}</ErrorBox>
      </section>

      {emailing && (
        <SendEmailModal
          defaultSubject={`מסמכים – ${farmName} – ${period.label}`}
          defaultMessage={`שלום,\nמצורפים המסמכים (תעודות משלוח וקבלות) לתקופה ${period.label}.\nבתיקייה גם קובץ index.csv עם פירוט כל הקבצים.`}
          fileLabel={`ZIP עם ${photoCount} תמונות`}
          buildFile={async () => {
            try {
              return await makePackage();
            } finally {
              setProgress('');
            }
          }}
          onClose={() => setEmailing(false)}
        />
      )}
    </div>
  );
}
