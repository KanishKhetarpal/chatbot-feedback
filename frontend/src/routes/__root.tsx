import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, ErrorComponent, Link } from "@tanstack/react-router";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import "../styles.css";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useAuthGuard();
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster richColors position="top-right" closeButton />
      </QueryClientProvider>
    </NextThemesProvider>
  );
}

function NotFound() {
  return (
    <div className="grid min-h-svh place-items-center bg-background p-6 text-center">
      <div>
        <p className="font-display text-2xl font-bold">Page not found</p>
        <Link to="/" className="mt-3 inline-block text-sm text-primary underline underline-offset-4">
          Back to chatbots
        </Link>
      </div>
    </div>
  );
}
