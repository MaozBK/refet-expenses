/** Builds a ZIP of photos in the browser (photos are already JPEG, so no extra compression). */
const clean = (s) =>
  String(s ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || '_';

export const safeName = clean;

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export const toCsv = (header, rows) => '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');

/**
 * items: [{ path: 'folder/file.jpg', url }]; extra: [{ path, content }] text files (e.g. index.csv)
 * Returns { blob, added, failed }.
 */
export async function buildZip(items, extra = [], onProgress) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const used = new Set();
  let added = 0;
  let failed = 0;
  let done = 0;
  const queue = [...items];

  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        const res = await fetch(item.url);
        if (!res.ok) throw new Error('fetch');
        let path = item.path;
        for (let n = 2; used.has(path); n++) path = item.path.replace(/(\.\w+)$/, `_${n}$1`);
        used.add(path);
        zip.file(path, await res.blob(), { binary: true });
        added += 1;
      } catch {
        failed += 1;
      }
      onProgress?.(++done, items.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  for (const e of extra) zip.file(e.path, e.content);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { blob, added, failed };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
