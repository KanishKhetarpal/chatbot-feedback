import { ReactNode, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bot, Gauge, Inbox, LogOut, Menu, MessageSquare, ThumbsUp, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useUserStore } from "@/store/use-user-store";
import { removeAuthData } from "@/lib/auth-utils";
import { Config } from "@/lib/config";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon; adminOnly?: boolean; exact?: boolean };

const NAV: NavItem[] = [
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/", label: "Chatbots", icon: Bot, exact: true, adminOnly: true },
  { to: "/conversations", label: "Conversations", icon: Inbox, adminOnly: true },
  { to: "/feedback", label: "Feedback", icon: ThumbsUp, adminOnly: true },
  { to: "/usage", label: "Usage", icon: Gauge, adminOnly: true },
  { to: "/users", label: "Users", icon: Users, adminOnly: true },
];

/**
 * The signed-in frame: a slim sidebar with the four sections, the account at
 * the bottom, and the page in the rest. Public pages (`/s/…`, `/widget/…`)
 * never render this.
 */
export function AppShell({
  children,
  noPadding,
  className,
}: {
  children: ReactNode;
  noPadding?: boolean;
  className?: string;
}) {
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const isAdmin = user?.role === "admin";
  const isHScreen = className?.includes("h-screen");

  function signOut() {
    removeAuthData();
    logout();
    void navigate({ to: "/login", replace: true });
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-2">
      {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-3">
      <div className="mb-4 flex items-center gap-2.5 px-4">
        <img src="/brand/logo-192.png" alt="" className="size-8 rounded-md object-contain" />
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-bold tracking-tight">{Config.APP_NAME}</div>
          <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {isAdmin ? "Admin" : user?.isGuest ? "Guest tester" : "Tester"}
          </div>
        </div>
      </div>
      {nav}
      <div className="mt-auto border-t border-sidebar-border px-3 pt-3">
        <div className="mb-2 min-w-0 px-1">
          <div className="truncate text-sm font-medium">{user?.name ?? "—"}</div>
          {!user?.isGuest ? <div className="truncate text-xs text-muted-foreground">{user?.email}</div> : null}
        </div>
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className={cn("flex min-h-screen bg-background text-foreground", className)}>
      <div className="hidden md:block">{sidebar}</div>

      {open ? (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center gap-2 border-b border-border px-3 md:hidden">
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-md p-1.5 hover:bg-muted">
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <span className="font-display text-sm font-bold">{Config.APP_NAME}</span>
        </div>
        <main
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            isHScreen ? "overflow-hidden" : "overflow-y-auto [scrollbar-gutter:stable]",
            !noPadding && "p-4",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
