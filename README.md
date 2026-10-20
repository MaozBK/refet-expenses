# ניהול רפת – הוצאות והכנסות (PWA)

אפליקציית ווב מותקנת (PWA) בעברית מלאה (RTL) לרפתנים: רישום הוצאות והכנסות, צירוף תמונות קבלות, גרפים וניתוח, ודוח PDF לרואה החשבון.
**Stack:** React + Vite + Tailwind · Recharts · Supabase (Auth, Postgres, Storage, RLS) · vite-plugin-pwa.

## הפעלה

### 1. Supabase (תוכנית חינמית)
1. צרו פרויקט ב-[supabase.com](https://supabase.com).
2. **SQL Editor → New query**: הדביקו והריצו את [`supabase/migrations/20250101000000_init.sql`](supabase/migrations/20250101000000_init.sql).
   הסקריפט יוצר טבלאות, אינדקסים, מדיניות RLS, bucket פרטי בשם `receipts` עם מדיניות Storage, קטגוריות ברירת מחדל ופונקציית מחיקת חשבון. אפשר להריץ אותו שוב בבטחה.
3. **Authentication → Providers**: Email מופעל כברירת מחדל. להפעלת Google: Providers → Google → הדביקו Client ID/Secret מ-Google Cloud Console (OAuth client מסוג Web; ב-Authorized redirect URI הכניסו את הכתובת שמופיעה ב-Supabase).
4. **Authentication → URL Configuration**: הגדירו `Site URL` ל-URL של האתר (בפיתוח: `http://localhost:5173`) והוסיפו אותו גם ל-`Redirect URLs` (נדרש לאימות אימייל, איפוס סיסמה ו-Google).
5. **Project Settings → API**: העתיקו את `Project URL` ו-`anon public key`.

### 2. הרצה מקומית
```bash
npm install
cp .env.example .env     # מלאו את VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY
npm run dev
```

### 3. פריסה
`npm run build` יוצר את `dist/`. אפשר לפרוס ב-Vercel / Netlify / Cloudflare Pages (קבצי fallback ל-SPA כלולים: `vercel.json`, `public/_redirects`). הגדירו את שני משתני הסביבה בשירות האירוח, ועדכנו את ה-Site URL ב-Supabase לכתובת הסופית. נדרש HTTPS כדי שההתקנה כאפליקציה תעבוד.

### 4. התקנה בטלפון
פתחו את האתר ב-Safari (iOS) → שיתוף → **הוסף למסך הבית**, או ב-Chrome (Android) → תפריט → **התקנת אפליקציה**.

## מבנה הפרויקט
```
supabase/migrations/…init.sql   סכמה, RLS, Storage, פונקציות
scripts/generate-icons.mjs      יוצר את אייקוני ה-PWA (npm run icons)
src/
  lib/       supabase, api (CRUD), images (דחיסה/העלאה/signed URLs), analytics, format, pdf
  context/   Auth, Farm (חווה פעילה/קטגוריות/הרשאות), UI (toast/טופס/רענון)
  hooks/     usePeriod, useTransactions, useSignedUrls
  components/ Layout, TransactionForm, PeriodPicker, ReceiptViewer, ReportPages, ui
  pages/     Auth, Dashboard, Transactions, Reports, Settings, SetupNeeded
```

## אבטחה ופרטיות
* **RLS על כל הטבלאות.** משתמש קורא/כותב/מוחק רק נתוני חווה שהוא הבעלים שלה, או חווה ששותפה איתו (`farm_members`) – כשהרשאת "צפייה" אינה מאפשרת כתיבה.
* **קבלות ב-bucket פרטי**; הצגה דרך signed URLs קצרי-תוקף. מדיניות Storage בודקת שתיקיית הקובץ (`<owner_id>/…`) שייכת למשתמש או לחווה משותפת.
* מפתח ה-`anon` בצד הלקוח בטוח לחשיפה כל עוד RLS פעיל. **אין להכניס `service_role` לקוד הלקוח.**

## הערות
* **מחיקת חשבון:** הלקוח מוחק את קבצי התמונות דרך Storage API, ואז קורא ל-`delete_my_account()` שמוחקת את משתמש ה-Auth – וכל השורות נמחקות בקסקדה.
* **שיתוף:** בעל החווה מזין אימייל והרשאה (צפייה / עריכה). המוזמן מתחבר עם אותו אימייל ורואה בורר חוות בראש המסך.
* **דוח PDF:** נבנה בדפדפן (html2canvas + jsPDF): עמודי סיכום ופירוט, ואחריהם עמוד לכל קבלה באיכות גבוהה עם כותרת. בטלפון "שיתוף הקובץ" מצרף את ה-PDF ישירות לוואטסאפ/מייל (Web Share API); במחשב מורידים וצורפים ידנית. אפשר גם לייצא CSV לאקסל.
* תמונות נדחסות בצד הלקוח (עד 2400px) לפני ההעלאה; מגבלת הקובץ ב-bucket היא 10MB.
