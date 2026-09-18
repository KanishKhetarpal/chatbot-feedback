import { createContext, type ReactNode } from "react";

/**
 * Slot after the page title, filled by a parent (the reports layout pins a
 * report here) without every caller threading `titleExtra`.
 */
export const PageHeaderAfterTitleContext = createContext<ReactNode>(null);
