/**
 * Builds the accountant PDF.
 *  - every element in `container` marked data-pdf="page" is rasterised as one full A4 page
 *    (this is how Hebrew/RTL text is rendered correctly);
 *  - every element marked data-pdf="receipt" is a caption strip; the receipt photo at
 *    data-url is placed full-size beneath it on its own page.
 */
const A4_W = 210;
const A4_H = 297;
const MAX_IMG_SIDE = 3000;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

async function fetchAsJpeg(url) {
  const blob = await fetch(url).then((r) => {
    if (!r.ok) throw new Error('fetch failed');
    return r.blob();
  });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_IMG_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), w: canvas.width, h: canvas.height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function buildPdf(container, onProgress) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const nodes = [...container.querySelectorAll('[data-pdf]')];
  let first = true;
  let missing = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    onProgress?.(i + 1, nodes.length);
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
    });
    const strip = canvas.toDataURL('image/jpeg', 0.92);

    if (!first) pdf.addPage();
    first = false;

    if (node.dataset.pdf === 'page') {
      pdf.addImage(strip, 'JPEG', 0, 0, A4_W, A4_H, undefined, 'FAST');
      continue;
    }

    const capH = (A4_W * canvas.height) / canvas.width;
    pdf.addImage(strip, 'JPEG', 0, 0, A4_W, capH, undefined, 'FAST');
    try {
      const img = await fetchAsJpeg(node.dataset.url);
      const boxW = A4_W - 20;
      const boxH = A4_H - capH - 16;
      const ratio = Math.min(boxW / img.w, boxH / img.h);
      const w = img.w * ratio;
      const h = img.h * ratio;
      pdf.addImage(img.dataUrl, 'JPEG', (A4_W - w) / 2, capH + 6, w, h, undefined, 'FAST');
    } catch {
      missing += 1;
      pdf.setFontSize(12);
      pdf.text('Image could not be loaded', A4_W / 2, A4_H / 2, { align: 'center' });
    }
  }
  return { blob: pdf.output('blob'), pages: nodes.length, missing };
}
