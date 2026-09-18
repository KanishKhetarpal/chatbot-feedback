import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;
type PopoverContentProps = React.ComponentProps<typeof PopoverPrimitive.Content> & {
  showArrow?: boolean;
  arrowClassName?: string;
};

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  showArrow = false,
  arrowClassName = "",
  children,
  onWheel,
  onTouchMove,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-[200] w-72 origin-(--radix-popover-content-transform-origin) rounded-md border px-3 py-1.5 shadow-md outline-hidden",
          className,
        )}
        // Bubble phase — let the list scroll first, then keep the wheel off the Dialog scroll lock.
        onWheel={(e) => {
          e.stopPropagation();
          onWheel?.(e);
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          onTouchMove?.(e);
        }}
        {...props}
      >
        {children}
        {showArrow ? (
          <PopoverPrimitive.Arrow
            className={cn(
              "bg-popover fill-popover z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px]",
              arrowClassName,
            )}
          />
        ) : null}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
