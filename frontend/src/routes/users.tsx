import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { KeyRound, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge, Card, PageHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import Axios, { getErrorMessage } from "@/lib/axios-config";
import { Config } from "@/lib/config";
import { QUERY_KEYS } from "@/lib/query-keys";
import { useIsAdmin, useUserStore } from "@/store/use-user-store";

export const Route = createFileRoute("/users")({
  component: UsersPage,
  head: () => ({ meta: [{ title: `Users — ${Config.APP_NAME}` }] }),
});

type AccountRow = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: "admin" | "user";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  _count: { visitors: number };
};

function UsersPage() {
  const isAdmin = useIsAdmin();
  const me = useUserStore((s) => s.user);
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<AccountRow | null>(null);

  const users = useQuery<{ users: AccountRow[]; guestCount: number }>({
    queryKey: [QUERY_KEYS.GET_USERS],
    queryFn: async () => (await Axios.get<{ users: AccountRow[]; guestCount: number }>("/api/v1/users")).data,
    enabled: isAdmin,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: [QUERY_KEYS.GET_USERS] });

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      (await Axios.patch(`/api/v1/users/${id}`, body)).data,
    onSuccess: () => {
      invalidate();
      toast.success("Updated");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not update")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await Axios.delete(`/api/v1/users/${id}`)).data,
    onSuccess: () => {
      invalidate();
      toast.success("Account deleted");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not delete")),
  });

  if (!isAdmin) {
    return (
      <AppShell>
        <ErrorState title="Admins only" description="Managing accounts needs an admin account." />
      </AppShell>
    );
  }

  return (
    <AppShell noPadding>
      <PageHeader
        title="Users"
        subtitle={`Admins sign in with a username and password. Testers sign in with one click as guests${
          users.data ? ` — ${users.data.guestCount} so far` : ""
        }.`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" /> New account
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border p-4">
        {users.isError ? (
          <ErrorState
            title="Couldn't load accounts"
            description={getErrorMessage(users.error, "Please try again.")}
            onRetry={() => void users.refetch()}
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Account</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Chats</th>
                  <th className="px-4 py-2.5 font-semibold">Last sign-in</th>
                  <th className="px-4 py-2.5 font-semibold">Active</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {(users.data?.users ?? []).map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id} className="border-t border-border">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground">
                            {u.role === "admin" ? <ShieldCheck className="size-4" /> : <UserRound className="size-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {u.name} {self ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {u.username ? `@${u.username} · ` : ""}
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Select
                          value={u.role}
                          disabled={self || patch.isPending}
                          onValueChange={(role) => patch.mutate({ id: u.id, body: { role } })}
                        >
                          <SelectTrigger className="h-8 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="user">User</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{u._count.visitors}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {u.lastLoginAt ? format(new Date(u.lastLoginAt), "d MMM yyyy, HH:mm") : "Never"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Switch
                          checked={u.isActive}
                          disabled={self || patch.isPending}
                          onCheckedChange={(isActive) => patch.mutate({ id: u.id, body: { isActive } })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setResetFor(u)} title="Set a new password">
                            <KeyRound className="size-3.5" />
                          </Button>
                          {!self ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-danger hover:text-danger"
                              title="Delete account"
                              onClick={() => {
                                if (window.confirm(`Delete ${u.email}? Their conversations are kept.`)) remove.mutate(u.id);
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.isLoading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                      Loading…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={invalidate} />
      <ResetPasswordDialog
        user={resetFor}
        onClose={() => setResetFor(null)}
        onSave={(password) => {
          if (!resetFor) return;
          patch.mutate({ id: resetFor.id, body: { password } }, { onSuccess: () => setResetFor(null) });
        }}
      />
    </AppShell>
  );
}

function CreateUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("admin");

  const create = useMutation({
    mutationFn: async () =>
      (await Axios.post("/api/v1/users", { name, email, password, role, ...(username.trim() ? { username } : {}) })).data,
    onSuccess: () => {
      toast.success("Account created");
      onCreated();
      onClose();
      setName("");
      setUsername("");
      setEmail("");
      setPassword("");
      setRole("admin");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not create the account")),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>For staff who need a password. Testers do not need an account — they sign in with one click.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length < 8) return toast.error("Password needs at least 8 characters.");
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. reviewer1" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "user")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — configure chatbots and review conversations</SelectItem>
                <SelectItem value="user">User — chat only (same as a guest, but named)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onSave,
}: {
  user: AccountRow | null;
  onClose: () => void;
  onSave: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set a new password</DialogTitle>
          <DialogDescription>{user ? `For ${user.email}.` : ""}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length < 8) return toast.error("Password needs at least 8 characters.");
            onSave(password);
            setPassword("");
          }}
        >
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save password</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { Badge };
