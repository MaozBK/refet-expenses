import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovery,
      clearRecovery: () => setRecovery(false),
      signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
      signUp: (email, password, fullName) =>
        supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
        }),
      signInWithGoogle: () =>
        supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }),
      resetPassword: (email) =>
        supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }),
      updatePassword: (password) => supabase.auth.updateUser({ password }),
      signOut: () => supabase.auth.signOut(),
    }),
    [session, loading, recovery],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

const ERRORS = [
  ['Invalid login credentials', 'אימייל או סיסמה שגויים'],
  ['Email not confirmed', 'האימייל טרם אומת – בדקו את תיבת הדואר שלכם'],
  ['User already registered', 'משתמש עם אימייל זה כבר קיים'],
  ['Password should be at least', 'הסיסמה חייבת להכיל לפחות 6 תווים'],
  ['Unable to validate email', 'כתובת האימייל אינה תקינה'],
  ['rate limit', 'יותר מדי ניסיונות – נסו שוב בעוד מספר דקות'],
  ['Failed to fetch', 'אין חיבור לשרת – בדקו את החיבור לאינטרנט'],
  ['New password should be different', 'הסיסמה החדשה חייבת להיות שונה מהקודמת'],
];

export function hebrewError(err) {
  const msg = typeof err === 'string' ? err : err?.message || '';
  const hit = ERRORS.find(([k]) => msg.toLowerCase().includes(k.toLowerCase()));
  return hit ? hit[1] : msg || 'אירעה שגיאה. נסו שוב.';
}
