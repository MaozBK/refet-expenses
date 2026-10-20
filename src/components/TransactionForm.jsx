import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, Undo2 } from 'lucide-react';
import { Modal, Spinner } from './ui.jsx';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { useSignedUrls } from '../hooks/useSignedUrls.js';
import { saveTransaction } from '../lib/api.js';
import { todayISO } from '../lib/format.js';

/** Add / edit sheet. `tx` = existing transaction (with transaction_images) or null for a new one. */
export default function TransactionForm({ tx, onClose }) {
  const { ownerId, categories } = useFarm();
  const { toast, bump } = useUI();
  const editing = Boolean(tx);

  const [type, setType] = useState(tx?.type || 'expense');
  const [amount, setAmount] = useState(tx ? String(tx.amount) : '');
  const [date, setDate] = useState(tx?.tx_date || todayISO());
  const [categoryId, setCategoryId] = useState(tx?.category_id || '');
  const [vendor, setVendor] = useState(tx?.vendor || '');
  const [notes, setNotes] = useState(tx?.notes || '');
  const [existing] = useState(tx?.transaction_images || []);
  const [removedIds, setRemovedIds] = useState([]);
  const [files, setFiles] = useState([]); // { file, preview }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pickRef = useRef(null);
  const camRef = useRef(null);

  const urls = useSignedUrls(existing.map((i) => i.path));
  const typeCategories = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);

  // keep the selected category valid for the chosen type
  useEffect(() => {
    if (categoryId && !typeCategories.some((c) => c.id === categoryId)) setCategoryId('');
  }, [typeCategories, categoryId]);

  useEffect(() => () => files.forEach((f) => URL.revokeObjectURL(f.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (list) => {
    const imgs = [...list].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    setFiles((cur) => [...cur, ...imgs.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const value = Number(String(amount).replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return setError('יש להזין סכום תקין הגדול מאפס');
    if (value >= 1e10) return setError('הסכום גדול מדי');
    if (!date) return setError('יש לבחור תאריך');

    setSaving(true);
    try {
      const { failedUploads } = await saveTransaction({
        ownerId,
        id: tx?.id,
        values: { type, amount: Math.round(value * 100) / 100, tx_date: date, category_id: categoryId, vendor, notes },
        removedImages: existing.filter((i) => removedIds.includes(i.id)),
        newFiles: files.map((f) => f.file),
      });
      bump();
      if (failedUploads.length) toast(`התנועה נשמרה, אך ${failedUploads.length} תמונות לא הועלו`, 'error');
      else toast(editing ? 'התנועה עודכנה' : 'התנועה נוספה');
      onClose();
    } catch (err) {
      setError(err.message || 'שמירה נכשלה');
      setSaving(false);
    }
  };

  const isExpense = type === 'expense';

  return (
    <Modal
      title={editing ? 'עריכת תנועה' : 'תנועה חדשה'}
      onClose={onClose}
      dismissable={!saving}
      footer={
        <div className="flex gap-2">
          <button type="submit" form="tx-form" className="btn-primary flex-1" disabled={saving}>
            {saving && <Spinner className="h-4 w-4" />} {editing ? 'שמירת שינויים' : 'הוספה'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            ביטול
          </button>
        </div>
      }
    >
      <form id="tx-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
          {[
            ['expense', 'הוצאה', 'bg-red-600'],
            ['income', 'הכנסה', 'bg-brand-600'],
          ].map(([v, label, active]) => (
            <button
              key={v}
              type="button"
              onClick={() => setType(v)}
              className={`min-h-[44px] rounded-xl text-base font-bold transition ${
                type === v ? `${active} text-white shadow` : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <label className="label" htmlFor="tx-amount">
            סכום (₪)
          </label>
          <div className="relative">
            <input
              id="tx-amount"
              className="input !min-h-[56px] !text-2xl font-bold"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus={!editing}
              required
            />
            <span className={`pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-xl font-bold ${isExpense ? 'text-red-500' : 'text-brand-600'}`}>
              ₪
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="tx-date">
              תאריך
            </label>
            <input id="tx-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="tx-cat">
              קטגוריה
            </label>
            <select id="tx-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">ללא קטגוריה</option>
              {typeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="tx-vendor">
            {isExpense ? 'ספק' : 'לקוח'}
          </label>
          <input
            id="tx-vendor"
            className="input"
            maxLength={120}
            placeholder={isExpense ? 'למשל: תנובה, חברת החשמל' : 'למשל: מחלבה, סוחר בקר'}
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="tx-notes">
            הערות
          </label>
          <textarea
            id="tx-notes"
            className="input !py-2.5"
            rows={2}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div>
          <span className="label">קבלות וחשבוניות</span>
          {(existing.length > 0 || files.length > 0) && (
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {existing.map((img) => {
                const removed = removedIds.includes(img.id);
                return (
                  <div key={img.id} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                    {urls[img.path] ? (
                      <img src={urls[img.path]} alt="קבלה" className={`h-full w-full object-cover ${removed ? 'opacity-30' : ''}`} />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Spinner className="text-slate-400" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setRemovedIds((r) => (removed ? r.filter((x) => x !== img.id) : [...r, img.id]))}
                      className="absolute end-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow"
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
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={pickRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{error}</div>}
      </form>
    </Modal>
  );
}
