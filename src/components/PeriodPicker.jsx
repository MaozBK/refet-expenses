import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PERIODS } from '../lib/format.js';
import { Segmented } from './ui.jsx';

/** Week / month / year / all / custom selector with prev-next navigation. In RTL "previous" is on the right. */
export default function PeriodPicker({ period, options = PERIODS }) {
  return (
    <div className="space-y-3">
      <Segmented value={period.type} onChange={period.setType} options={options} className="w-full sm:w-auto" />
      {period.canNavigate && (
        <div className="flex items-center justify-between rounded-2xl bg-white px-1 py-1 ring-1 ring-slate-200">
          <button type="button" className="icon-btn" onClick={period.prev} aria-label="התקופה הקודמת">
            <ChevronRight className="h-5 w-5" />
          </button>
          <button type="button" className="px-3 text-base font-bold text-slate-800" onClick={period.reset} title="חזרה להיום">
            {period.label}
          </button>
          <button type="button" className="icon-btn" onClick={period.next} aria-label="התקופה הבאה">
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>
      )}
      {period.type === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">מתאריך</span>
            <input
              type="date"
              className="input"
              value={period.custom.from || ''}
              max={period.custom.to || undefined}
              onChange={(e) => period.setCustom((c) => ({ ...c, from: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="label">עד תאריך</span>
            <input
              type="date"
              className="input"
              value={period.custom.to || ''}
              min={period.custom.from || undefined}
              onChange={(e) => period.setCustom((c) => ({ ...c, to: e.target.value }))}
            />
          </label>
        </div>
      )}
      {period.type === 'all' && <p className="text-sm text-slate-500">מציג את כל התנועות שנרשמו.</p>}
    </div>
  );
}
