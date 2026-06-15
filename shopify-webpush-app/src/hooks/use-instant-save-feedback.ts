'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useInstantSaveFeedback(resetMs = 2200) {
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<number>();

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
    },
    [],
  );

  const markSaved = useCallback(() => {
    setSaved(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setSaved(false), resetMs);
  }, [resetMs]);

  const markIdle = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setSaved(false);
  }, []);

  return { saved, markSaved, markIdle };
}
