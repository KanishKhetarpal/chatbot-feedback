"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronRight, Circle } from "lucide-react";

import { cn, useComposedRefs } from "@/lib/utils";
import {
  MenuHoverPill,
  MenuHoverPillProvider,
  MenuSelectedAnchor,
  useMenuHoverPill,
} from "@/components/ui/menu-hover-pill";

const DropdownMenu = DropdownMenuPrimitive.Root;

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, onPointerEnter, ...props }, ref) => {
  const hover = useMenuHoverPill();
  const itemId = React.useId();
  const itemRef = React.useRef<HTMLDivElement>(null);
  const composedRef = useComposedRefs(ref, itemRef);
  const [isOpen, setIsOpen] = React.useState(false);

  React.useLayoutEffect(() => {
    const el = itemRef.current;
    if (!el) return;
    const sync = () => setIsOpen(el.getAttribute("data-state") === "open");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ["data-state"] });
    return () => observer.disconnect();
  }, []);

  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={composedRef}
      className={cn(
        "relative isolate flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        inset && "pl-8",
        className,
      )}
      onPointerEnter={(event) => {
        hover?.setHoveredValue(itemId);
        onPointerEnter?.(event);
      }}
      {...props}
    >
      {isOpen ? <MenuSelectedAnchor value={itemId} /> : null}
      <MenuHoverPill itemValue={itemId} />
      {children}
      <ChevronRight className="relative z-10 ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  );
});
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, children, sideOffset = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden scrollbar-thin rounded-xl border bg-popover p-1 text-popover-foreground shadow-elev-3 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-dropdown-menu-content-transform-origin)",
      className,
    )}
    {...props}
  >
    <MenuHoverPillProvider>{children}</MenuHoverPillProvider>
  </DropdownMenuPrimitive.SubContent>
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, children, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden scrollbar-thin rounded-xl border bg-popover p-1 text-popover-foreground shadow-elev-3",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-dropdown-menu-content-transform-origin)",
        className,
      )}
      {...props}
    >
      <MenuHoverPillProvider>{children}</MenuHoverPillProvider>
    </DropdownMenuPrimitive.Content>
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const dropdownMenuItemVariants = cva(
  "relative isolate flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "",
        destructive: "text-destructive focus:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    /** Parks the hover pill on this row when nothing is hovered (e.g. current filter value). */
    selected?: boolean;
  } & VariantProps<typeof dropdownMenuItemVariants>
>(({ className, inset, variant, selected, onPointerEnter, children, asChild, ...props }, ref) => {
  const hover = useMenuHoverPill();
  const itemId = React.useId();

  const decorations = (
    <>
      {selected ? <MenuSelectedAnchor value={itemId} /> : null}
      <MenuHoverPill itemValue={itemId} />
    </>
  );

  // `asChild` hands the lone child to Radix's Slot, which throws on anything
  // but a single element — so the pill has to nest *inside* that child rather
  // than sit beside it. The item's `relative` class is merged onto the child
  // too, so the absolutely-positioned pill still anchors to the right box.
  const content =
    asChild && React.isValidElement<{ children?: React.ReactNode }>(children) ? (
      React.cloneElement(children, undefined, decorations, children.props.children)
    ) : (
      <>
        {decorations}
        {children}
      </>
    );

  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      asChild={asChild}
      className={cn(dropdownMenuItemVariants({ variant }), inset && "pl-8", className)}
      onPointerEnter={(event) => {
        hover?.setHoveredValue(itemId);
        onPointerEnter?.(event);
      }}
      {...props}
    >
      {content}
    </DropdownMenuPrimitive.Item>
  );
});
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, onPointerEnter, ...props }, ref) => {
  const hover = useMenuHoverPill();
  const itemId = React.useId();

  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        "relative isolate flex cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      checked={checked}
      onPointerEnter={(event) => {
        hover?.setHoveredValue(itemId);
        onPointerEnter?.(event);
      }}
      {...props}
    >
      <MenuHoverPill itemValue={itemId} />
      <span
        className={cn(
          "absolute left-2 z-10 flex size-4 items-center justify-center rounded border transition-colors",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 bg-background",
        )}
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-3" strokeWidth={3} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {/* Flex, like dropdownMenuItemVariants: Tailwind preflight makes svg a
          block element, so in a plain span an icon passed alongside the label
          stacks ABOVE it instead of sitting beside it. */}
      <span className="relative z-10 flex min-w-0 items-center gap-2 [&>svg]:size-4 [&>svg]:shrink-0">
        {children}
      </span>
    </DropdownMenuPrimitive.CheckboxItem>
  );
});
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, onPointerEnter, value, ...props }, ref) => {
  const hover = useMenuHoverPill();
  const fallbackId = React.useId();
  const itemId = value || fallbackId;

  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      value={value}
      className={cn(
        "relative isolate flex cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      onPointerEnter={(event) => {
        hover?.setHoveredValue(itemId);
        onPointerEnter?.(event);
      }}
      {...props}
    >
      <MenuHoverPill itemValue={itemId} />
      <span className="absolute left-2 z-10 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <MenuSelectedAnchor value={itemId} />
          <Circle className="h-2 w-2 fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {/* Flex for the same reason as the checkbox item above. */}
      <span className="relative z-10 flex min-w-0 items-center gap-2 [&>svg]:size-4 [&>svg]:shrink-0">
        {children}
      </span>
    </DropdownMenuPrimitive.RadioItem>
  );
});
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span className={cn("ml-auto text-xs tracking-widest opacity-60", className)} {...props} />
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
