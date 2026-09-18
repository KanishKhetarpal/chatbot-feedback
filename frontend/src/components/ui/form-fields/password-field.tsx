import type { Control, FieldValues, Path } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { PasswordInput } from "../password-input";
import { ResponsiveTooltipPopover } from "@/components/global/responsive-tooltip-popover";
import { cn } from "@/lib/utils";

interface PasswordFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
  placeholder?: string;
  rightAction?: ReactNode;
  info?: string;
  className?: string;
  labelClassName?: string;
  disabled?: boolean;
  /** Decorative icon rendered inside the input on the left (e.g. `<Lock />`). */
  leadingIcon?: ReactNode;
  autoComplete?: string;
}

export function PasswordField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  info,
  rightAction,
  className,
  labelClassName,
  disabled,
  leadingIcon,
  autoComplete,
}: PasswordFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="grid gap-2">
          <div className="flex flex-wrap items-center">
            <FormLabel className={cn("flex items-center gap-1", labelClassName)}>
              {label}
              {info && (
                <ResponsiveTooltipPopover
                  trigger={<Info className="text-muted-foreground size-3" />}
                  content={<p className="text-xs">{info}</p>}
                />
              )}
            </FormLabel>
            {rightAction}
          </div>
          <FormControl>
            <div className="group/input relative">
              {leadingIcon ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within/input:text-primary [&_svg]:size-4"
                >
                  {leadingIcon}
                </span>
              ) : null}
              <PasswordInput
                {...field}
                placeholder={placeholder}
                className={cn(leadingIcon && "pl-9.5", className)}
                disabled={disabled}
                autoComplete={autoComplete}
              />
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
