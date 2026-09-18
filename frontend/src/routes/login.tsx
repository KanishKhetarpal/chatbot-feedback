import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Bot, KeyRound, Lock, UserRound } from "lucide-react";
import { toast } from "sonner";

import Axios, { getErrorMessage } from "@/lib/axios-config";
import { setAuthData, type LoginResponse } from "@/lib/auth-utils";
import { useUserStore } from "@/store/use-user-store";
import { Config } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: `Sign in — ${Config.APP_NAME}` }] }),
});

/**
 * Two doors. Testers press one button and are in — a guest account is created
 * for them behind the scenes so their conversations stay attributable. Admins
 * open the small form underneath and sign in with a username and password.
 */
function LoginPage() {
  const navigate = useNavigate();
  const setUser = useUserStore((s) => s.setUser);
  const [adminOpen, setAdminOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function finish(data: LoginResponse) {
    setAuthData(data);
    setUser(data.user);
    void navigate({ to: data.user.role === "admin" ? "/" : "/chat", replace: true });
  }

  const guest = useMutation({
    mutationFn: async () => (await Axios.post<LoginResponse>("/api/v1/auth/guest")).data,
    onSuccess: (data) => {
      toast.success("You're in — pick a chatbot to start");
      finish(data);
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not sign in")),
  });

  const admin = useMutation({
    mutationFn: async () => (await Axios.post<LoginResponse>("/api/v1/auth/login", { username, password })).data,
    onSuccess: (data) => {
      toast.success(`Welcome, ${data.user.name}`);
      finish(data);
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not sign in")),
  });

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(ellipse_at_top_left,black_10%,transparent_60%)]" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-white/15">
            <Bot className="size-6" />
          </div>
          <div className="font-display text-lg font-bold">{Config.APP_NAME}</div>
        </div>
        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-bold leading-tight">Try the chatbots. Tell us what you think.</h1>
          <p className="mt-4 text-base text-primary-foreground/80">
            Every conversation is recorded so the team can review it later. Rate replies with a thumbs up or
            down and leave a comment when something feels off.
          </p>
        </div>
        <div className="relative text-xs text-primary-foreground/60">Powered by Claude</div>
      </div>

      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="mb-2 flex items-center gap-2.5 lg:hidden">
            <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="size-5" />
            </div>
            <div className="font-display text-base font-bold">{Config.APP_NAME}</div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Welcome</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">Start testing</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No account needed. One click and you can talk to every live chatbot.
            </p>
          </div>

          <Button type="button" className="h-12 w-full text-base" disabled={guest.isPending} onClick={() => guest.mutate()}>
            <UserRound className="size-4" />
            {guest.isPending ? "Signing in…" : "Sign in"}
            <ArrowRight className="size-4" />
          </Button>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <button
                type="button"
                onClick={() => setAdminOpen((v) => !v)}
                className="bg-background px-3 text-xs text-muted-foreground hover:text-foreground"
              >
                <KeyRound className="mr-1 inline size-3" />
                {adminOpen ? "Hide admin sign-in" : "Admin sign-in"}
              </button>
            </div>
          </div>

          {adminOpen ? (
            <form
              className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-elev-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (!admin.isPending) admin.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    autoComplete="username"
                    required
                    autoFocus
                    className="h-10 pl-9"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="h-10 pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                  />
                </div>
              </div>
              <Button type="submit" variant="outline" className="h-10 w-full" disabled={admin.isPending}>
                {admin.isPending ? "Signing in…" : "Sign in as admin"}
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
