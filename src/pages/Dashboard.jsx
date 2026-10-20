import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownCircle, ArrowUpCircle, PieChart as PieIcon, Wallet } from 'lucide-react';
import PeriodPicker from '../components/PeriodPicker.jsx';
import { Empty, ErrorBox, PageLoader, Segmented } from '../components/ui.jsx';
import { usePeriod } from '../hooks/usePeriod.js';
import { useTransactions } from '../hooks/useTransactions.js';
import { byCategory, sumTotals, timeSeries } from '../lib/analytics.js';
import { formatCompact, formatILS, formatPct } from '../lib/format.js';

function Stat({ icon: Icon, label, value, tone }) {
  const tones = {
    green: 'bg-brand-50 text-brand-700',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-sky-50 text-sky-700',
  };
  return (
    <div className="card flex items-center gap-3 !p-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="truncate text-xl font-extrabold text-slate-900" dir="ltr" style={{ textAlign: 'right' }}>
          {value}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const period = usePeriod('month');
  const { txs, loading, error } = useTransactions(period.range);
  const [pieType, setPieType] = useState('expense');

  const totals = useMemo(() => sumTotals(txs), [txs]);
  const series = useMemo(() => timeSeries(txs, period.range), [txs, period.range]);
  const cats = useMemo(() => byCategory(txs, pieType), [txs, pieType]);
  const pieTotal = pieType === 'expense' ? totals.expense : totals.income;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">סקירה כללית</h1>
      <PeriodPicker period={period} />
      <ErrorBox>{error}</ErrorBox>

      {loading ? (
        <PageLoader />
      ) : (
        <div className="animate-rise space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat icon={ArrowUpCircle} label="הכנסות" value={formatILS(totals.income)} tone="green" />
            <Stat icon={ArrowDownCircle} label="הוצאות" value={formatILS(totals.expense)} tone="red" />
            <Stat icon={Wallet} label={totals.net >= 0 ? 'רווח' : 'הפסד'} value={formatILS(totals.net)} tone="blue" />
          </div>

          {txs.length === 0 ? (
            <div className="card">
              <Empty icon={PieIcon} title="אין תנועות בתקופה זו" hint="הוסיפו הוצאה או הכנסה כדי לראות כאן גרפים וסיכומים." />
            </div>
          ) : (
            <>
              <section className="card">
                <h2 className="mb-3 font-bold">הכנסות והוצאות לאורך זמן</h2>
                <div dir="ltr" className="h-64 w-full">
                  <ResponsiveContainer>
                    <BarChart data={series} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={formatCompact} width={48} />
                      <Tooltip
                        cursor={{ fill: 'rgba(148,163,184,.12)' }}
                        formatter={(v, n) => [formatILS(v), n]}
                        contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)', direction: 'rtl' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="income" name="הכנסות" fill="#2f7d32" radius={[6, 6, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="expense" name="הוצאות" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="card">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold">פילוח לפי קטגוריות</h2>
                  <Segmented
                    value={pieType}
                    onChange={setPieType}
                    options={[
                      { value: 'expense', label: 'הוצאות' },
                      { value: 'income', label: 'הכנסות' },
                    ]}
                  />
                </div>
                {cats.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">אין {pieType === 'expense' ? 'הוצאות' : 'הכנסות'} בתקופה זו.</p>
                ) : (
                  <div className="grid items-center gap-6 md:grid-cols-2">
                    <div dir="ltr" className="relative mx-auto h-64 w-full max-w-xs">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={cats} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="90%" paddingAngle={2} stroke="none">
                            {cats.map((c) => (
                              <Cell key={c.id} fill={c.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(v, n) => [formatILS(v), n]}
                            contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.12)', direction: 'rtl' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xs text-slate-500">סה״כ</span>
                        <span className="text-lg font-extrabold">{formatILS(pieTotal)}</span>
                      </div>
                    </div>
                    <ul className="space-y-2.5">
                      {cats.map((c) => (
                        <li key={c.id}>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
                              <span className="truncate font-medium">{c.name}</span>
                            </span>
                            <span className="shrink-0 font-bold">{formatILS(c.value)}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="card overflow-hidden !p-0">
                <h2 className="px-5 pb-2 pt-4 font-bold">סיכום מדויק לפי קטגוריה</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-2 text-start font-medium">קטגוריה</th>
                        <th className="px-3 py-2 text-start font-medium">תנועות</th>
                        <th className="px-3 py-2 text-start font-medium">אחוז</th>
                        <th className="px-5 py-2 text-end font-medium">סכום</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cats.map((c) => (
                        <tr key={c.id}>
                          <td className="px-5 py-2.5">
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                              {c.name}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{c.count}</td>
                          <td className="px-3 py-2.5 text-slate-600">{formatPct(c.pct)}</td>
                          <td className="px-5 py-2.5 text-end font-bold">{formatILS(c.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold">
                      <tr>
                        <td className="px-5 py-2.5" colSpan={3}>
                          סה״כ {pieType === 'expense' ? 'הוצאות' : 'הכנסות'}
                        </td>
                        <td className="px-5 py-2.5 text-end">{formatILS(pieTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
