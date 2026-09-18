import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { Loader } from "lucide-react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[1px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer relative overflow-hidden isolate after:pointer-events-none after:content-[''] after:absolute after:top-[-50px] after:left-[-75px] after:h-[155px] after:w-[50px] after:rotate-[35deg] after:bg-white/20 dark:after:bg-white/10 after:-z-10 after:transition-[left] after:duration-[550ms] after:ease-[cubic-bezier(0.19,1,0.22,1)] hover:after:left-[120%] motion-reduce:after:transition-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background/50 shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        "outline-primary":
          "border border-primary text-primary bg-background/50 shadow-xs hover:bg-primary/10 hover:text-primary",
        dashed:
          "border border-dashed border-muted-foreground/40 bg-muted/20 hover:bg-muted/50 hover:border-primary/50 hover:text-primary text-muted-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        "light-success": "bg-success/10 text-success hover:bg-success/20",
        "light-destructive": "bg-destructive/10 text-destructive hover:bg-destructive/20",
        noStyle: "bg-transparent shadow-none after:hidden",
      },
      size: {
        noStyle: "h-full shrink-0 rounded-full",
        default: "h-8 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 px-2 py-1 has-[>svg]:px-2",
        sm: "h-7 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-9 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  tooltip?: string;
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  loading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      tooltip,
      loading,
      loadingText,
      tooltipPlacement = "top",
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    const baseClass = cn(
      buttonVariants({ variant, size, className }),
      loading && "pointer-events-none overflow-hidden",
    );

    // An icon-only button has no text node, so it has no accessible name — a
    // screen reader just announces "button". A `tooltip` does not fix that:
    // Radix wires tooltips up as `aria-describedby`, which is a description,
    // not a name. Reuse the tooltip text as the name for `size="icon"` only.
    // Restricting it to that size matters: on a button that *does* have visible
    // text, an aria-label would replace that text as the accessible name and
    // break "label in name" (WCAG 2.5.3). Spread order lets an explicit
    // aria-label / aria-labelledby on the call site win.
    const iconOnlyLabel = size === "icon" && tooltip ? tooltip : undefined;

    let buttonElement: React.ReactElement;

    if (asChild) {
      const onlyChild = React.Children.only(children as React.ReactElement);
      const { className: childClassName, ...childProps } = (onlyChild as any).props || {};
      buttonElement = React.cloneElement(onlyChild, {
        "aria-label": iconOnlyLabel,
        ...childProps,
        ...props,
        className: cn(baseClass, childClassName),
        "aria-busy": loading,
        "aria-disabled": loading || props.disabled,
        ref: ref as any,
      });
    } else {
      buttonElement = (
        <Comp
          className={baseClass}
          ref={ref}
          disabled={props.disabled}
          aria-busy={loading}
          aria-disabled={loading || props.disabled}
          aria-label={iconOnlyLabel}
          {...props}
        >
          {children}
          {loading && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-inherit"
            >
              <Loader className={cn("size-4 animate-spin")} />
            </span>
          )}
        </Comp>
      );
    }

    if (tooltip) {
      return (
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            {/*
             * A disabled button gets `pointer-events-none`, so it never fires the
             * hover the tooltip listens for. Wrap it so the span catches it —
             * otherwise "why is this disabled?" tooltips silently never show.
             */}
            <TooltipTrigger asChild>
              {props.disabled ? (
                <span className="inline-flex">{buttonElement}</span>
              ) : (
                buttonElement
              )}
            </TooltipTrigger>
            <TooltipContent side={tooltipPlacement}>
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return buttonElement;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
