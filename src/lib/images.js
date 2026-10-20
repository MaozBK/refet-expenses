import { BUCKET, supabase } from './supabase.js';

const MAX_SIDE = 2400;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Downscales large camera photos (keeps receipts readable) to keep uploads fast and
 * storage small. Falls back to the original file when the browser cannot decode it.
 */
export async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.88));
    if (blob && blob.size < file.size) return { blob, type: 'image/jpeg', ext: 'jpg' };
    if (blob && file.size > MAX_UPLOAD_BYTES) return { blob, type: 'image/jpeg', ext: 'jpg' };
  } catch {
    /* fall through to original */
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('הקובץ גדול מדי (מעל 10MB)');
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  return { blob: file, type: file.type || 'image/jpeg', ext };
}

export async function uploadReceipt(ownerId, txId, file) {
  const { blob, type, ext } = await compressImage(file);
  const path = `${ownerId}/${txId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
  if (error) throw error;
  return path;
}

export async function removeFiles(paths) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}

const cache = new Map(); // path -> { url, exp }

/** Signed URLs for the private bucket, cached until shortly before they expire. */
export async function getSignedUrls(paths, expires = 3600) {
  const now = Date.now();
  const need = [...new Set(paths)].filter((p) => !((cache.get(p)?.exp ?? 0) > now));
  for (let i = 0; i < need.length; i += 100) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(need.slice(i, i + 100), expires);
    if (error) throw error;
    for (const d of data) {
      if (d.signedUrl) cache.set(d.path, { url: d.signedUrl, exp: now + (expires - 120) * 1000 });
    }
  }
  return Object.fromEntries(paths.map((p) => [p, cache.get(p)?.url]));
}
