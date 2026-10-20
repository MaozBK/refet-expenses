import { useEffect, useState } from 'react';
import { LogOut, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { ConfirmDialog, ErrorBox, Segmented, Spinner } from '../components/ui.jsx';
import { hebrewError, useAuth } from '../context/AuthContext.jsx';
import { useFarm } from '../context/FarmContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { deleteAccount } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';

const COLORS = ['#16a34a', '#eab308', '#0ea5e9', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b', '#a16207'];
const ROLE_LABEL = { viewer: 'צפייה בלבד', editor: 'צפייה ועריכה' };

function Section({ title, hint, children }) {
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ProfileSection() {
  const { user } = useAuth();
  const { profile, reloadProfile } = useFarm();
  const { toast } = useUI();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [farmName, setFarmName] = useState(profile?.farm_name || '');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() || null, farm_name: farmName.trim() || null })
      .eq('id', user.id);
    setBusy(false);
    if (error) return toast(error.message, 'error');
    await reloadProfile();
    toast('הפרופיל עודכן');
  };

  return (
    <Section title="פרופיל">
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="label" htmlFor="p-name">שם מלא</label>
          <input id="p-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label className="label" htmlFor="p-farm">שם החווה / הרפת</label>
          <input id="p-farm" className="input" value={farmName} onChange={(e) => setFarmName(e.target.value)} maxLength={80} placeholder="יופיע בראש הדוחות" />
        </div>
        <div>
          <span className="label">אימייל</span>
          <div className="input flex items-center bg-slate-50 text-slate-500" dir="ltr">{user.email}</div>
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />} שמירה
        </button>
      </form>
    </Section>
  );
}

function CategoriesSection() {
  const { categories, ownerId, canWrite, reloadCategories } = useFarm();
  const { toast, bump } = useUI();
  const [type, setType] = useState('expense');
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const list = categories.filter((c) => c.type === type);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('categories').insert({ owner_id: ownerId, name: name.trim(), type, color });
    setBusy(false);
    if (error) return toast(error.code === '23505' ? 'קטגוריה בשם זה כבר קיימת' : error.message, 'error');
    setName('');
    reloadCategories();
    toast('הקטגוריה נוספה');
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.from('categories').delete().eq('id', toDelete.id);
    setBusy(false);
    if (error) return toast(error.message, 'error');
    setToDelete(null);
    reloadCategories();
    bump();
    toast('הקטגוריה נמחקה');
  };

  return (
    <Section title="קטגוריות" hint="תנועות בקטגוריה שנמחקה יישארו ללא קטגוריה.">
      <Segmented value={type} onChange={setType} options={[{ value: 'expense', label: 'הוצאות' }, { value: 'income', label: 'הכנסות' }]} />
      <ul className="divide-y divide-slate-100">
        {list.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            <span className="flex items-center gap-2.5 text-sm font-medium">
              <span className="h-4 w-4 rounded-full" style={{ background: c.color }} />
              {c.name}
            </span>
            {canWrite && (
              <button type="button" className="icon-btn hover:!bg-red-50 hover:!text-red-600" onClick={() => setToDelete(c)} aria-label={`מחיקת ${c.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="py-3 text-sm text-slate-500">אין קטגוריות.</li>}
      </ul>
      {canWrite && (
        <form onSubmit={add} className="space-y-3 rounded-2xl bg-slate-50 p-3">
          <input className="input" placeholder="שם קטגוריה חדשה" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <div className="flex flex-wrap items-center gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full transition ${color === c ? 'scale-110 ring-2 ring-slate-800 ring-offset-2' : ''}`}
                style={{ background: c }}
                aria-label={`צבע ${c}`}
              />
            ))}
          </div>
          <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
            <Plus className="h-4 w-4" /> הוספת קטגוריה
          </button>
        </form>
      )}
      {toDelete && (
        <ConfirmDialog
          title="מחיקת קטגוריה"
          message={`למחוק את הקטגוריה "${toDelete.name}"?`}
          busy={busy}
          onCancel={() => setToDelete(null)}
          onConfirm={remove}
          confirmLabel="מחיקה"
        />
      )}
    </Section>
  );
}

function SharingSection() {
  const { user } = useAuth();
  const { isOwner, sharedFarms, reloadFarms, switchFarm, ownerId } = useFarm();
  const { toast } = useUI();
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const { data } = await supabase.from('farm_members').select('*').eq('owner_id', user.id).order('created_at');
    setMembers(data || []);
  };
  useEffect(() => {
    load();
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const invite = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error: err } = await supabase.from('farm_members').insert({ owner_id: user.id, member_email: email.trim(), role });
    setBusy(false);
    if (err) {
      if (err.code === '23505') return setError('המשתמש כבר שותף לחווה');
      if (err.code === '23514' || err.code === '42501') return setError('כתובת אימייל לא תקינה (או האימייל שלכם)');
      return setError(err.message);
    }
    setEmail('');
    load();
    toast('השיתוף נוסף');
  };

  const changeRole = async (m, r) => {
    const { error: err } = await supabase.from('farm_members').update({ role: r }).eq('id', m.id);
    if (err) return toast(err.message, 'error');
    load();
  };
  const removeMember = async (m) => {
    const { error: err } = await supabase.from('farm_members').delete().eq('id', m.id);
    if (err) return toast(err.message, 'error');
    load();
    toast('השיתוף הוסר');
  };
  const leave = async (f) => {
    const { error: err } = await supabase.from('farm_members').delete().eq('owner_id', f.owner_id);
    if (err) return toast(err.message, 'error');
    if (ownerId === f.owner_id) switchFarm(user.id);
    await reloadFarms();
    toast('יצאתם מהחווה המשותפת');
  };

  return (
    <Section
      title="שיתוף נתונים"
      hint="הזמינו שותף, עובד או רואה חשבון לצפות או לנהל את נתוני החווה. הם יתחברו עם האימייל שהזנתם."
    >
      {isOwner ? (
        <>
          <form onSubmit={invite} className="space-y-3">
            <input className="input" type="email" placeholder="אימייל של המוזמן/ת" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Segmented value={role} onChange={setRole} options={[{ value: 'viewer', label: 'צפייה בלבד' }, { value: 'editor', label: 'צפייה ועריכה' }]} className="w-full" />
            <ErrorBox>{error}</ErrorBox>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} הוספת שותף
            </button>
          </form>
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0 truncate text-sm font-medium" dir="ltr">{m.member_email}</span>
                <span className="flex items-center gap-1">
                  <select className="rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-semibold" value={m.role} onChange={(e) => changeRole(m, e.target.value)}>
                    <option value="viewer">{ROLE_LABEL.viewer}</option>
                    <option value="editor">{ROLE_LABEL.editor}</option>
                  </select>
                  <button type="button" className="icon-btn hover:!bg-red-50 hover:!text-red-600" onClick={() => removeMember(m)} aria-label="הסרת שותף">
                    <X className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
            {members.length === 0 && <li className="py-3 text-sm text-slate-500">עדיין לא שיתפתם את החווה עם אף אחד.</li>}
          </ul>
        </>
      ) : (
        <p className="text-sm text-slate-500">ניהול השיתוף זמין רק לבעל החווה. עברו לחווה שלכם דרך הבורר שבראש המסך.</p>
      )}

      {sharedFarms.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold">חוות ששותפו איתכם</h3>
          <ul className="divide-y divide-slate-100">
            {sharedFarms.map((f) => (
              <li key={f.owner_id} className="flex items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{f.name}</span>
                  <span className="text-xs text-slate-500">{ROLE_LABEL[f.role]}</span>
                </span>
                <span className="flex gap-1">
                  <button type="button" className="btn-secondary !min-h-[36px] !px-3" onClick={() => switchFarm(f.owner_id)}>
                    מעבר
                  </button>
                  <button type="button" className="btn-ghost !min-h-[36px] !px-3 !text-red-600" onClick={() => leave(f)}>
                    יציאה
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function DangerSection() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteAccount(user.id);
      await signOut();
    } catch (e) {
      setError(hebrewError(e));
      setBusy(false);
    }
  };

  return (
    <>
      <Section title="חשבון">
        <button type="button" className="btn-secondary w-full" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" /> התנתקות
        </button>
        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
          <h3 className="font-bold text-red-700">מחיקת חשבון</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            פעולה זו תמחק לצמיתות את החשבון שלכם, את כל התנועות, הקטגוריות וכל תמונות הקבלות. לא ניתן לשחזר.
          </p>
          <button type="button" className="btn-danger mt-3" onClick={() => { setOpen(true); setText(''); setError(''); }}>
            <Trash2 className="h-4 w-4" /> מחיקת החשבון שלי
          </button>
        </div>
      </Section>
      {open && (
        <ConfirmDialog
          title="מחיקת חשבון לצמיתות"
          confirmLabel="מחיקה סופית"
          busy={busy}
          onCancel={() => setOpen(false)}
          onConfirm={() => text.trim() === 'מחק' && remove()}
          message="כל הנתונים והתמונות שלכם יימחקו מיידית ולא ניתן יהיה לשחזרם."
        >
          <label className="label mt-3" htmlFor="del-confirm">להמשך, הקלידו את המילה "מחק":</label>
          <input id="del-confirm" className="input" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          {text.trim() !== 'מחק' && text.length > 0 && <p className="mt-1 text-xs text-slate-500">יש להקליד בדיוק: מחק</p>}
          <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>
        </ConfirmDialog>
      )}
    </>
  );
}

export default function Settings() {
  const { isOwner } = useFarm();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-slate-900">הגדרות</h1>
      {isOwner && <ProfileSection />}
      <CategoriesSection />
      <SharingSection />
      <DangerSection />
    </div>
  );
}
