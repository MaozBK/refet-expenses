import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { FileStack, FileText, LayoutDashboard, ListOrdered, Plus, ScanLine, Settings, Users, WalletCards, X } from 'lucide-react';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import DocumentForm from './DocumentForm.jsx';
import TransactionForm from './TransactionForm.jsx';
import { PageLoader } from './ui.jsx';

const NAV = [
  { to: '/', label: 'סקירה', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'תנועות', icon: ListOrdered },
  { to: '/documents', label: 'מסמכים', icon: FileStack },
  { to: '/reports', label: 'דוחות', icon: FileText },
  { to: '/settings', label: 'הגדרות', icon: Settings },
];
const DESKTOP_EXTRA = [{ to: '/contacts', label: 'אנשי קשר', icon: Users }];

function FarmSwitcher({ className = '' }) {
  const { ownerId, sharedFarms, switchFarm, profile, farmName } = useFarm();
  if (!sharedFarms.length) {
    return <div className={`truncate font-bold text-slate-800 ${className}`}>{farmName}</div>;
  }
  return (
    <label className={`flex items-center gap-2 ${className}`}>
      <Users className="h-4 w-4 shrink-0 text-brand-600" />
      <select
        className="min-w-0 flex-1 truncate rounded-lg bg-transparent py-1 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
        value={ownerId}
        onChange={(e) => switchFarm(e.target.value)}
        aria-label="החלפת חווה"
      >
        <option value={profile?.id}>{profile?.farm_name || 'החווה שלי'}</option>
        {sharedFarms.map((f) => (
          <option key={f.owner_id} value={f.owner_id}>
            {f.name} (משותף)
          </option>
        ))}
      </select>
    </label>
  );
}

function AddMenu() {
  const { openForm, openDocForm } = useUI();
  const [open, setOpen] = useState(false);
  const pick = (fn) => () => {
    setOpen(false);
    fn();
  };
  return (
    <>
      {open && <div className="fixed inset-0 z-30 animate-fade bg-slate-900/30" onClick={() => setOpen(false)} />}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] end-4 z-40 flex flex-col items-end gap-3 md:bottom-8 md:end-8">
        {open && (
          <div className="flex animate-rise flex-col items-end gap-2">
            <button type="button" onClick={pick(() => openDocForm())} className="flex h-12 items-center gap-2 rounded-full bg-white px-5 font-bold text-slate-800 shadow-lg ring-1 ring-slate-200">
              <ScanLine className="h-5 w-5 text-brand-600" /> סריקת מסמך / תעודה
            </button>
            <button type="button" onClick={pick(() => openForm())} className="flex h-12 items-center gap-2 rounded-full bg-white px-5 font-bold text-slate-800 shadow-lg ring-1 ring-slate-200">
              <WalletCards className="h-5 w-5 text-brand-600" /> הוצאה / הכנסה
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-14 items-center gap-2 rounded-full bg-brand-600 px-5 text-base font-bold text-white shadow-lg shadow-brand-700/30 transition hover:bg-brand-700 active:scale-95"
          aria-label={open ? 'סגירת תפריט' : 'הוספה'}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          <span>{open ? 'סגירה' : 'הוספה'}</span>
        </button>
      </div>
    </>
  );
}

export default function Layout() {
  const { ready, canWrite, role, isOwner } = useFarm();
  const { formState, closeForm, docFormState, closeDocForm } = useUI();

  if (!ready) return <PageLoader />;

  const sideLink = ({ to, label, icon: Icon, end }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
          isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100'
        }`
      }
    >
      <Icon className="h-5 w-5" /> {label}
    </NavLink>
  );

  return (
    <div className="min-h-dvh">
      {/* desktop sidebar (on the start = right side in RTL) */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-3 px-2 pt-2">
          <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl" />
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-500">ניהול רפת</div>
            <FarmSwitcher />
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.slice(0, 4).map(sideLink)}
          {DESKTOP_EXTRA.map(sideLink)}
          {sideLink(NAV[4])}
        </nav>
        {!isOwner && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            אתם צופים בחווה משותפת – הרשאה: {role === 'editor' ? 'עריכה' : 'צפייה בלבד'}.
          </p>
        )}
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] backdrop-blur md:hidden">
        <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-lg" />
        <FarmSwitcher className="min-w-0 flex-1" />
        {!isOwner && <span className="chip bg-amber-100 text-amber-800">{role === 'editor' ? 'עריכה' : 'צפייה'}</span>}
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-36 pt-4 md:ps-[17rem] md:pe-8 md:pt-8 md:pb-24">
        <Outlet />
      </main>

      {canWrite && <AddMenu />}

      {/* mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
                isActive ? 'text-brand-700' : 'text-slate-500'
              }`
            }
          >
            <Icon className="h-6 w-6" />
            {label}
          </NavLink>
        ))}
      </nav>

      {formState && <TransactionForm tx={formState.tx} onClose={closeForm} />}
      {docFormState && <DocumentForm doc={docFormState.doc} preset={docFormState.preset} onClose={closeDocForm} />}
    </div>
  );
}
