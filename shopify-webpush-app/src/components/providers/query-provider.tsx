'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const STALE_TIME_MS = 30 * 60 * 1000;
const GC_TIME_MS = 2 * 60 * 60 * 1000;

const PersistRestoreContext = createContext(true);

export function usePersistRestored() {
  return useContext(PersistRestoreContext);
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        retry: 1,
        placeholderData: (previous: unknown) => previous,
      },
      mutations: {
        retry: 2,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
      key: 'pe_query_cache_v1',
    }),
  );
  const [isRestored, setIsRestored] = useState(false);

  return (
    <PersistRestoreContext.Provider value={isRestored}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: GC_TIME_MS,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) => query.state.status === 'success',
          },
        }}
        onSuccess={() => {
          setIsRestored(true);
        }}
      >
        {children}
      </PersistQueryClientProvider>
    </PersistRestoreContext.Provider>
  );
}
