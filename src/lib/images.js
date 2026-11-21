import { BUCKET, supabase } from './supabase.js';

const MAX_SIDE = 2400;
const THUMB_SIDE = 420;
const SCAN_SIDE = 1600;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Decodes (honouring EXIF rotation), downsizes and re-encodes as JPEG. */
export async function resizeToJpeg(file, maxSide, quality) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('encode failed');
  return blob;
}

/**
 * Downscales large camera photos (keeps receipts readable) to keep uploads fast and
 * storage small. Falls back to the original file when the browser cannot decode it.
 */
export async function compressImage(file) {
  try {
    const blob = await resizeToJpeg(file, MAX_SIDE, 0.88);
    if (blob.size < file.size || file.size > MAX_UPLOAD_BYTES) return { blob, type: 'image/jpeg', ext: 'jpg' };
  } catch {
    /* fall through to original */
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('הקובץ גדול מדי (מעל 10MB)');
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  return { blob: file, type: file.type || 'image/jpeg', ext };
}

/** Uploads the photo plus a small thumbnail. parentId = transaction or document id. */
export async function uploadReceipt(ownerId, parentId, file) {
  const { blob, type, ext } = await compressImage(file);
  const id = crypto.randomUUID();
  const path = `${ownerId}/${parentId}/${id}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
  if (error) throw error;

  let thumbPath = null;
  try {
    const thumb = await resizeToJpeg(blob, THUMB_SIDE, 0.72);
    const tp = `${ownerId}/${parentId}/${id}_t.jpg`;
    const { error: tErr } = await supabase.storage.from(BUCKET).upload(tp, thumb, { contentType: 'image/jpeg', upsert: false });
    if (!tErr) thumbPath = tp;
  } catch {
    /* thumbnail is optional */
  }
  return { path, thumbPath };
}

/** Smaller JPEG as base64 for the document-reading function. */
export async function fileToBase64Jpeg(file) {
  const blob = await resizeToJpeg(file, SCAN_SIDE, 0.85);
  const base64 = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  return { base64, media_type: 'image/jpeg' };
}

export async function removeFiles(paths) {
  const list = paths.filter(Boolean);
  for (let i = 0; i < list.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(list.slice(i, i + 100));
    if (error) throw error;
  }
}

const cache = new Map(); // path -> { url, exp }

/** Signed URLs for the private bucket, cached until shortly before they expire. */
export async function getSignedUrls(paths, expires = 3600) {
  const now = Date.now();
  const need = [...new Set(paths.filter(Boolean))].filter((p) => !((cache.get(p)?.exp ?? 0) > now));
  for (let i = 0; i < need.length; i += 100) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(need.slice(i, i + 100), expires);
    if (error) throw error;
    for (const d of data) {
      if (d.signedUrl) cache.set(d.path, { url: d.signedUrl, exp: now + (expires - 120) * 1000 });
    }
  }
  return Object.fromEntries(paths.filter(Boolean).map((p) => [p, cache.get(p)?.url]));
}
