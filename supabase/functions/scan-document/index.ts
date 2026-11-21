// Reads a photographed delivery note / receipt / invoice with Claude vision and returns
// the document number, type, date, issuer and amount. The Anthropic key never leaves the server.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const DAILY_CAP = 150;
const MAX_BASE64_CHARS = 7_000_000; // ~5 MB image
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PROMPT = `This is a photo of a document handled by an Israeli dairy farm: a delivery note (תעודת משלוח), a receipt (קבלה), a tax invoice (חשבונית מס) or an invoice-receipt (חשבונית מס/קבלה). It is usually in Hebrew, printed or handwritten, possibly skewed or partly cut off.

Extract the fields with the record_document tool.
Rules:
- doc_number: the document's own serial number, usually labelled "מס'", "מספר", "תעודת משלוח מס'", "חשבונית מס'", "קבלה מס'", often in the header. Digits as printed, no spaces. NEVER use a phone number, company/VAT id (ח.פ / עוסק מורשה), licence plate, bank account or date. If a printed serial and a handwritten number both appear, prefer the printed serial and list the other in number_candidates. If you cannot read it with confidence, return null — do not guess.
- doc_date: ISO YYYY-MM-DD. Israeli dates are written DD/MM/YYYY (or DD.MM.YY). Null if unreadable.
- total_amount: the total payable in ILS including VAT ("סה"כ לתשלום"). Null for delivery notes without prices or if unreadable.
- issuer_name: the business that issued the document (letterhead).
- customer_name: the recipient / customer if printed.
- notes: one short Hebrew line describing the contents (e.g. "תערובת 10 טון", "חלב 5,200 ליטר").
- confidence: high only if the document number is clearly legible.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // The anon key also passes verify_jwt, so confirm a real signed-in user.
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return json({ error: 'unauthorized' }, 401);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'not_configured' }, 503);

  let body: { image_base64?: string; media_type?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const data = body.image_base64 ?? '';
  const mediaType = body.media_type ?? 'image/jpeg';
  if (!data || data.length > MAX_BASE64_CHARS || !MEDIA_TYPES.includes(mediaType)) {
    return json({ error: 'bad_image' }, 400);
  }

  // daily cap per user
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabase
    .from('function_usage')
    .select('id', { count: 'exact', head: true })
    .eq('fn', 'scan-document')
    .gte('created_at', since);
  if ((count ?? 0) >= DAILY_CAP) return json({ error: 'daily_limit' }, 429);
  await supabase.from('function_usage').insert({ fn: 'scan-document' });

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5',
      max_tokens: 1024,
      tools: [
        {
          name: 'record_document',
          description: 'Record the fields read from the document photo.',
          input_schema: {
            type: 'object',
            properties: {
              doc_type: { type: 'string', enum: ['delivery_note', 'receipt', 'invoice', 'other'] },
              doc_number: { type: ['string', 'null'] },
              number_candidates: { type: 'array', items: { type: 'string' } },
              doc_date: { type: ['string', 'null'] },
              total_amount: { type: ['number', 'null'] },
              issuer_name: { type: ['string', 'null'] },
              customer_name: { type: ['string', 'null'] },
              notes: { type: ['string', 'null'] },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
            required: ['doc_type', 'doc_number', 'confidence'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'record_document' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    console.error('anthropic error', resp.status, (await resp.text()).slice(0, 300));
    return json({ error: 'scan_failed' }, 502);
  }
  const out = await resp.json();
  const block = (out.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
  if (!block) return json({ error: 'scan_failed' }, 502);
  return json({ result: block.input });
});
