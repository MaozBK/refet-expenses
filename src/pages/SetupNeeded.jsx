import { Database } from 'lucide-react';

export default function SetupNeeded() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="card max-w-lg !p-7">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <Database className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold">נדרש חיבור ל-Supabase</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          האפליקציה עדיין לא מחוברת לבסיס נתונים. כדי להפעיל אותה:
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 ps-5 text-sm leading-6 text-slate-700">
          <li>צרו פרויקט חינמי ב-supabase.com.</li>
          <li>
            הריצו את הקובץ <code dir="ltr" className="rounded bg-slate-100 px-1">supabase/migrations/20250101000000_init.sql</code> ב-SQL Editor.
          </li>
          <li>
            העתיקו את <code dir="ltr" className="rounded bg-slate-100 px-1">.env.example</code> ל-<code dir="ltr" className="rounded bg-slate-100 px-1">.env</code> ומלאו את
            כתובת הפרויקט ומפתח ה-anon.
          </li>
          <li>הפעילו מחדש את שרת הפיתוח (npm run dev).</li>
        </ol>
        <p className="mt-3 text-sm text-slate-500">הוראות מלאות נמצאות בקובץ README.md.</p>
      </div>
    </div>
  );
}
