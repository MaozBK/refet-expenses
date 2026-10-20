import { NO_CATEGORY, byCategory, sumTotals } from '../lib/analytics.js';
import { formatDate, formatILS, formatPct } from '../lib/format.js';

// A4 at 96dpi. Fixed pixel sizes keep the rasterised pages crisp and identical on every device.
const PAGE = { width: 794, height: 1123 };
const ROW_H = 34;
const FIRST_PAGE_CAT_ROWS = 12;
const CAT_PAGE_ROWS = 28;
const TX_PAGE_ROWS = 24;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const cut = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

const pageStyle = {
  ...PAGE,
  boxSizing: 'border-box',
  padding: '44px 48px',
  background: '#fff',
  color: '#1e293b',
  fontFamily: 'Heebo, Arial, sans-serif',
  direction: 'rtl',
  overflow: 'hidden',
  position: 'relative',
};
const th = { textAlign: 'right', padding: '0 8px', height: 30, background: '#f1f5f9', fontSize: 12, color: '#475569', fontWeight: 600 };
const td = { padding: '0 8px', height: ROW_H, borderBottom: '1px solid #e2e8f0', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden' };

function Header({ farmName, label, generated }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '3px solid #2f7d32', paddingBottom: 14, marginBottom: 20 }}>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#1e4221' }}>דוח הוצאות והכנסות</div>
        <div style={{ fontSize: 15, marginTop: 4 }}>{farmName}</div>
      </div>
      <div style={{ textAlign: 'left', fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
        <div style={{ fontWeight: 700, color: '#1e293b' }}>{label}</div>
        <div>הופק בתאריך {generated}</div>
      </div>
    </div>
  );
}

function Footer({ n, total }) {
  return (
    <div style={{ position: 'absolute', bottom: 22, left: 48, right: 48, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
      <span>ניהול רפת</span>
      <span>
        עמוד {n} מתוך {total}
      </span>
    </div>
  );
}

function CatTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <thead>
        <tr>
          <th style={{ ...th, width: '34%' }}>קטגוריה</th>
          <th style={{ ...th, width: '16%' }}>סוג</th>
          <th style={{ ...th, width: '14%' }}>תנועות</th>
          <th style={{ ...th, width: '14%' }}>אחוז</th>
          <th style={{ ...th, width: '22%' }}>סכום</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.type}-${r.id}`}>
            <td style={td}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: r.color, marginLeft: 8 }} />
              {cut(r.name, 26)}
            </td>
            <td style={td}>{r.type === 'expense' ? 'הוצאה' : 'הכנסה'}</td>
            <td style={td}>{r.count}</td>
            <td style={td}>{formatPct(r.pct)}</td>
            <td style={{ ...td, fontWeight: 700 }}>{formatILS(r.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Off-screen, pixel-exact A4 pages. `txs` ascending by date.
 * `receipts`: [{ url, index, total, tx }] – caption strips (the photo itself is added by buildPdf).
 */
export default function ReportPages({ farmName, label, txs, receipts }) {
  const totals = sumTotals(txs);
  const generated = formatDate(new Date().toISOString().slice(0, 10));
  const catRows = [
    ...byCategory(txs, 'expense').map((r) => ({ ...r, type: 'expense' })),
    ...byCategory(txs, 'income').map((r) => ({ ...r, type: 'income' })),
  ];

  const firstCats = catRows.slice(0, FIRST_PAGE_CAT_ROWS);
  const extraCatPages = chunk(catRows.slice(FIRST_PAGE_CAT_ROWS), CAT_PAGE_ROWS);
  const txPages = chunk(txs, TX_PAGE_ROWS);
  const summaryPages = 1 + extraCatPages.length + txPages.length;
  let n = 0;
  const num = () => ++n;

  return (
    <div>
      <div data-pdf="page" style={pageStyle}>
        <Header farmName={farmName} label={label} generated={generated} />
        <div style={{ display: 'flex', gap: 14, marginBottom: 26 }}>
          {[
            ['סה״כ הכנסות', totals.income, '#15803d', '#f0fdf4'],
            ['סה״כ הוצאות', totals.expense, '#dc2626', '#fef2f2'],
            [totals.net >= 0 ? 'רווח' : 'הפסד', totals.net, '#0369a1', '#f0f9ff'],
          ].map(([t, v, c, bg]) => (
            <div key={t} style={{ flex: 1, background: bg, borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, color: '#475569' }}>{t}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: c, marginTop: 4, direction: 'ltr', textAlign: 'right' }}>{formatILS(v)}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>סיכום לפי קטגוריות</div>
        {catRows.length ? <CatTable rows={firstCats} /> : <div style={{ color: '#64748b' }}>אין תנועות בתקופה זו.</div>}
        <div style={{ marginTop: 14, fontSize: 12, color: '#64748b' }}>
          {txs.length} תנועות · {receipts.length} קבלות מצורפות בסוף הדוח
        </div>
        <Footer n={num()} total={summaryPages} />
      </div>

      {extraCatPages.map((rows, i) => (
        <div key={`c${i}`} data-pdf="page" style={pageStyle}>
          <Header farmName={farmName} label={label} generated={generated} />
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>סיכום לפי קטגוריות (המשך)</div>
          <CatTable rows={rows} />
          <Footer n={num()} total={summaryPages} />
        </div>
      ))}

      {txPages.map((rows, i) => (
        <div key={`t${i}`} data-pdf="page" style={pageStyle}>
          <Header farmName={farmName} label={label} generated={generated} />
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>פירוט תנועות</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: '13%' }}>תאריך</th>
                <th style={{ ...th, width: '9%' }}>סוג</th>
                <th style={{ ...th, width: '19%' }}>קטגוריה</th>
                <th style={{ ...th, width: '21%' }}>ספק / לקוח</th>
                <th style={{ ...th, width: '22%' }}>הערות</th>
                <th style={{ ...th, width: '16%' }}>סכום</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td style={td}>{formatDate(t.tx_date)}</td>
                  <td style={{ ...td, color: t.type === 'income' ? '#15803d' : '#dc2626', fontWeight: 600 }}>{t.type === 'income' ? 'הכנסה' : 'הוצאה'}</td>
                  <td style={td}>{cut(t.categories?.name || NO_CATEGORY, 16)}</td>
                  <td style={td}>{cut(t.vendor, 18)}</td>
                  <td style={{ ...td, color: '#64748b' }}>{cut(t.notes, 20)}</td>
                  <td style={{ ...td, fontWeight: 700, color: t.type === 'income' ? '#15803d' : '#1e293b' }}>{formatILS(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Footer n={num()} total={summaryPages} />
        </div>
      ))}

      {receipts.map((r) => (
        <div
          key={r.key}
          data-pdf="receipt"
          data-url={r.url}
          style={{ ...pageStyle, height: 92, padding: '16px 40px 10px', borderBottom: '2px solid #2f7d32', overflow: 'visible' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1e4221' }}>
              קבלה {r.index} מתוך {r.total}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, direction: 'ltr' }}>{formatILS(r.tx.amount)}</div>
          </div>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>
            {formatDate(r.tx.tx_date)} · {r.tx.type === 'income' ? 'הכנסה' : 'הוצאה'} · {cut(r.tx.categories?.name || NO_CATEGORY, 24)}
            {r.tx.vendor ? ` · ${cut(r.tx.vendor, 30)}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
