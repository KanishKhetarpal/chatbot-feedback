/** Client-only display preferences — never sent to the backend. */
export type DensityPreference = "comfortable" | "compact";

export type TextSizePreference = "small" | "default" | "large";

export type UiPreferences = {
  density: DensityPreference;
  textSize: TextSizePreference;
  /** Kills transitions/animations app-wide for users who find motion distracting. */
  reduceMotion: boolean;
  /** Desktop sidebar rail state — also written by the sidebar's own collapse button. */
  sidebarCollapsed: boolean;
};
