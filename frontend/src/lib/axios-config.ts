import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

import { Config } from "./config";
import { getAuthToken, getRefreshToken, removeAuthData, updateAuthTokens } from "./auth-utils";

/** Browser paths a member of the public may be on — a 401 there must not bounce to login. */
const PUBLIC_ROUTE_PREFIXES = ["/login", "/s", "/widget"] as const;

function isPublicRoutePathname(pathname: string): boolean {
  return PUBLIC_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const Axios = axios.create({ baseURL: Config.API_URL, timeout: 60_000 });
const AxiosRefresh = axios.create({ baseURL: Config.API_URL, timeout: 30_000 });

Axios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAuthToken();
  if (token && config.headers) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

const refreshAuthTokens = (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return null;
      try {
        const { data } = await AxiosRefresh.post("/api/v1/auth/refresh", { refreshToken });
        updateAuthTokens(data);
        return (data?.accessToken as string) ?? null;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
};

Axios.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 500;
      const message = error.response?.data?.message || error.message;
      const code = error.response?.data?.error as string | undefined;
      const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

      if (status === 401 && original && !original._retry) {
        const isAuthEndpoint = !!original.url && /\/auth\/(login|refresh)/.test(original.url);
        if (!isAuthEndpoint && original.headers?.["Authorization"]) {
          const next = await refreshAuthTokens();
          if (next) {
            original._retry = true;
            original.headers["Authorization"] = `Bearer ${next}`;
            return Axios(original);
          }
          if (!isPublicRoutePathname(window.location.pathname)) {
            removeAuthData();
            window.location.replace("/login");
          }
        }
      }

      return Promise.reject({ message, status, error: code, details: error.response?.data ?? null });
    }
    return Promise.reject({ message: "Unexpected error occurred", status: 500 });
  },
);

export default Axios;

export interface ApiError {
  message: string;
  status: number;
  error?: string;
  details?: unknown;
}

export function getErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err && typeof err.status === "number") return err.status;
  return undefined;
}

export function isPermissionDeniedError(err: unknown): boolean {
  return getErrorStatus(err) === 403;
}

export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message || fallback;
  }
  return fallback;
}
