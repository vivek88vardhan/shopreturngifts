import { QueryClient } from '@tanstack/react-query';

/** Single shared client so bootstrap prefetch and React tree use the same cache. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
