import { supabase } from './supabase.js';
import { fileToBase64Jpeg, removeFiles, uploadReceipt } from './images.js';
import { todayISO } from './format.js';

const TX_SELECT =
  '*, categories(name,color,group_name), contacts(name,phone), transaction_images(id,path,thumb_path,created_at)';
const DOC_SELECT = '*, contacts(name,phone,email), transaction_images(id,path,thumb_path,created_at)';

async function fetchAll(build) {
  const PAGE = 1000;
  let all = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await build().range(offset, offset + PAGE - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < PAGE) break;
  }
  return all;
}

const imagePaths = (images = []) => images.flatMap((i) => [i.path, i.thumb_path]);

export async function fetchTransactions(ownerId, { from, to }) {
  const rows = await fetchAll(() => {
    let q = supabase
      .from('transactions')
      .select(TX_SELECT)
      .eq('owner_id', ownerId)
      .order('tx_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (from) q = q.gte('tx_date', from);
    if (to) q = q.lte('tx_date', to);
    return q;
  });
  return rows.map((t) => ({ ...t, amount: Number(t.amount) }));
}

export async function fetchDocuments(ownerId) {
  const rows = await fetchAll(() =>
    supabase.from('documents').select(DOC_SELECT).eq('owner_id', ownerId).order('created_at', { ascending: false }),
  );
  return rows.map((d) => ({ ...d, amount: d.amount == null ? null : Number(d.amount) }));
}

/** Removes stored images (rows + files) and uploads new ones for a transaction or a document. */
async function syncImages({ ownerId, parentKey, parentId, removedImages = [], newFiles = [] }) {
  if (removedImages.length) {
    const { error } = await supabase
      .from('transaction_images')
      .delete()
      .in('id', removedImages.map((i) => i.id));
    if (error) throw error;
    await removeFiles(imagePaths(removedImages)).catch(() => {});
  }
  const failed = [];
  for (const file of newFiles) {
    let up;
    try {
      up = await uploadReceipt(ownerId, parentId, file);
      const { error } = await supabase
        .from('transaction_images')
        .insert({ [parentKey]: parentId, owner_id: ownerId, path: up.path, thumb_path: up.thumbPath });
      if (error) {
        await removeFiles([up.path, up.thumbPath]).catch(() => {});
        throw error;
      }
    } catch {
      failed.push(file.name || 'תמונה');
    }
  }
  return failed;
}

/**
 * Create or update a transaction and sync its receipt images.
 * `removedImages`: [{id,path,thumb_path}] already stored; `newFiles`: File[] to upload.
 */
export async function saveTransaction({ ownerId, id, values, removedImages = [], newFiles = [] }) {
  const payload = {
    type: values.type,
    amount: values.amount,
    tx_date: values.tx_date,
    category_id: values.category_id || null,
    contact_id: values.contact_id || null,
    vendor: values.vendor?.trim() || null,
    notes: values.notes?.trim() || null,
    no_receipt_needed: Boolean(values.no_receipt_needed),
  };

  let txId = id;
  if (id) {
    const { error } = await supabase.from('transactions').update(payload).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('transactions')
      .insert({ ...payload, owner_id: ownerId })
      .select('id')
      .single();
    if (error) throw error;
    txId = data.id;
  }
  const failedUploads = await syncImages({ ownerId, parentKey: 'transaction_id', parentId: txId, removedImages, newFiles });
  return { id: txId, failedUploads };
}

/** Deletes transactions (and their receipt files). `txs` must include transaction_images. */
export async function deleteTransactions(txs) {
  const ids = txs.map((t) => t.id);
  const paths = txs.flatMap((t) => imagePaths(t.transaction_images));
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from('transactions').delete().in('id', ids.slice(i, i + 100));
    if (error) throw error;
  }
  if (paths.length) await removeFiles(paths).catch(() => {});
}

export async function setNoReceiptNeeded(ids, value) {
  const { error } = await supabase.from('transactions').update({ no_receipt_needed: value }).in('id', ids);
  if (error) throw error;
}

/**
 * Create or update a document. A "pending" document becomes "received" once a photo is attached.
 * `alsoTransaction` = { type, category_id } creates a linked income/expense from the document.
 */
export async function saveDocument({ ownerId, id, values, removedImages = [], newFiles = [], remainingImages = 0, alsoTransaction }) {
  let status = values.status;
  if (status === 'pending' && newFiles.length + remainingImages > 0) status = 'received';

  const payload = {
    doc_type: values.doc_type,
    direction: values.direction,
    status,
    doc_number: values.doc_number?.trim() || null,
    doc_date: values.doc_date || null,
    contact_id: values.contact_id || null,
    amount: values.amount === '' || values.amount == null ? null : values.amount,
    notes: values.notes?.trim() || null,
    ocr_used: Boolean(values.ocr_used),
  };

  let docId = id;
  if (id) {
    const { error } = await supabase.from('documents').update(payload).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('documents')
      .insert({ ...payload, owner_id: ownerId })
      .select('id')
      .single();
    if (error) throw error;
    docId = data.id;
  }
  const failedUploads = await syncImages({ ownerId, parentKey: 'document_id', parentId: docId, removedImages, newFiles });

  let transactionId = null;
  if (alsoTransaction && payload.amount > 0) {
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        owner_id: ownerId,
        type: alsoTransaction.type,
        amount: payload.amount,
        tx_date: payload.doc_date || todayISO(),
        category_id: alsoTransaction.category_id || null,
        contact_id: payload.contact_id,
        vendor: alsoTransaction.vendor || null,
        notes: payload.doc_number ? `מסמך מס' ${payload.doc_number}` : null,
      })
      .select('id')
      .single();
    if (txErr) throw txErr;
    transactionId = tx.id;
    const { error: linkErr } = await supabase.from('documents').update({ transaction_id: tx.id }).eq('id', docId);
    if (linkErr) throw linkErr;
  }
  return { id: docId, failedUploads, transactionId };
}

export async function isDuplicateDocument({ ownerId, id, contact_id, doc_type, direction, doc_number }) {
  if (!doc_number?.trim() || !contact_id) return false;
  let q = supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('contact_id', contact_id)
    .eq('doc_type', doc_type)
    .eq('direction', direction)
    .eq('doc_number', doc_number.trim());
  if (id) q = q.neq('id', id);
  const { count } = await q;
  return (count ?? 0) > 0;
}

export async function deleteDocuments(docs) {
  const ids = docs.map((d) => d.id);
  const paths = docs.flatMap((d) => imagePaths(d.transaction_images));
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from('documents').delete().in('id', ids.slice(i, i + 100));
    if (error) throw error;
  }
  if (paths.length) await removeFiles(paths).catch(() => {});
}

export async function createVoidOrPendingDocs(ownerId, base, numbers, status) {
  const rows = numbers.map((n) => ({
    owner_id: ownerId,
    doc_type: base.doc_type,
    direction: base.direction,
    contact_id: base.contact_id,
    doc_number: n,
    status,
  }));
  const { error } = await supabase.from('documents').insert(rows);
  if (error) throw error;
}

export async function setDocumentStatus(ids, status) {
  const { error } = await supabase.from('documents').update({ status }).in('id', ids);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Document reading (Edge Function → Claude vision)
// ---------------------------------------------------------------------
export const SCAN_ERRORS = {
  not_configured: 'הזיהוי האוטומטי עדיין לא הופעל בשרת – אפשר למלא ידנית.',
  daily_limit: 'הגעתם למכסת הסריקות היומית – מלאו ידנית.',
  bad_image: 'התמונה לא נתמכת לזיהוי – מלאו ידנית.',
  unauthorized: 'פג תוקף ההתחברות – התחברו מחדש.',
  scan_failed: 'הזיהוי האוטומטי נכשל – מלאו ידנית.',
};

async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = 'scan_failed';
    let detail = null;
    try {
      const j = await error.context.json();
      code = j.error || code;
      detail = j.detail || null;
    } catch {
      /* network error */
    }
    const e = new Error(code);
    e.code = code;
    e.detail = detail;
    throw e;
  }
  return data;
}

export async function scanDocument(file) {
  const { base64, media_type } = await fileToBase64Jpeg(file);
  const data = await invoke('scan-document', { image_base64: base64, media_type });
  return data.result;
}

// ---------------------------------------------------------------------
// Export packages (ZIP / PDF) and e-mail
// ---------------------------------------------------------------------
export async function uploadExport(ownerId, blob, ext, contentType) {
  const path = `${ownerId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('exports').upload(path, blob, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

export const EMAIL_ERRORS = {
  not_configured: 'שליחת המייל עדיין לא הופעלה בשרת (חסר מפתח Resend).',
  daily_limit: 'הגעתם למכסת המיילים היומית.',
  bad_recipients: 'כתובת אימייל לא תקינה (עד 5 נמענים).',
  file_not_found: 'הקובץ לא נמצא – נסו שוב.',
  send_failed: 'שירות המייל דחה את השליחה.',
  unauthorized: 'פג תוקף ההתחברות – התחברו מחדש.',
};

export async function sendExportEmail(payload) {
  return invoke('send-export-email', payload);
}

/** Best effort: delete temporary packages older than a week. */
export async function cleanupExports(ownerId) {
  try {
    const { data } = await supabase.storage.from('exports').list(ownerId, { limit: 100 });
    const old = (data || [])
      .filter((f) => f.created_at && Date.now() - new Date(f.created_at).getTime() > 7 * 24 * 3600 * 1000)
      .map((f) => `${ownerId}/${f.name}`);
    if (old.length) await supabase.storage.from('exports').remove(old);
  } catch {
    /* ignore */
  }
}

export async function deleteAccount(userId) {
  // 1. remove every receipt photo (and thumbnail) through the Storage API
  const paths = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('transaction_images')
      .select('path, thumb_path')
      .eq('owner_id', userId)
      .range(offset, offset + 999);
    if (error) throw error;
    paths.push(...data.flatMap((d) => [d.path, d.thumb_path]));
    if (data.length < 1000) break;
  }
  await removeFiles(paths);
  // leftover temporary export packages
  const { data: exp } = await supabase.storage.from('exports').list(userId, { limit: 1000 });
  if (exp?.length) await supabase.storage.from('exports').remove(exp.map((f) => `${userId}/${f.name}`));
  // 2. delete the auth user – cascades to all rows
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
}
