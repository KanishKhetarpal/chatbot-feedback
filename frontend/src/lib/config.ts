export const LOCAL_STORAGE_KEY = {
  AUTH_TOKEN: "chatbot_feedback_token",
} as const;

export const Config = {
  API_URL: import.meta.env.VITE_API_URL as string | undefined,
  APP_NAME: (import.meta.env.VITE_APP_NAME as string | undefined) ?? "Chatbot Feedback",
} as const;

/** The API root every route hangs off — tolerant of a trailing slash in the env. */
export const API_V1_BASE = `${String(Config.API_URL ?? "").replace(/\/+$/, "")}/api/v1`;
