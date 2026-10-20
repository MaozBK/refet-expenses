import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Mail, MessageCircle, Share2 } from 'lucide-react';
import PeriodPicker from '../components/PeriodPicker.jsx';
import ReportPages from '../components/ReportPages.jsx';
import { ErrorBox, PageLoader, Segmented, Spinner } from '../components/ui.jsx';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { usePeriod } from '../hooks/usePeriod.js';
import { useTransactions } from '../hooks/useTransactions.js';
import { NO_CATEGORY, byCategory, sumTotals } from '../lib/analytics.js';
import { formatDate, formatILS } from '../lib/format.js';
import { getSignedUrls } from '../lib/images.js';
import { buildPdf } from '../lib/pdf.js';

const EMAIL_KEY = 'refet.accountantEmail';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export default function Reports() {
  const period = usePeriod('month');
  const { txs, loading, error } = useTransactions(period.range);
  const { farmName } = useFarm();
  const { toast } = useUI();

  const [typeFilter, setTypeFilter] = useState('all');
  const [withReceipts, setWithReceipts] = useState(true);
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(EMAIL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [job, setJob] = useState(null); // { receipts }
  const [progress, setProgress] = useState('');
  const [pdf, setPdf] = useState(null); // { blob, filename, pages, missing }
  const [genError, setGenError] = useState('');
  const hostRef = useRef(null);

  const rows = useMemo(
    () =>
      txs
        .filter((t) => typeFilter === 'all' || t.type === typeFilter)
        .sort((a, b) => a.tx_date.localeCompare(b.tx_date) || a.created_at.localeCompare(b.created_at)),
    [txs, typeFilter],
  );
  const totals = useMemo(() => sumTotals(rows), [rows]);
  const imageCount = useMemo(() => rows.reduce((n, t) => n + (t.transaction_images?.length || 0), 0), [rows]);

  // a new selection invalidates a previously built PDF
  useEffect(() => setPdf(null), [rows, withReceipts]);

  const summaryText = useMemo(() => {
    const lines = [
      `דוח הוצאות והכנסות – ${farmName}`,
      `תקופה: ${period.label}`,
      `הכנסות: ${formatILS(totals.income)}`,
      `הוצאות: ${formatILS(totals.expense)}`,
      `${totals.net >= 0 ? 'רווח' : 'הפסד'}: ${formatILS(totals.net)}`,
      `מספר תנועות: ${rows.length}`,
    ];
    return lines.join('\n');
  }, [farmName, period.label, totals, rows.length]);

  const filename = `report-${period.range.from || 'all'}_${period.range.to || 'all'}.pdf`;

  const start = async () => {
    setGenError('');
    setPdf(null);
    try {
      setProgress('מכין קבלות…');
      const wanted = withReceipts ? rows.flatMap((t) => (t.transaction_images || []).map((i) => ({ path: i.path, tx: t }))) : [];
      const urls = wanted.length ? await getSignedUrls(wanted.map((w) => w.path), 3600) : {};
      const receipts = wanted
        .filter((w) => urls[w.path])
        .map((w, i, arr) => ({ key: w.path, url: urls[w.path], index: i + 1, total: arr.length, tx: w.tx }));
      setJob({ receipts });
    } catch (e) {
      setGenError(e.message || 'יצירת הדוח נכשלה');
      setProgress('');
    }
  };

  useEffect(() => {
    if (!job) return undefined;
    let off = false;
    (async () => {
      try {
        await document.fonts?.ready;
        await new Promise((r) => setTimeout(r, 250)); // let the off-screen pages lay out
        const { blob, pages, missing } = await buildPdf(hostRef.current, (i, n) => !off && setProgress(`מעבד עמוד ${i} מתוך ${n}…`));
        if (!off) {
          setPdf({ blob, filename, pages, missing });
          if (missing) toast(`${missing} תמונות לא נטענו ולא נכללו בדוח`, 'error');
        }
      } catch (e) {
        if (!off) setGenError(e.message || 'יצירת הדוח נכשלה');
      } finally {
        if (!off) {
          setJob(null);
          setProgress('');
        }
      }
    })();
    return () => {
      off = true;
    };
  }, [job]); // eslint-disable-line react-hooks/exhaustive-deps

  const share = async () => {
    const file = new File([pdf.blob], pdf.filename, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `דוח – ${farmName}`, text: summaryText });
      } catch (e) {
        if (e.name !== 'AbortError') toast('השיתוף נכשל', 'error');
      }
    } else {
      downloadBlob(pdf.blob, pdf.filename);
      toast('הדפדפן אינו תומך בשיתוף קבצים – הקובץ ירד למכשיר, צרפו אותו להודעה');
    }
  };

  const exportCsv = () => {
    const header = ['תאריך', 'סוג', 'קטגוריה', 'ספק/לקוח', 'סכום', 'הערות', 'מספר תמונות'];
    const lines = rows.map((t) =>
      [
        formatDate(t.tx_date),
        t.type === 'income' ? 'הכנסה' : 'הוצאה',
        t.categories?.name || NO_CATEGORY,
        t.vendor,
        t.amount.toFixed(2),
        t.notes,
        t.transaction_images?.length || 0,
      ]
        .map(csvCell)
        .join(','),
    );
    const blob = new Blob(['﻿' + [header.map(csvCell).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, filename.replace('.pdf', '.csv'));
  };

  const catRows = useMemo(() => byCategory(rows, 'expense'), [rows]);
  const busy = Boolean(job) || Boolean(progress);
  const mailto = `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(`דוח הוצאות והכנסות – ${farmName} – ${period.label}`)}&body=${encodeURIComponent(
    `${summaryText}\n\n(מצורף קובץ PDF עם פירוט התנועות והקבלות)`,
  )}`;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">דוח לרואה החשבון</h1>
      <PeriodPicker period={period} />
      <ErrorBox>{error}</ErrorBox>

      {loading ? (
        <PageLoader />
      ) : (
        <div className="animate-rise space-y-5">
          <section className="card space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold">מה לכלול בדוח</h2>
              <Segmented
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { value: 'all', label: 'הכל' },
                  { value: 'expense', label: 'הוצאות' },
                  { value: 'income', label: 'הכנסות' },
                ]}
              />
            </div>
            <label className="flex min-h-[44px] items-center gap-3 rounded-xl bg-slate-50 px-4">
              <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={withReceipts} onChange={(e) => setWithReceipts(e.target.checked)} />
              <span className="text-sm font-medium">לצרף עמודי קבלות באיכות גבוהה ({imageCount} תמונות)</span>
            </label>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-brand-50 p-2">
                <div className="text-[11px] text-brand-800">הכנסות</div>
                <div className="text-sm font-extrabold text-brand-800">{formatILS(totals.income)}</div>
              </div>
              <div className="rounded-xl bg-red-50 p-2">
                <div className="text-[11px] text-red-700">הוצאות</div>
                <div className="text-sm font-extrabold text-red-700">{formatILS(totals.expense)}</div>
              </div>
              <div className="rounded-xl bg-slate-100 p-2">
                <div className="text-[11px] text-slate-600">{rows.length} תנועות</div>
                <div className="text-sm font-extrabold">{formatILS(totals.net)}</div>
              </div>
            </div>

            {catRows.length > 0 && (
              <ul className="divide-y divide-slate-100 text-sm">
                {catRows.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      {c.name} <span className="text-xs text-slate-400">({c.count})</span>
                    </span>
                    <span className="font-bold">{formatILS(c.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-3">
            <button type="button" className="btn-primary w-full !min-h-[52px] text-base" onClick={start} disabled={busy || rows.length === 0}>
              {busy ? <Spinner className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              {busy ? progress || 'מייצר דוח…' : 'יצירת דוח PDF'}
            </button>
            {rows.length === 0 && <p className="text-center text-sm text-slate-500">אין תנועות להצגה בתקופה זו.</p>}
            <ErrorBox>{genError}</ErrorBox>

            {pdf && (
              <div className="animate-rise space-y-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-200">
                <p className="text-sm font-semibold text-brand-900">
                  הדוח מוכן · {pdf.pages} עמודים · {(pdf.blob.size / 1024 / 1024).toFixed(1)}MB
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn-primary" onClick={() => downloadBlob(pdf.blob, pdf.filename)}>
                    <Download className="h-4 w-4" /> הורדה
                  </button>
                  <button type="button" className="btn-secondary" onClick={share}>
                    <Share2 className="h-4 w-4" /> שיתוף הקובץ
                  </button>
                </div>
                <div>
                  <label className="label" htmlFor="acc-email">
                    אימייל רואה החשבון
                  </label>
                  <input
                    id="acc-email"
                    className="input"
                    type="email"
                    placeholder="accountant@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      try {
                        localStorage.setItem(EMAIL_KEY, e.target.value);
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <a className="btn-secondary" href={mailto}>
                    <Mail className="h-4 w-4" /> מייל
                  </a>
                  <a className="btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(summaryText)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" /> וואטסאפ
                  </a>
                </div>
                <p className="text-xs leading-5 text-slate-600">
                  בטלפון, "שיתוף הקובץ" מצרף את ה-PDF ישירות להודעה (וואטסאפ / מייל). במחשב – הורידו את הקובץ וצרפו אותו להודעה שנפתחת בכפתורי מייל/וואטסאפ.
                </p>
              </div>
            )}

            <button type="button" className="btn-secondary w-full" onClick={exportCsv} disabled={rows.length === 0}>
              <FileSpreadsheet className="h-4 w-4" /> ייצוא לאקסל (CSV)
            </button>
          </section>
        </div>
      )}

      {/* off-screen A4 pages that are rasterised into the PDF */}
      {job && (
        <div ref={hostRef} aria-hidden style={{ position: 'absolute', top: 0, left: -20000, width: 794, pointerEvents: 'none' }}>
          <ReportPages farmName={farmName} label={period.label} txs={rows} receipts={job.receipts} />
        </div>
      )}
    </div>
  );
}
