import { supabase } from './supabase.js';
import { removeFiles, uploadReceipt } from './images.js';

const TX_SELECT = '*, categories(name,color), transaction_images(id,path)';

export async function fetchTransactions(ownerId, { from, to }) {
  const PAGE = 1000;
  let all = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from('transactions')
      .select(TX_SELECT)
      .eq('owner_id', ownerId)
      .order('tx_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (from) q = q.gte('tx_date', from);
    if (to) q = q.lte('tx_date', to);
    const { data, error } = await q;
    if (error) throw error;
    all = all.concat(data);
    if (data.length < PAGE) break;
  }
  return all.map((t) => ({ ...t, amount: Number(t.amount) }));
}

/**
 * Create or update a transaction and sync its receipt images.
 * `removedImages`: [{id,path}] already stored; `newFiles`: File[] to upload.
 */
export async function saveTransaction({ ownerId, id, values, removedImages = [], newFiles = [] }) {
  const payload = {
    type: values.type,
    amount: values.amount,
    tx_date: values.tx_date,
    category_id: values.category_id || null,
    vendor: values.vendor?.trim() || null,
    notes: values.notes?.trim() || null,
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

  if (removedImages.length) {
    const { error } = await supabase
      .from('transaction_images')
      .delete()
      .in('id', removedImages.map((i) => i.id));
    if (error) throw error;
    await removeFiles(removedImages.map((i) => i.path)).catch(() => {});
  }

  const failed = [];
  for (const file of newFiles) {
    let path;
    try {
      path = await uploadReceipt(ownerId, txId, file);
      const { error } = await supabase
        .from('transaction_images')
        .insert({ transaction_id: txId, owner_id: ownerId, path });
      if (error) {
        await removeFiles([path]).catch(() => {});
        throw error;
      }
    } catch (e) {
      failed.push(file.name || 'תמונה');
    }
  }
  return { id: txId, failedUploads: failed };
}

/** Deletes transactions (and their receipt files). `txs` must include transaction_images. */
export async function deleteTransactions(txs) {
  const ids = txs.map((t) => t.id);
  const paths = txs.flatMap((t) => (t.transaction_images || []).map((i) => i.path));
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from('transactions').delete().in('id', ids.slice(i, i + 100));
    if (error) throw error;
  }
  if (paths.length) await removeFiles(paths).catch(() => {});
}

export async function deleteAccount(userId) {
  // 1. remove every receipt file through the Storage API
  const paths = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('transaction_images')
      .select('path')
      .eq('owner_id', userId)
      .range(offset, offset + 999);
    if (error) throw error;
    paths.push(...data.map((d) => d.path));
    if (data.length < 1000) break;
  }
  await removeFiles(paths);
  // 2. delete the auth user – cascades to all rows
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
}
