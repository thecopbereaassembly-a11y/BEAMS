import { QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query configuration — the server-state backbone (docs/13 §B1).
 * Stale-while-revalidate defaults, offline-aware retries.
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // 1 min: serve cache, revalidate in background
        gcTime: 5 * 60_000,
        retry: 2,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 1,
      },
    },
  });
}
