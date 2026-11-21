import { formatDate } from './format.js';

export const DOC_TYPES = [
  { value: 'delivery_note', label: 'תעודת משלוח', short: 'תעודה' },
  { value: 'receipt', label: 'קבלה', short: 'קבלה' },
  { value: 'invoice', label: 'חשבונית', short: 'חשבונית' },
  { value: 'other', label: 'אחר', short: 'אחר' },
];
export const DIRECTIONS = [
  { value: 'incoming', label: 'קיבלתי (מספק)', short: 'התקבל' },
  { value: 'outgoing', label: 'הנפקתי / מכרתי (ללקוח)', short: 'הונפק' },
];
export const DOC_STATUS = {
  received: 'התקבל',
  pending: 'ממתין',
  void: 'לא רלוונטי',
};

export const typeLabel = (v) => DOC_TYPES.find((t) => t.value === v)?.label || v;
export const directionLabel = (v) => DIRECTIONS.find((d) => d.value === v)?.short || v;

export const KINDS = [
  { value: 'customer', label: 'לקוח' },
  { value: 'supplier', label: 'ספק' },
  { value: 'accountant', label: 'הנהלת חשבונות' },
  { value: 'other', label: 'אחר' },
];
export const kindLabel = (v) => KINDS.find((k) => k.value === v)?.label || v;

/** Date used for filtering/sorting a document: its own date, else the day it was uploaded. */
export const docDay = (d) => d.doc_date || (d.created_at || '').slice(0, 10);

export const formatDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${formatDate(iso.slice(0, 10))} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
};

const MAX_GAP = 30;

/**
 * Finds missing serial numbers: for every (contact, type, direction) group whose numbers are plain
 * digits, any number between the lowest and highest that has no document of any status
 * (received / pending / void) is reported. Gaps larger than MAX_GAP are ignored (likely a new book).
 */
export function findGaps(docs) {
  const groups = new Map();
  for (const d of docs) {
    if (!d.contact_id || !d.doc_number || !/^\d{1,9}$/.test(d.doc_number.trim())) continue;
    const key = `${d.contact_id}|${d.doc_type}|${d.direction}`;
    let g = groups.get(key);
    if (!g) {
      g = { contact_id: d.contact_id, doc_type: d.doc_type, direction: d.direction, contact: d.contacts, nums: new Set(), width: 0 };
      groups.set(key, g);
    }
    g.nums.add(Number(d.doc_number));
    g.width = Math.max(g.width, d.doc_number.trim().length);
  }
  const out = [];
  for (const g of groups.values()) {
    const sorted = [...g.nums].sort((a, b) => a - b);
    const missing = [];
    for (let i = 1; i < sorted.length; i++) {
      const diff = sorted[i] - sorted[i - 1];
      if (diff > 1 && diff - 1 <= MAX_GAP) {
        for (let n = sorted[i - 1] + 1; n < sorted[i]; n++) missing.push(String(n).padStart(g.width, '0'));
      }
    }
    if (missing.length) out.push({ ...g, nums: undefined, missing, from: sorted[0], to: sorted[sorted.length - 1] });
  }
  return out.sort((a, b) => b.missing.length - a.missing.length);
}

/** A transaction counts as documented when it has its own photo or a linked received document. */
export function transactionsWithoutReceipt(txs, docs) {
  const linked = new Set(docs.filter((d) => d.transaction_id && d.status === 'received').map((d) => d.transaction_id));
  return txs.filter((t) => !t.no_receipt_needed && !(t.transaction_images || []).length && !linked.has(t.id));
}

export function telHref(phone) {
  const p = (phone || '').replace(/[^\d+]/g, '');
  return p ? `tel:${p}` : null;
}

/** WhatsApp link; Israeli local numbers (05x…) are converted to 972. */
export function waHref(phone, text = '') {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `972${digits.slice(1)}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
