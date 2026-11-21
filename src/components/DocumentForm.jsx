import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, ImagePlus, Link2, ScanText, Sparkles, Trash2, Undo2, UserPlus } from 'lucide-react';
import { ErrorBox, Modal, Segmented, Spinner } from './ui.jsx';
import ContactForm from './ContactForm.jsx';
import ContactPicker from './ContactPicker.jsx';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useSignedUrls } from '../hooks/useSignedUrls.js';
import { SCAN_ERRORS, isDuplicateDocument, saveDocument, scanDocument } from '../lib/api.js';
import { DIRECTIONS, DOC_TYPES } from '../lib/documents.js';
import { todayISO } from '../lib/format.js';

/**
 * Scan / add / edit a document (delivery note, receipt, invoice).
 * `doc` = existing document (with transaction_images) or null; `preset` pre-fills a new one.
 * Photographing a document reads its number, date, issuer and amount automatically (Claude vision).
 */
export default function DocumentForm({ doc, preset = {}, onClose }) {
  const { ownerId, categories, contacts } = useFarm();
  const { toast, bump } = useUI();
  const editing = Boolean(doc);
  const init = { ...preset, ...(doc || {}) };

  const [docType, setDocType] = useState(init.doc_type || 'delivery_note');
  const [direction, setDirection] = useState(init.direction || 'incoming');
  const [status, setStatus] = useState(init.status === 'void' ? 'received' : init.status || 'received');
  const [number, setNumber] = useState(init.doc_number || '');
  const [date, setDate] = useState(init.doc_date || (editing ? '' : todayISO()));
  const [contactId, setContactId] = useState(init.contact_id || '');
  const [amount, setAmount] = useState(init.amount != null ? String(init.amount) : '');
  const [notes, setNotes] = useState(init.notes || '');
  const [ocrUsed, setOcrUsed] = useState(Boolean(init.ocr_used));
  const [existing] = useState(doc?.transaction_images || []);
  const [removedIds, setRemovedIds] = useState([]);
  const [files, setFiles] = useState([]); // { file, preview }
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState(null);
  const [newContact, setNewContact] = useState(null); // preset for ContactForm
  const [alsoTx, setAlsoTx] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [dupWarn, setDupWarn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const touched = useRef({});
  const scanned = useRef(false);
  const camRef = useRef(null);
  const pickRef = useRef(null);

  const urls = useSignedUrls(existing.map((i) => i.thumb_path || i.path));
  const txType = direction === 'outgoing' ? 'income' : 'expense';
  const txCategories = useMemo(() => categories.filter((c) => c.type === txType), [categories, txType]);
  useEffect(() => {
    if (categoryId && !txCategories.some((c) => c.id === categoryId)) setCategoryId('');
  }, [txCategories, categoryId]);
  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (key, setter) => (v) => {
    touched.current[key] = true;
    setDupWarn(false);
    setter(v);
  };

  const runScan = async (file) => {
    scanned.current = true;
    setScanning(true);
    setScanInfo(null);
    try {
      const r = await scanDocument(file);
      setScanInfo(r);
      setOcrUsed(true);
      if (!touched.current.number && r.doc_number) setNumber(r.doc_number);
      if (!touched.current.date && /^\d{4}-\d{2}-\d{2}$/.test(r.doc_date || '')) setDate(r.doc_date);
      if (!touched.current.amount && r.total_amount) setAmount(String(r.total_amount));
      if (!touched.current.notes && r.notes) setNotes(r.notes);
      if (!touched.current.type && r.doc_type) setDocType(r.doc_type);
      if (!touched.current.contact && !contactId) {
        const names = [r.issuer_name, r.customer_name].filter(Boolean).map((s) => s.toLowerCase());
        const match = contacts.find(
          (c) => c.name.length >= 3 && names.some((n) => n.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(n)),
        );
        if (match) setContactId(match.id);
      }
    } catch (e) {
      toast(SCAN_ERRORS[e.code] || SCAN_ERRORS.scan_failed, 'error');
    } finally {
      setScanning(false);
    }
  };

  const addFiles = (list) => {
    const imgs = [...list].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (!imgs.length) return;
    setFiles((cur) => [...cur, ...imgs.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    if (!scanned.current) runScan(imgs[0]);
  };

  const suggestName = scanInfo && (direction === 'incoming' ? scanInfo.issuer_name || scanInfo.customer_name : scanInfo.customer_name || scanInfo.issuer_name);
  const candidates = (scanInfo?.number_candidates || []).filter((n) => n && n !== number);
  const remaining = existing.filter((i) => !removedIds.includes(i.id)).length;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const amt = amount === '' ? '' : Number(String(amount).replace(',', '.'));
    if (amt !== '' && (!Number.isFinite(amt) || amt < 0)) return setError('הסכום אינו תקין');
    if (status === 'pending' && !contactId && !number.trim()) return setError('למסמך ממתין יש לבחור איש קשר או להזין מספר');
    if (status === 'received' && !number.trim() && remaining + files.length === 0) return setError('צלמו את המסמך או הזינו את מספרו');

    setSaving(true);
    try {
      if (!dupWarn && (await isDuplicateDocument({ ownerId, id: doc?.id, contact_id: contactId, doc_type: docType, direction, doc_number: number }))) {
        setDupWarn(true);
        setSaving(false);
        return;
      }
      const { failedUploads, transactionId } = await saveDocument({
        ownerId,
        id: doc?.id,
        values: { doc_type: docType, direction, status, doc_number: number, doc_date: date, contact_id: contactId, amount: amt, notes, ocr_used: ocrUsed },
        removedImages: existing.filter((i) => removedIds.includes(i.id)),
        newFiles: files.map((f) => f.file),
        remainingImages: remaining,
        alsoTransaction:
          alsoTx && amt > 0 && !doc?.transaction_id
            ? { type: txType, category_id: categoryId, vendor: contacts.find((c) => c.id === contactId)?.name }
            : null,
      });
      bump();
      if (failedUploads.length) toast(`המסמך נשמר, אך ${failedUploads.length} תמונות לא הועלו`, 'error');
      else toast(transactionId ? 'המסמך נשמר והתנועה נרשמה' : editing ? 'המסמך עודכן' : 'המסמך נשמר');
      onClose();
    } catch (err) {
      setError(err.message || 'שמירה נכשלה');
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? 'עריכת מסמך' : status === 'pending' ? 'מסמך חסר צפוי' : 'סריקת מסמך'}
      onClose={onClose}
      dismissable={!saving}
      footer={
        <div className="flex gap-2">
          <button type="submit" form="doc-form" className="btn-primary flex-1" disabled={saving || scanning}>
            {saving && <Spinner className="h-4 w-4" />} {dupWarn ? 'שמירה בכל זאת' : 'שמירה'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            ביטול
          </button>
        </div>
      }
    >
      <form id="doc-form" onSubmit={submit} className="space-y-4">
        {/* photos first: the scan fills the rest */}
        <div>
          {(existing.length > 0 || files.length > 0) && (
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {existing.map((img) => {
                const removed = removedIds.includes(img.id);
                const u = urls[img.thumb_path || img.path];
                return (
                  <div key={img.id} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                    {u ? <img src={u} alt="מסמך" className={`h-full w-full object-cover ${removed ? 'opacity-30' : ''}`} /> : <div className="flex h-full items-center justify-center"><Spinner className="text-slate-400" /></div>}
                    <button
                      type="button"
                      onClick={() => setRemovedIds((r) => (removed ? r.filter((x) => x !== img.id) : [...r, img.id]))}
                      className="absolute end-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow"
                      aria-label={removed ? 'ביטול הסרה' : 'הסרת תמונה'}
                    >
                      {removed ? <Undo2 className="h-4 w-4" /> : <Trash2 className="h-4 w-4 text-red-600" />}
                    </button>
                  </div>
                );
              })}
              {files.map((f, i) => (
                <div key={f.preview} className="relative aspect-square overflow-hidden rounded-xl ring-2 ring-brand-300">
                  <img src={f.preview} alt="תמונה חדשה" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(f.preview);
                      setFiles((cur) => cur.filter((_, j) => j !== i));
                    }}
                    className="absolute end-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow"
                    aria-label="הסרת תמונה"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-primary !min-h-[52px]" onClick={() => camRef.current?.click()}>
              <Camera className="h-5 w-5" /> צילום מסמך
            </button>
            <button type="button" className="btn-secondary !min-h-[52px]" onClick={() => pickRef.current?.click()}>
              <ImagePlus className="h-5 w-5" /> מהגלריה
            </button>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <input ref={pickRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

          {scanning && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">
              <Spinner className="h-4 w-4" /> קורא את המסמך…
            </div>
          )}
          {scanInfo && !scanning && (
            <div className={`mt-3 flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${scanInfo.confidence === 'high' ? 'bg-brand-50 text-brand-900' : 'bg-amber-50 text-amber-900'}`}>
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                {scanInfo.confidence === 'high' ? 'המסמך זוהה אוטומטית. בדקו שהפרטים נכונים.' : 'זיהוי חלקי – בדקו ותקנו את הפרטים.'}
                {candidates.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs">מספרים אפשריים:</span>
                    {candidates.map((n) => (
                      <button key={n} type="button" className="chip bg-white ring-1 ring-amber-300" onClick={edit('number', setNumber).bind(null, n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {files[0] && (
                <button type="button" className="shrink-0 text-xs font-bold underline" onClick={() => runScan(files[0].file)}>
                  סריקה חוזרת
                </button>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="d-type">סוג מסמך</label>
            <select id="d-type" className="input" value={docType} onChange={(e) => edit('type', setDocType)(e.target.value)}>
              {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="d-number">מספר מסמך</label>
            <div className="relative">
              <input id="d-number" className="input !pe-9" inputMode="numeric" value={number} onChange={(e) => edit('number', setNumber)(e.target.value)} maxLength={60} />
              {ocrUsed && number && <ScanText className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" aria-label="זוהה אוטומטית" />}
            </div>
          </div>
        </div>

        <div>
          <span className="label">כיוון</span>
          <Segmented value={direction} onChange={edit('direction', setDirection)} options={DIRECTIONS.map((d) => ({ value: d.value, label: d.label }))} className="w-full" />
        </div>

        <div>
          <label className="label" htmlFor="d-contact">{direction === 'incoming' ? 'ספק' : 'לקוח'}</label>
          <ContactPicker id="d-contact" value={contactId} onChange={(v) => edit('contact', setContactId)(v)} defaultKind={direction === 'incoming' ? 'supplier' : 'customer'} emptyLabel="לא נבחר" />
          {!contactId && suggestName && (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"
              onClick={() => setNewContact({ name: suggestName, kind: direction === 'incoming' ? 'supplier' : 'customer' })}
            >
              <UserPlus className="h-4 w-4" /> הוספת "{suggestName}" כאיש קשר
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="d-date">תאריך המסמך</label>
            <input id="d-date" className="input" type="date" value={date} onChange={(e) => edit('date', setDate)(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="d-amount">סכום (₪, אופציונלי)</label>
            <input id="d-amount" className="input" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => edit('amount', setAmount)(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="d-notes">הערות</label>
          <textarea id="d-notes" className="input !py-2.5" rows={2} maxLength={2000} value={notes} onChange={(e) => edit('notes', setNotes)(e.target.value)} />
        </div>

        {existing.length + files.length === 0 && (
          <div>
            <span className="label">סטטוס</span>
            <Segmented
              value={status}
              onChange={setStatus}
              options={[{ value: 'received', label: 'התקבל' }, { value: 'pending', label: 'ממתין – עוד לא קיבלתי' }]}
              className="w-full"
            />
          </div>
        )}

        {doc?.transaction_id ? (
          <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Link2 className="h-4 w-4" /> המסמך מקושר לתנועה שנרשמה במערכת.
          </p>
        ) : (
          Number(amount) > 0 && (
            <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
              <label className="flex min-h-[40px] items-center gap-3">
                <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={alsoTx} onChange={(e) => setAlsoTx(e.target.checked)} />
                <span className="text-sm font-semibold">לרשום גם כ{txType === 'income' ? 'הכנסה' : 'הוצאה'} בסך {Number(amount).toLocaleString('he-IL')} ₪</span>
              </label>
              {alsoTx && (
                <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="קטגוריה">
                  <option value="">ללא קטגוריה</option>
                  {txCategories.map((c) => <option key={c.id} value={c.id}>{c.group_name ? `${c.group_name} · ` : ''}{c.name}</option>)}
                </select>
              )}
            </div>
          )
        )}

        {dupWarn && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            כבר קיים מסמך מאותו סוג עם אותו מספר ואותו {direction === 'incoming' ? 'ספק' : 'לקוח'}. אם זה מסמך אחר, לחצו "שמירה בכל זאת".
          </div>
        )}
        <ErrorBox>{error}</ErrorBox>
      </form>

      {newContact && (
        <ContactForm preset={newContact} onClose={() => setNewContact(null)} onSaved={(c) => edit('contact', setContactId)(c.id)} />
      )}
    </Modal>
  );
}
