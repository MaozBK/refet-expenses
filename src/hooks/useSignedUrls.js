import { useEffect, useState } from 'react';
import { getSignedUrls } from '../lib/images.js';

export function useSignedUrls(paths) {
  const key = paths.join('|');
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let off = false;
    if (!paths.length) {
      setUrls({});
      return undefined;
    }
    getSignedUrls(paths)
      .then((u) => !off && setUrls(u))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return urls;
}
