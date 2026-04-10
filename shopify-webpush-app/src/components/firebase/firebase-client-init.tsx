'use client';

import { useEffect } from 'react';

import { getFirebaseAnalytics } from '@/lib/integrations/firebase/client';

export function FirebaseClientInit() {
  useEffect(() => {
    getFirebaseAnalytics().catch(() => null);
  }, []);

  return null;
}
