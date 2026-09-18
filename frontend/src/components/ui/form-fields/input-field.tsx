import type { Control, FieldValues, Path } from "react-hook-form";
import type { ChangeEvent, HTMLInputTypeAttribute, ReactNode } from "react";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface InputFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
  placeholder?: string;
  type?: HTMLInputTypeAttribute;
  disabled?: boolean;
  className?: string;
  isLoading?: boolean;
  valueOverride?: string | number;
  readOnly?: boolean;
  showErrorBadge?: boolean;
  labelClassName?: string;
  maxLength?: number;
  showCharCount?: boolean;
  required?: boolean;
  /** Decorative icon rendered inside the input on the left (e.g. `<Mail />`). */
  leadingIcon?: ReactNode;
  autoComplete?: string;
}

export function InputField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  type = "text",
  isLoading = false,
  disabled = false,
  className = "",
  valueOverride,
  showErrorBadge = true,
  readOnly = false,
  labelClassName,
  maxLength,
  showCharCount = false,
  required = false,
  leadingIcon,
  autoComplete,
}: InputFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-end justify-between gap-2">
            <FormLabel className={cn("text-sm text-muted-foreground", labelClassName)}>
              {label}
              {required && <span className="text-destructive ml-1">*</span>}
            </FormLabel>
            {showCharCount && maxLength ? (
              <span className="text-muted-foreground text-xs">
                {String(valueOverride ?? field.value ?? "").length}/{maxLength}
              </span>
            ) : null}
          </div>
          <FormControl>
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <div className="group/input relative">
                {leadingIcon ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within/input:text-primary [&_svg]:size-4"
                  >
                    {leadingIcon}
                  </span>
                ) : null}
                <Input
                  type={type}
                  placeholder={placeholder}
                  className={cn("h-8 placeholder:text-sm", leadingIcon && "pl-9.5", className)}
                  {...field}
                  value={(valueOverride ?? field.value ?? "") as string | number}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const nextValue = e.target.value;
                    field.onChange(maxLength ? nextValue.slice(0, maxLength) : nextValue);
                  }}
                  maxLength={maxLength}
                  disabled={disabled}
                  readOnly={readOnly}
                  autoComplete={autoComplete}
                />
              </div>
            )}
          </FormControl>
          {showErrorBadge && <FormMessage />}
        </FormItem>
      )}
    />
  );
}
