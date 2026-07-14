"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useSettingsStore } from "@/store/settings";
import { Preloader } from "@/components/preloader";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    useSettingsStore.getState().loadSettings();
  }, []);

  return (
    <QueryClientProvider client={client}>
      <Preloader />
      {children}
    </QueryClientProvider>
  );
}
