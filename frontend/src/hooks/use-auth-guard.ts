import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { useUserStore } from "@/store/use-user-store";
import { getAuthenticatedUser } from "@/lib/auth-utils";

/**
 * Prefix-matched: `/s/<key>` is a public share link and `/widget/<key>` the
 * embeddable panel — neither may bounce a member of the public to the login.
 */
const PUBLIC_ROUTES = ["/login", "/s", "/widget"];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export const useAuthGuard = () => {
  const router = useRouter();
  const pathname = router.state.location.pathname;
  const { isAuthenticated, user } = getAuthenticatedUser();
  const { setUser, user: storedUser } = useUserStore();

  useEffect(() => {
    if (user && (!storedUser || storedUser.id !== user.id)) setUser(user);
    if (!isAuthenticated && !isPublicRoute(pathname)) {
      void router.navigate({ to: "/login", replace: true });
    }
    if (isAuthenticated && pathname === "/login") {
      void router.navigate({ to: "/", replace: true });
    }
  }, [pathname, isAuthenticated, user, storedUser, setUser, router]);
};
