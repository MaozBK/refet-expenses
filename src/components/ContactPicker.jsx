import { useState } from 'react';
import { useFarm } from '../context/FarmContext.jsx';
import { kindLabel } from '../lib/documents.js';
import ContactForm from './ContactForm.jsx';

const NEW = '__new__';

/** Select of the farm's contacts with an inline "new contact" option. */
export default function ContactPicker({ value, onChange, defaultKind = 'customer', emptyLabel = 'ללא', id, canAdd = true }) {
  const { contacts, canWrite } = useFarm();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <select
        id={id}
        className="input"
        value={value || ''}
        onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))}
      >
        <option value="">{emptyLabel}</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {kindLabel(c.kind)}
          </option>
        ))}
        {canAdd && canWrite && <option value={NEW}>＋ איש קשר חדש…</option>}
      </select>
      {adding && (
        <ContactForm preset={{ kind: defaultKind }} onClose={() => setAdding(false)} onSaved={(c) => onChange(c.id)} />
      )}
    </>
  );
}
