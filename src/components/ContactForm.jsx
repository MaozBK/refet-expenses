import { useState } from 'react';
import { ErrorBox, Modal, Segmented, Spinner } from './ui.jsx';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { supabase } from '../lib/supabase.js';
import { KINDS } from '../lib/documents.js';

/** Add / edit a contact (customer, supplier, accountant). `onSaved(contact)` gets the saved row. */
export default function ContactForm({ contact, preset = {}, onClose, onSaved }) {
  const { ownerId, reloadContacts } = useFarm();
  const { toast } = useUI();
  const [name, setName] = useState(contact?.name ?? preset.name ?? '');
  const [kind, setKind] = useState(contact?.kind ?? preset.kind ?? 'customer');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [notes, setNotes] = useState(contact?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');
    if (!name.trim()) return setError('יש להזין שם');
    setBusy(true);
    const payload = {
      name: name.trim(),
      kind,
      phone: phone.trim() || null,
      email: email.trim().toLowerCase() || null,
      notes: notes.trim() || null,
    };
    const q = contact
      ? supabase.from('contacts').update(payload).eq('id', contact.id).select().single()
      : supabase.from('contacts').insert({ ...payload, owner_id: ownerId }).select().single();
    const { data, error: err } = await q;
    setBusy(false);
    if (err) return setError(err.code === '23505' ? 'איש קשר מאותו סוג בשם הזה כבר קיים' : err.message);
    await reloadContacts();
    toast(contact ? 'איש הקשר עודכן' : 'איש הקשר נוסף');
    onSaved?.(data);
    onClose();
  };

  return (
    <Modal
      title={contact ? 'עריכת איש קשר' : 'איש קשר חדש'}
      onClose={onClose}
      dismissable={!busy}
      footer={
        <div className="flex gap-2">
          <button type="submit" form="contact-form" className="btn-primary flex-1" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />} שמירה
          </button>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            ביטול
          </button>
        </div>
      }
    >
      <form id="contact-form" onSubmit={submit} className="space-y-4">
        <Segmented value={kind} onChange={setKind} options={KINDS} className="w-full" />
        <div>
          <label className="label" htmlFor="c-name">שם</label>
          <input id="c-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="c-phone">טלפון</label>
            <input id="c-phone" className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} dir="ltr" style={{ textAlign: 'right' }} />
          </div>
          <div>
            <label className="label" htmlFor="c-email">אימייל</label>
            <input id="c-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="c-notes">הערות</label>
          <textarea id="c-notes" className="input !py-2.5" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </div>
        <ErrorBox>{error}</ErrorBox>
      </form>
    </Modal>
  );
}
