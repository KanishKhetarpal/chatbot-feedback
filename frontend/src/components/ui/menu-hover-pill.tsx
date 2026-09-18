"use client";

import * as React from "react";
import { LayoutGroup, motion } from "motion/react";

import { cn } from "@/lib/utils";

export const MENU_HOVER_PILL_TRANSITION = {
  type: "tween" as const,
  duration: 0.15,
  ease: [0.25, 1, 0.5, 1] as const,
};

/** Single fill for hover + selected — never layer a second bg on the row. */
export const MENU_HOVER_PILL_CLASS = "bg-foreground/8";

type MenuHoverPillContextValue = {
  pillLayoutId: string;
  /** Pointer hover wins; otherwise the selected value keeps the pill. */
  activeValue: string | null;
  setHoveredValue: (value: string | null) => void;
  registerSelected: (value: string) => void;
  unregisterSelected: (value: string) => void;
};

const MenuHoverPillContext = React.createContext<MenuHoverPillContextValue | null>(null);

export function useMenuHoverPill() {
  return React.useContext(MenuHoverPillContext);
}

export function MenuHoverPillProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pillLayoutId = React.useId();
  const [hoveredValue, setHoveredValue] = React.useState<string | null>(null);
  const [selectedValue, setSelectedValue] = React.useState<string | null>(null);

  const registerSelected = React.useCallback((value: string) => {
    setSelectedValue(value);
  }, []);

  const unregisterSelected = React.useCallback((value: string) => {
    setSelectedValue((current) => (current === value ? null : current));
  }, []);

  const activeValue = hoveredValue ?? selectedValue;

  const contextValue = React.useMemo(
    () => ({
      pillLayoutId,
      activeValue,
      setHoveredValue,
      registerSelected,
      unregisterSelected,
    }),
    [pillLayoutId, activeValue, registerSelected, unregisterSelected],
  );

  return (
    <MenuHoverPillContext.Provider value={contextValue}>
      <LayoutGroup id={pillLayoutId}>
        <div className={className} onPointerLeave={() => setHoveredValue(null)}>
          {children}
        </div>
      </LayoutGroup>
    </MenuHoverPillContext.Provider>
  );
}

/** Mount when this row is the selected/checked one so the pill parks there by default. */
export function MenuSelectedAnchor({ value }: { value: string }) {
  const hover = useMenuHoverPill();
  const registerSelected = hover?.registerSelected;
  const unregisterSelected = hover?.unregisterSelected;

  React.useLayoutEffect(() => {
    if (!registerSelected || !unregisterSelected) return;
    registerSelected(value);
    return () => unregisterSelected(value);
  }, [registerSelected, unregisterSelected, value]);

  return null;
}

/** Shared sliding accent pill — only one mounts at a time inside a provider. */
export function MenuHoverPill({ itemValue, className }: { itemValue: string; className?: string }) {
  const hover = useMenuHoverPill();
  if (!hover || hover.activeValue !== itemValue) return null;

  return (
    <motion.div
      layoutId={hover.pillLayoutId}
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-md",
        MENU_HOVER_PILL_CLASS,
        className,
      )}
      transition={MENU_HOVER_PILL_TRANSITION}
    />
  );
}
