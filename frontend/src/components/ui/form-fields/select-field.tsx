"use client";
import { useState } from "react";
import type { Control, FieldValues, Path } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
  options?: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  isLoading?: boolean;
  size?: "sm" | "default";
  showErrorBadge?: boolean;
  labelClassName?: string;
  required?: boolean;
}

export const SelectField = <TFieldValues extends FieldValues>({
  control,
  name,
  label,
  options = [],
  placeholder = "Select...",
  disabled,
  className,
  isLoading,
  size = "sm",
  showErrorBadge = true,
  labelClassName,
  required = false,
}: SelectFieldProps<TFieldValues>) => {
  const [open, setOpen] = useState(false);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const raw = field.value;
        const hasValue = raw !== undefined && raw !== null && String(raw) !== "";
        const currentValue = hasValue ? String(raw) : undefined;

        // Radix Select only renders a label when `value` matches a SelectItem.
        // Keep unknown/legacy stored values visible by injecting them into the list.
        const optionsWithCurrent =
          currentValue && !options.some((o) => String(o.value) === currentValue)
            ? [...options, { value: currentValue, label: currentValue }]
            : options;

        return (
          <FormItem>
            <div className="flex items-end justify-between gap-2">
              <FormLabel className={cn("text-sm text-muted-foreground", labelClassName)}>
                {label}
                {required && <span className="text-destructive ml-1">*</span>}
              </FormLabel>
            </div>
            <FormControl>
              <Select
                value={currentValue}
                onValueChange={(val) => {
                  const matched = optionsWithCurrent.find((o) => String(o.value) === String(val));
                  field.onChange(matched ? matched.value : val);
                }}
                open={open}
                // Mark the field touched on close, so `onTouched` forms surface a
                // "required" error as soon as the user dismisses the list empty.
                onOpenChange={(next) => {
                  setOpen(next);
                  if (!next) field.onBlur();
                }}
                disabled={disabled || isLoading}
              >
                <SelectTrigger
                  className={cn("h-8 w-full min-w-0 truncate", className)}
                  size={size}
                  isLoading={isLoading}
                  disabled={disabled}
                  // Opening the list also blurs the trigger — only count a real focus-out.
                  onBlur={() => {
                    if (!open) field.onBlur();
                  }}
                >
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent className="max-h-[400px] overflow-auto">
                  {!isLoading && optionsWithCurrent.length === 0 ? (
                    <SelectItem value="__no_option__" disabled>
                      No option
                    </SelectItem>
                  ) : (
                    optionsWithCurrent.map((opt) => (
                      <SelectItem key={String(opt.value)} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </FormControl>
            {showErrorBadge && <FormMessage />}
          </FormItem>
        );
      }}
    />
  );
};

export default SelectField;
