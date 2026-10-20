import { useMemo, useState } from 'react';
import { getRange, periodLabel, shiftAnchor, todayISO } from '../lib/format.js';

export function usePeriod(initial = 'month') {
  const [type, setType] = useState(initial);
  const [anchor, setAnchor] = useState(() => new Date());
  const [custom, setCustom] = useState(() => ({ from: todayISO().slice(0, 8) + '01', to: todayISO() }));

  const range = useMemo(() => getRange(type, anchor, custom), [type, anchor, custom]);
  const label = useMemo(() => periodLabel(type, anchor, custom), [type, anchor, custom]);

  return {
    type,
    setType,
    custom,
    setCustom,
    range,
    label,
    canNavigate: type === 'week' || type === 'month' || type === 'year',
    prev: () => setAnchor((a) => shiftAnchor(type, a, -1)),
    next: () => setAnchor((a) => shiftAnchor(type, a, 1)),
    reset: () => setAnchor(new Date()),
  };
}
