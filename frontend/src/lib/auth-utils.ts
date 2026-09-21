import { LOCAL_STORAGE_KEY } from "./config";

export type AppUser = { id: string; email: string; name: string; role: "admin" | "user" | string; isGuest?: boolean };

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: AppUser;
};

export const isTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(window.atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

const read = (): LoginResponse | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY.AUTH_TOKEN);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginResponse;
  } catch {
    return null;
  }
};

/** Every chatbot thread this browser remembers: a new person signing in starts all bots fresh. */
const forgetAllWidgetThreads = () => {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("acharya.widget."))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage unavailable: nothing to forget
  }
};

export const setAuthData = (data: LoginResponse) => {
  const previous = read()?.user?.id;
  if (previous !== data.user?.id) forgetAllWidgetThreads();
  localStorage.setItem(LOCAL_STORAGE_KEY.AUTH_TOKEN, JSON.stringify(data));
};

export const removeAuthData = () => {
  localStorage.removeItem(LOCAL_STORAGE_KEY.AUTH_TOKEN);
  forgetAllWidgetThreads();
};

export const updateAuthTokens = (tokens: { accessToken: string; refreshToken?: string }) => {
  const base = read() ?? ({} as LoginResponse);
  localStorage.setItem(LOCAL_STORAGE_KEY.AUTH_TOKEN, JSON.stringify({ ...base, ...tokens }));
};

/** The stored session, or null once the refresh token is also dead. */
export const getAuthData = (): LoginResponse | null => {
  const data = read();
  if (!data?.accessToken) return null;
  const accessExpired = isTokenExpired(data.accessToken);
  const refreshUsable = !!data.refreshToken && !isTokenExpired(data.refreshToken);
  if (accessExpired && !refreshUsable) {
    removeAuthData();
    return null;
  }
  return data;
};

export const getAuthToken = (): string | null => getAuthData()?.accessToken ?? null;
export const getRefreshToken = (): string | null => read()?.refreshToken ?? null;

export const getAuthenticatedUser = () => {
  const data = getAuthData();
  return { data, isAuthenticated: !!data, user: data?.user ?? null };
};
