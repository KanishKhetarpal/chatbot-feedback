import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-1.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-[color,box-shadow] [&>svg]:shrink-0 leading-normal",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 dark:text-secondary-foreground",
        success: "border-transparent bg-success text-success-foreground [a&]:hover:bg-success/90",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        "primary-outline":
          "border border-primary text-primary [a&]:hover:bg-primary/90 dark:text-primary-foreground",
        "primary-light":
          "border border-primary/30 text-primary bg-primary/10 [a&]:hover:bg-primary/20 dark:text-primary-foreground",
        "primary-white":
          "border border-white text-white [a&]:hover:bg-primary/5 dark:text-primary-foreground",
        "success-light":
          "border border-success/30 text-success bg-success/10 [a&]:hover:bg-success/20 dark:text-success-foreground",
        "success-light-outline":
          "border border-success/30 text-success bg-transparent [a&]:hover:bg-success/10 dark:text-success-foreground",
        "warning-light":
          "border border-warning/30 text-warning bg-warning/10 [a&]:hover:bg-warning/20 dark:text-warning-foreground",
        "warning-outline":
          "border border-warning/30 text-warning [a&]:hover:bg-warning/90 dark:text-warning-foreground",
        "destructive-light":
          "border border-destructive/30 text-destructive bg-destructive/10 [a&]:hover:bg-destructive/20 dark:text-destructive-foreground",
        "destructive-outline":
          "border border-destructive/30 text-destructive [a&]:hover:bg-destructive/90 dark:text-destructive-foreground",
        "gold-light":
          "border border-gold-light/30 text-gold-light bg-gold-light/10 [a&]:hover:bg-gold-light/20 dark:text-gold-light-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);
export interface BadgeVariantProps {
  variant: keyof typeof badgeVariants;
}

export interface BadgeProps
  extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
