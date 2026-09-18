import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppUser } from "@/lib/auth-utils";

type UserStoreState = {
  isAuthenticated: boolean;
  user: AppUser | null;
  setUser: (user: AppUser) => void;
  logout: () => void;
};

export const useUserStore = create<UserStoreState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      setUser: (user) => set({ isAuthenticated: true, user }),
      logout: () => set({ isAuthenticated: false, user: null }),
    }),
    { name: "chatbot-feedback-user" },
  ),
);

export const useIsAdmin = () => useUserStore((s) => s.user?.role === "admin");
