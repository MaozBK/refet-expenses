import { useState } from 'react';
import { Mail } from 'lucide-react';
import { hebrewError, useAuth } from '../context/AuthContext.jsx';
import { ErrorBox, Spinner } from '../components/ui.jsx';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}

export default function Auth() {
  const { signIn, signUp, signInWithGoogle, resetPassword, recovery, updatePassword, clearRecovery } = useAuth();
  const [mode, setMode] = useState('signin'); // signin | signup | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const run = async (fn) => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(hebrewError(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      if (recovery) {
        if (password.length < 6) throw new Error('Password should be at least 6');
        const { error: err } = await updatePassword(password);
        if (err) throw err;
        clearRecovery();
        return;
      }
      if (mode === 'signin') {
        const { error: err } = await signIn(email.trim(), password);
        if (err) throw err;
      } else if (mode === 'signup') {
        if (password.length < 6) throw new Error('Password should be at least 6');
        const { data, error: err } = await signUp(email.trim(), password, name.trim());
        if (err) throw err;
        if (!data.session) setInfo('נשלח אליכם אימייל אימות. לחצו על הקישור ואז התחברו.');
      } else {
        const { error: err } = await resetPassword(email.trim());
        if (err) throw err;
        setInfo('אם החשבון קיים, נשלח אליכם קישור לאיפוס הסיסמה.');
      }
    });
  };

  const title = recovery ? 'בחירת סיסמה חדשה' : { signin: 'התחברות', signup: 'יצירת חשבון', reset: 'איפוס סיסמה' }[mode];

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-brand-50 to-cream px-4 py-10">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-6 text-center">
          <img src="/pwa-192.png" alt="" className="mx-auto h-20 w-20 rounded-3xl shadow-lg shadow-brand-700/20" />
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">ניהול הרפת</h1>
          <p className="mt-1 text-sm text-slate-500">הוצאות, הכנסות וקבלות – הכול במקום אחד</p>
        </div>

        <div className="card !p-6">
          <h2 className="mb-4 text-lg font-bold">{title}</h2>

          {!recovery && mode !== 'reset' && (
            <>
              <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => run(async () => {
                const { error: err } = await signInWithGoogle();
                if (err) throw err;
              })}>
                <GoogleIcon /> המשך עם Google
              </button>
              <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" /> או עם אימייל <span className="h-px flex-1 bg-slate-200" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-3.5">
            {mode === 'signup' && !recovery && (
              <div>
                <label className="label" htmlFor="name">שם מלא</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </div>
            )}
            {!recovery && (
              <div>
                <label className="label" htmlFor="email">אימייל</label>
                <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </div>
            )}
            {mode !== 'reset' && (
              <div>
                <label className="label" htmlFor="password">{recovery ? 'סיסמה חדשה' : 'סיסמה'}</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' && !recovery ? 'current-password' : 'new-password'}
                  minLength={6}
                  required
                />
              </div>
            )}

            <ErrorBox>{error}</ErrorBox>
            {info && (
              <div className="flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-brand-200">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" /> {info}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />}
              {recovery ? 'עדכון סיסמה' : { signin: 'התחברות', signup: 'יצירת חשבון', reset: 'שליחת קישור' }[mode]}
            </button>
          </form>

          {!recovery && (
            <div className="mt-4 space-y-2 text-center text-sm">
              {mode === 'signin' && (
                <>
                  <button type="button" className="font-semibold text-slate-500 hover:text-slate-800" onClick={() => { setMode('reset'); setError(''); setInfo(''); }}>
                    שכחתי סיסמה
                  </button>
                  <p className="text-slate-500">
                    אין לכם חשבון?{' '}
                    <button type="button" className="font-bold text-brand-700" onClick={() => { setMode('signup'); setError(''); setInfo(''); }}>
                      הרשמה
                    </button>
                  </p>
                </>
              )}
              {mode !== 'signin' && (
                <button type="button" className="font-bold text-brand-700" onClick={() => { setMode('signin'); setError(''); setInfo(''); }}>
                  חזרה להתחברות
                </button>
              )}
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">ההתחברות נשמרת במכשיר – תתחברו פעם אחת בלבד.</p>
      </div>
    </div>
  );
}
