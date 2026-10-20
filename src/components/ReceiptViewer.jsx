import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useSignedUrls } from '../hooks/useSignedUrls.js';
import { Modal, Spinner } from './ui.jsx';

export default function ReceiptViewer({ images, title = 'קבלות וחשבוניות', onClose }) {
  const [index, setIndex] = useState(0);
  const urls = useSignedUrls(images.map((i) => i.path));
  const current = images[index];
  const url = current && urls[current.path];

  return (
    <Modal title={title} onClose={onClose} size="lg">
      <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
        {url ? (
          <img src={url} alt={`תמונה ${index + 1}`} className="max-h-[60dvh] w-full object-contain" />
        ) : (
          <Spinner className="h-7 w-7 text-slate-400" />
        )}
        {images.length > 1 && (
          <>
            <button
              type="button"
              className="absolute end-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"
              onClick={() => setIndex((i) => (i + 1) % images.length)}
              aria-label="התמונה הבאה"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="absolute start-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"
              onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
              aria-label="התמונה הקודמת"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <span>
          {index + 1} / {images.length}
        </span>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700">
            פתיחה בגודל מלא <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </Modal>
  );
}
