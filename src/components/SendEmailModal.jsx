import { useMemo, useState } from 'react';
import { CheckCircle2, Mail, Paperclip } from 'lucide-react';
import { ErrorBox, Modal, Spinner } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFarm } from '../context/FarmContext.jsx';
import { EMAIL_ERRORS, sendExportEmail, uploadExport } from '../lib/api.js';
import { kindLabel } from '../lib/documents.js';

const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;

/**
 * Sends a package by e-mail from inside the app.
 * `buildFile()` → { blob, filename, contentType } (the ZIP / PDF to attach), or null for a text-only mail.
 */
export default function SendEmailModal({ defaultSubject, defaultMessage = '', buildFile, fileLabel, onClose }) {
  const { user } = useAuth();
  const { ownerId, contacts, profile } = useFarm();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [phase, setPhase] = useState(''); // '' | building | uploading | sending | done
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const withEmail = useMemo(() => contacts.filter((c) => c.email), [contacts]);
  const recipients = to.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const addRecipient = (email) => {
    if (!recipients.includes(email)) setTo((t) => (t.trim() ? `${t.trim()}, ${email}` : email));
  };
  const busy = Boolean(phase) && phase !== 'done';

  const send = async (e) => {
    e.preventDefault();
    setError('');
    if (!recipients.length || recipients.length > 5 || !recipients.every((r) => EMAIL_RE.test(r))) {
      return setError('הזינו עד 5 כתובות אימייל תקינות, מופרדות בפסיק');
    }
    try {
      let exportPath;
      let filename;
      if (buildFile) {
        setPhase('building');
        const f = await buildFile();
        if (f) {
          setPhase('uploading');
          filename = f.filename;
          exportPath = await uploadExport(ownerId, f.blob, f.filename.split('.').pop(), f.contentType);
        }
      }
      setPhase('sending');
      const out = await sendExportEmail({
        to: recipients,
        subject,
        message,
        export_path: exportPath,
        filename,
        sender_name: profile?.farm_name || profile?.full_name || '',
      });
      setResult(out);
      setPhase('done');
    } catch (err) {
      setPhase('');
      const base = EMAIL_ERRORS[err.code] || err.message || 'השליחה נכשלה';
      setError(err.detail ? `${base} (${err.detail})` : base);
    }
  };

  const phaseLabel = { building: 'בונה את הקובץ…', uploading: 'מעלה…', sending: 'שולח…' }[phase];

  return (
    <Modal
      title="שליחה במייל"
      onClose={onClose}
      dismissable={!busy}
      footer={
        phase === 'done' ? (
          <button type="button" className="btn-primary w-full" onClick={onClose}>סגירה</button>
        ) : (
          <div className="flex gap-2">
            <button type="submit" form="send-form" className="btn-primary flex-1" disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : <Mail className="h-4 w-4" />} {phaseLabel || 'שליחה'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>ביטול</button>
          </div>
        )
      }
    >
      {phase === 'done' ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-brand-600" />
          <p className="text-lg font-bold">המייל נשלח</p>
          <p className="text-sm text-slate-600">
            נשלח אל {recipients.join(', ')}.
            {result?.attached && ' הקובץ צורף למייל.'}
            {result?.linked && ' הקבצים גדולים – נשלח קישור להורדה בתוקף 7 ימים.'}
            {' '}תשובות יגיעו אל {user.email}.
          </p>
        </div>
      ) : (
        <form id="send-form" onSubmit={send} className="space-y-4">
          <div>
            <label className="label" htmlFor="e-to">אל (עד 5 כתובות)</label>
            <input id="e-to" className="input" type="text" inputMode="email" dir="ltr" style={{ textAlign: 'right' }} value={to} onChange={(e) => setTo(e.target.value)} placeholder="accountant@example.com" autoFocus />
            {withEmail.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {withEmail.map((c) => (
                  <button key={c.id} type="button" className="chip bg-slate-100 text-slate-700 hover:bg-brand-100" onClick={() => addRecipient(c.email)}>
                    {c.name} · {kindLabel(c.kind)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="label" htmlFor="e-subject">נושא</label>
            <input id="e-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} required />
          </div>
          <div>
            <label className="label" htmlFor="e-msg">הודעה</label>
            <textarea id="e-msg" className="input !py-2.5" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
          </div>
          {fileLabel && (
            <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <Paperclip className="h-4 w-4" /> יצורף: {fileLabel}
            </p>
          )}
          <ErrorBox>{error}</ErrorBox>
        </form>
      )}
    </Modal>
  );
}
