import { Mail, MessageCircle, Phone } from 'lucide-react';
import { telHref, waHref } from '../lib/documents.js';

/** Tap-to-call, WhatsApp and e-mail shortcuts for a contact. */
export default function PhoneLinks({ phone, email, size = 'sm' }) {
  const tel = telHref(phone);
  const wa = waHref(phone);
  const box = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  if (!tel && !email) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {tel && (
        <a href={tel} onClick={(e) => e.stopPropagation()} className={`inline-flex ${box} items-center justify-center rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100`} aria-label={`חיוג ${phone}`} title={phone}>
          <Phone className={icon} />
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={`inline-flex ${box} items-center justify-center rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100`} aria-label="וואטסאפ">
          <MessageCircle className={icon} />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} onClick={(e) => e.stopPropagation()} className={`inline-flex ${box} items-center justify-center rounded-full bg-sky-50 text-sky-700 hover:bg-sky-100`} aria-label={`מייל ${email}`} title={email}>
          <Mail className={icon} />
        </a>
      )}
    </span>
  );
}
