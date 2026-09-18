import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { getErrorStatus } from "./lib/axios-config";

const NON_RETRYABLE_STATUSES = new Set([401, 403, 404]);

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: (failureCount, error) => {
          const status = getErrorStatus(error);
          if (status !== undefined && NON_RETRYABLE_STATUSES.has(status)) return false;
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
      },
    },
  });

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });
};
