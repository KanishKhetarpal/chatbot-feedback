"use client";

import { useMemo, useState } from "react";
import type { Control, FieldValues, Path } from "react-hook-form";
import { Check, ChevronsUpDown, InfoIcon, X } from "lucide-react";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ResponsiveTooltipPopover } from "@/components/global/responsive-tooltip-popover";

interface MultiSelectTagsOption {
  value: string | number;
  label: string | React.ReactNode;
  searchKeys?: string[];
  selectedLabel?: string | React.ReactNode;
}

interface MultiSelectTagsFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  isLoading?: boolean;
  options?: MultiSelectTagsOption[];
  emptyText?: string;
  showErrorBadge?: boolean;
  maxSelect?: number;
  info?: string;
}

export function MultiSelectTagsField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder = "Select items...",
  isLoading = false,
  disabled = false,
  className = "",
  options = [],
  emptyText = "No options available",
  showErrorBadge = true,
  maxSelect,
  info,
}: MultiSelectTagsFieldProps<TFieldValues>) {
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState("$$dummy-selection-fix$$");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredOptions = options.filter((option) => {
    const term = searchTerm.toLowerCase();
    const label =
      typeof option.label === "string"
        ? option.label.toLowerCase()
        : String(option.value).toLowerCase();
    const selectedLabel =
      typeof option.selectedLabel === "string" ? option.selectedLabel.toLowerCase() : "";
    const searchKeys = option.searchKeys || [];
    return (
      label.includes(term) ||
      selectedLabel.includes(term) ||
      String(option.value).toLowerCase().includes(term) ||
      searchKeys.some((key) => key.toLowerCase().includes(term))
    );
  });

  const displayedOptions = filteredOptions.slice(0, 200);

  // Create lookup maps for efficient conversion between values and labels
  const valueToOptionMap = useMemo(() => {
    const map = new Map<string | number, MultiSelectTagsOption>();
    options.forEach((option) => {
      map.set(option.value, option);
    });
    return map;
  }, [options]);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        // Convert field values (IDs) to display labels with proper typing
        const fieldValues: (string | number)[] = Array.isArray(field.value) ? field.value : [];
        const selectedOptions = fieldValues
          .map((value: string | number) => {
            const option = valueToOptionMap.get(value);
            return {
              value,
              label: option ? (option.selectedLabel ?? option.label) : String(value),
            };
          })
          .filter((option) => option.label);

        // Handle selection/deselection
        const handleSelect = (optionValue: string | number) => {
          const currentValues: (string | number)[] = Array.isArray(field.value) ? field.value : [];
          const isSelected = currentValues.includes(optionValue);

          if (isSelected) {
            // Remove from selection
            field.onChange(currentValues.filter((value) => value !== optionValue));
          } else {
            // Check maxSelect limit
            if (maxSelect !== undefined) {
              if (maxSelect === 1) {
                // Special case for single select mode: replace selection
                field.onChange([optionValue]);
                return;
              }
              if (currentValues.length >= maxSelect) {
                // Limit reached - do not add new selection
                return;
              }
            }
            // Add to selection
            field.onChange([...currentValues, optionValue]);
          }
        };

        // Handle tag removal
        const handleRemoveTag = (optionValue: string | number) => {
          const currentValues: (string | number)[] = Array.isArray(field.value) ? field.value : [];
          field.onChange(currentValues.filter((value) => value !== optionValue));
        };

        return (
          <FormItem className="flex w-full flex-col">
            <FormLabel className="flex w-fit items-center text-sm text-muted-foreground">
              {label}
              {info && (
                <ResponsiveTooltipPopover
                  content={info}
                  trigger={<InfoIcon className="text-accent-foreground size-3" />}
                />
              )}
            </FormLabel>
            <Popover
              open={open}
              // See date-picker-with-year-field: non-modal popovers inside a
              // modal Dialog don't dismiss on outside click.
              modal
              onOpenChange={(newOpen) => {
                setOpen(newOpen);
                if (newOpen) {
                  setActiveValue("$$dummy-selection-fix$$");
                }
              }}
            >
              <PopoverTrigger asChild disabled={disabled}>
                <FormControl>
                  {isLoading ? (
                    <div
                      className={cn(
                        "border-input bg-background/50 flex min-h-9 w-full gap-2 rounded-md border px-2 py-1",
                        className,
                      )}
                    >
                      <Skeleton className="h-7 w-32 rounded-full" />
                      <Skeleton className="h-7 w-24 rounded-full" />
                      <Skeleton className="h-7 w-28 rounded-full" />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "border-input bg-background/50 ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex min-h-8 w-full items-center justify-between rounded-md border px-2 py-1 text-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                        disabled && "cursor-not-allowed opacity-50",
                        className,
                      )}
                      role="combobox"
                      aria-expanded={open}
                      // Remove explicit onClick as PopoverTrigger handles it
                      // but we need to ensure the click event propagates if PopoverTrigger relies on it
                      // or if PopoverTrigger adds its own onClick handler to this div.
                      // Since we are using asChild, this div receives the onClick from PopoverTrigger.
                    >
                      <div className="flex flex-1 flex-wrap gap-1">
                        {selectedOptions.length > 0 ? (
                          selectedOptions.map((option) => (
                            <Badge
                              key={option.value}
                              variant="outline"
                              className="bg-background/50 shrink-0 px-2 py-1"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              {option.label}
                              <button
                                className="hover:bg-muted ml-1 inline-flex h-4 w-4 items-center justify-center rounded-sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleRemoveTag(option.value);
                                }}
                                disabled={disabled}
                                type="button"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">{placeholder}</span>
                        )}
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </div>
                  )}
                </FormControl>
              </PopoverTrigger>

              <PopoverContent
                className="p-0"
                style={{ width: "var(--radix-popover-trigger-width)" }}
                align="start"
                onMouseLeave={() => setActiveValue("$$dummy-selection-fix$$")}
              >
                <Command value={activeValue} onValueChange={setActiveValue} shouldFilter={false}>
                  <CommandInput
                    placeholder="Search options..."
                    value={searchTerm}
                    onValueChange={setSearchTerm}
                  />
                  <CommandList className="max-h-70 w-full overflow-y-auto md:max-h-80">
                    <CommandEmpty>{emptyText}</CommandEmpty>
                    <CommandGroup>
                      {/* Dummy item to prevent auto-selection of first item */}
                      {filteredOptions.length > 0 && (
                        <CommandItem
                          value="$$dummy-selection-fix$$"
                          className="pointer-events-none h-0 min-h-0 w-0 min-w-0 p-0 opacity-0"
                          aria-hidden="true"
                          disabled
                        />
                      )}
                      {displayedOptions.map((option, index) => {
                        const isSelected = fieldValues.includes(option.value);

                        return (
                          <CommandItem
                            key={index}
                            value={String(index)}
                            onSelect={() => handleSelect(option.value)}
                            className={cn(
                              "hover:bg-accent/50! cursor-pointer",
                              isSelected ? "bg-accent text-accent-foreground" : "text-inherit!",
                            )}
                          >
                            {option.label}
                            <Check
                              className={cn(
                                "ml-auto h-4 w-4",
                                isSelected ? "opacity-100" : "opacity-0",
                              )}
                            />
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {showErrorBadge && <FormMessage />}
          </FormItem>
        );
      }}
    />
  );
}
