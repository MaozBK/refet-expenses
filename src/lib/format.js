const ILS = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 2,
});
const COMPACT = new Intl.NumberFormat('he-IL', { notation: 'compact', maximumFractionDigits: 1 });

export const formatILS = (n) => ILS.format(Number(n) || 0);
export const formatCompact = (n) => COMPACT.format(Number(n) || 0);
export const formatPct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayISO = () => toISO(new Date());
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const formatDate = (s) =>
  fromISO(s).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const formatDayMonth = (s) =>
  fromISO(s).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });

export const PERIODS = [
  { value: 'week', label: 'שבוע' },
  { value: 'month', label: 'חודש' },
  { value: 'year', label: 'שנה' },
  { value: 'all', label: 'הכל' },
  { value: 'custom', label: 'מותאם' },
];

/** Returns { from, to } as yyyy-mm-dd (or nulls for "all"). Weeks start on Sunday. */
export function getRange(type, anchor, custom) {
  if (type === 'week') {
    const start = addDays(anchor, -anchor.getDay());
    return { from: toISO(start), to: toISO(addDays(start, 6)) };
  }
  if (type === 'month') {
    return {
      from: toISO(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
      to: toISO(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)),
    };
  }
  if (type === 'year') {
    return { from: `${anchor.getFullYear()}-01-01`, to: `${anchor.getFullYear()}-12-31` };
  }
  if (type === 'custom') {
    const from = custom?.from || null;
    const to = custom?.to || null;
    return from && to && from > to ? { from: to, to: from } : { from, to };
  }
  return { from: null, to: null };
}

export function shiftAnchor(type, anchor, dir) {
  if (type === 'week') return addDays(anchor, 7 * dir);
  if (type === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  if (type === 'year') return new Date(anchor.getFullYear() + dir, anchor.getMonth(), 1);
  return anchor;
}

export function periodLabel(type, anchor, custom) {
  const r = getRange(type, anchor, custom);
  if (type === 'week') return `${formatDayMonth(r.from)} – ${formatDate(r.to)}`;
  if (type === 'month') return anchor.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
  if (type === 'year') return String(anchor.getFullYear());
  if (type === 'custom') return r.from && r.to ? `${formatDate(r.from)} – ${formatDate(r.to)}` : 'בחרו טווח תאריכים';
  return 'כל התקופה';
}
