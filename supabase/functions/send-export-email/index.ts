// Sends an export package (ZIP / PDF already uploaded to the private "exports" bucket)
// by e-mail through Resend. The reply-to is the signed-in user, so replies reach them.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const DAILY_CAP = 30;
const MAX_ATTACH_BYTES = 30 * 1024 * 1024;
const EMAIL_RE = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;
const PATH_RE = /^[0-9a-f-]{36}\/[\w.\- ]{1,120}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return json({ error: 'not_configured' }, 503);

  let body: {
    to?: string[];
    subject?: string;
    message?: string;
    export_path?: string;
    filename?: string;
    sender_name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const to = [...new Set((body.to ?? []).map((e) => String(e).trim().toLowerCase()))];
  if (!to.length || to.length > 5 || !to.every((e) => EMAIL_RE.test(e))) return json({ error: 'bad_recipients' }, 400);
  const subject = String(body.subject ?? '').trim().slice(0, 150);
  const message = String(body.message ?? '').trim().slice(0, 2000);
  if (!subject) return json({ error: 'bad_subject' }, 400);
  const senderName = String(body.sender_name ?? '').trim().slice(0, 80);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase
    .from('function_usage')
    .select('id', { count: 'exact', head: true })
    .eq('fn', 'send-export-email')
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_CAP) return json({ error: 'daily_limit' }, 429);

  // Optional package. Access is enforced by Storage RLS through the user's own JWT.
  let attachment: { filename: string; path: string } | null = null;
  let link: string | null = null;
  const exportPath = body.export_path;
  if (exportPath) {
    if (!PATH_RE.test(exportPath)) return json({ error: 'bad_path' }, 400);
    const { data: signed, error } = await supabase.storage.from('exports').createSignedUrl(exportPath, 7 * 24 * 3600);
    if (error || !signed?.signedUrl) return json({ error: 'file_not_found' }, 404);
    const head = await fetch(signed.signedUrl, { method: 'HEAD' });
    const size = Number(head.headers.get('content-length') ?? 0);
    if (!head.ok) return json({ error: 'file_not_found' }, 404);
    const filename = String(body.filename ?? 'documents.zip').replace(/[^\w.\- ]/g, '_').slice(0, 100) || 'documents.zip';
    if (size > 0 && size <= MAX_ATTACH_BYTES) attachment = { filename, path: signed.signedUrl };
    else link = signed.signedUrl;
  }

  const html = `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:#1e293b">
    ${message ? `<p>${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
    ${attachment ? `<p>📎 מצורף הקובץ: <b>${esc(attachment.filename)}</b></p>` : ''}
    ${link ? `<p>הקבצים גדולים מדי לצירוף למייל. ניתן להוריד אותם בקישור (בתוקף 7 ימים):<br><a href="${esc(link)}">הורדת הקבצים</a></p>` : ''}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
    <p style="color:#64748b;font-size:13px">נשלח ממערכת ניהול הרפת${senderName ? ` בשם ${esc(senderName)}` : ''}. אפשר להשיב למייל זה ישירות.</p>
  </div>`;

  await supabase.from('function_usage').insert({ fn: 'send-export-email' });

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM') ?? 'Refet <onboarding@resend.dev>',
      to,
      subject,
      html,
      reply_to: user.email,
      ...(attachment ? { attachments: [attachment] } : {}),
    }),
  });
  const out = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error('resend error', resp.status, JSON.stringify(out).slice(0, 300));
    return json({ error: 'send_failed', detail: out?.message ?? null }, 502);
  }

  // The attachment is now inside the e-mail; remove the temporary file.
  if (attachment && exportPath) await supabase.storage.from('exports').remove([exportPath]);
  return json({ ok: true, id: out.id ?? null, attached: Boolean(attachment), linked: Boolean(link) });
});
