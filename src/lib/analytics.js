import { addDays, fromISO, pad, toISO } from './format.js';

export const NO_CATEGORY = 'ללא קטגוריה';
export const NO_CATEGORY_COLOR = '#94a3b8';

export function sumTotals(txs) {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

/** Exact aggregated totals per category for one transaction type, largest first. */
export function byCategory(txs, type) {
  const map = new Map();
  let total = 0;
  for (const t of txs) {
    if (t.type !== type) continue;
    const key = t.category_id || 'none';
    let row = map.get(key);
    if (!row) {
      row = {
        id: key,
        name: t.categories?.name || NO_CATEGORY,
        color: t.categories?.color || NO_CATEGORY_COLOR,
        value: 0,
        count: 0,
      };
      map.set(key, row);
    }
    row.value += t.amount;
    row.count += 1;
    total += t.amount;
  }
  return [...map.values()]
    .map((r) => ({ ...r, value: Math.round(r.value * 100) / 100, pct: total ? (r.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

/** Income/expense per day (short ranges) or per month (long ranges). */
export function timeSeries(txs, range) {
  const dates = txs.map((t) => t.tx_date).sort();
  const from = range.from || dates[0];
  const to = range.to || dates[dates.length - 1];
  if (!from || !to) return [];

  const f = fromISO(from);
  const t = fromISO(to);
  const days = Math.round((t - f) / 86400000) + 1;
  const monthly = days > 62;
  const buckets = new Map();

  if (monthly) {
    let cur = new Date(f.getFullYear(), f.getMonth(), 1);
    while (cur <= t) {
      const key = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}`;
      buckets.set(key, {
        label: cur.toLocaleDateString('he-IL', { month: 'short', year: days > 400 ? '2-digit' : undefined }),
        income: 0,
        expense: 0,
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  } else {
    for (let i = 0; i < days; i++) {
      const d = addDays(f, i);
      buckets.set(toISO(d), {
        label:
          days <= 7
            ? d.toLocaleDateString('he-IL', { weekday: 'short' })
            : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
        income: 0,
        expense: 0,
      });
    }
  }

  for (const tx of txs) {
    const b = buckets.get(monthly ? tx.tx_date.slice(0, 7) : tx.tx_date);
    if (!b) continue;
    b[tx.type] += tx.amount;
  }
  return [...buckets.values()].map((b) => ({
    ...b,
    income: Math.round(b.income * 100) / 100,
    expense: Math.round(b.expense * 100) / 100,
  }));
}
