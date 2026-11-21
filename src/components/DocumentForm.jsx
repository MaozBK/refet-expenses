import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, ImagePlus, Link2, Trash2, Undo2 } from 'lucide-react';
import { ErrorBox, Modal, Segmented, Spinner } from './ui.jsx';
import ContactPicker from './ContactPicker.jsx';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useSignedUrls } from '../hooks/useSignedUrls.js';
import { isDuplicateDocument, saveDocument } from '../lib/api.js';
import { DIRECTIONS, DOC_TYPES } from '../lib/documents.js';
import { todayISO } from '../lib/format.js';

/**
 * Add / edit a document (delivery note, receipt, invoice): number, date, amount, category, notes and photos.
 * `doc` = existing document (with transaction_images) or null; `preset` pre-fills a new one.
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
  const [categoryId, setCategoryId] = useState(init.category_id || '');
  const [amount, setAmount] = useState(init.amount != null ? String(init.amount) : '');
  const [notes, setNotes] = useState(init.notes || '');
  const [existing] = useState(doc?.transaction_images || []);
  const [removedIds, setRemovedIds] = useState([]);
  const [files, setFiles] = useState([]); // { file, preview }
  const [alsoTx, setAlsoTx] = useState(false);
  const [dupWarn, setDupWarn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const camRef = useRef(null);
  const pickRef = useRef(null);

  const urls = useSignedUrls(existing.map((i) => i.thumb_path || i.path));
  const txType = direction === 'outgoing' ? 'income' : 'expense';

  // a category belongs to either expenses or income; offer the matching ones (plus the current one)
  const groupedCategories = useMemo(() => {
    const list = categories.filter((c) => c.type === txType || c.id === categoryId);
    const groups = new Map();
    for (const c of list) {
      const g = c.group_name || 'אחר';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(c);
    }
    return [...groups.entries()];
  }, [categories, txType, categoryId]);

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = (setter) => (v) => {
    setDupWarn(false);
    setter(v);
  };

  const addFiles = (list) => {
    const imgs = [...list].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (imgs.length) setFiles((cur) => [...cur, ...imgs.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  };

  const remaining = existing.filter((i) => !removedIds.includes(i.id)).length;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const amt = amount === '' ? '' : Number(String(amount).replace(',', '.'));
    if (amt !== '' && (!Number.isFinite(amt) || amt < 0)) return setError('הסכום אינו תקין');
    if (status === 'pending' && !contactId && !number.trim()) return setError('למסמך ממתין יש לבחור איש קשר או להזין מספר');
    if (status === 'received' && !number.trim() && remaining + files.length === 0) return setError('הזינו את מספר המסמך או צרפו תמונה');

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
        values: { doc_type: docType, direction, status, doc_number: number, doc_date: date, contact_id: contactId, category_id: categoryId, amount: amt, notes },
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
      title={editing ? 'עריכת מסמך' : status === 'pending' ? 'מסמך חסר צפוי' : 'מסמך חדש'}
      onClose={onClose}
      dismissable={!saving}
      footer={
        <div className="flex gap-2">
          <button type="submit" form="doc-form" className="btn-primary flex-1" disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />} {dupWarn ? 'שמירה בכל זאת' : 'שמירה'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            ביטול
          </button>
        </div>
      }
    >
      <form id="doc-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="d-type">סוג מסמך</label>
            <select id="d-type" className="input" value={docType} onChange={(e) => changed(setDocType)(e.target.value)}>
              {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="d-number">מספר מסמך</label>
            <input id="d-number" className="input !text-lg font-bold" inputMode="numeric" value={number} onChange={(e) => changed(setNumber)(e.target.value)} maxLength={60} autoFocus={!editing} />
          </div>
        </div>

        <div>
          <span className="label">כיוון</span>
          <Segmented value={direction} onChange={changed(setDirection)} options={DIRECTIONS.map((d) => ({ value: d.value, label: d.label }))} className="w-full" />
        </div>

        <div>
          <label className="label" htmlFor="d-contact">{direction === 'incoming' ? 'ספק' : 'לקוח'}</label>
          <ContactPicker id="d-contact" value={contactId} onChange={changed(setContactId)} defaultKind={direction === 'incoming' ? 'supplier' : 'customer'} emptyLabel="לא נבחר" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="d-date">תאריך המסמך</label>
            <input id="d-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="d-amount">סכום (₪, אופציונלי)</label>
            <input id="d-amount" className="input" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="d-cat">קטגוריה</label>
          <select id="d-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">ללא קטגוריה</option>
            {groupedCategories.map(([group, list]) => (
              <optgroup key={group} label={group}>
                {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="d-notes">הערות</label>
          <textarea id="d-notes" className="input !py-2.5" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div>
          <span className="label">תמונות</span>
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
                    {removed && <span className="absolute inset-x-0 bottom-0 bg-red-600 py-0.5 text-center text-xs text-white">תוסר בשמירה</span>}
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
                  <span className="absolute inset-x-0 bottom-0 bg-brand-600 py-0.5 text-center text-xs text-white">חדש</span>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" onClick={() => camRef.current?.click()}>
              <Camera className="h-5 w-5" /> צילום
            </button>
            <button type="button" className="btn-secondary" onClick={() => pickRef.current?.click()}>
              <ImagePlus className="h-5 w-5" /> מהגלריה
            </button>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <input ref={pickRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
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
            <label className="flex min-h-[44px] items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2">
              <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={alsoTx} onChange={(e) => setAlsoTx(e.target.checked)} />
              <span className="text-sm font-semibold">לרשום גם כ{txType === 'income' ? 'הכנסה' : 'הוצאה'} בסך {Number(amount).toLocaleString('he-IL')} ₪ (בקטגוריה שנבחרה)</span>
            </label>
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
    </Modal>
  );
}
