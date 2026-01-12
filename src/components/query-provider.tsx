"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Create a client instance per request to avoid sharing state between users
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000, // 1 minute
            refetchOnWindowFocus: false,   // <- was true
            refetchOnReconnect: false,     // <- avoid refetch storms on flaky networks
            refetchOnMount: false,
            retry: 1,                      // reduce to 1 to avoid repeated large refetches
          },
          mutations: {
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools 
          initialIsOpen={false}
          buttonPosition="top-left"
          position="right"
        />
      )}
    </QueryClientProvider>
  );
}

