"use client";

import { useState, type KeyboardEvent } from "react";
import type { Control, FieldValues, Path } from "react-hook-form";
import { X } from "lucide-react";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TagsFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  label: string;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  maxTags?: number;
  maxTagLength?: number;
  showErrorBadge?: boolean;
  validateTag?: (tag: string) => string | null;
  /** Canonicalise a tag before it is validated and stored, e.g. an origin URL. */
  transformTag?: (tag: string) => string;
}

export function TagsField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder = "Type and press Enter",
  hint,
  disabled = false,
  className,
  maxTags,
  maxTagLength = 120,
  showErrorBadge = true,
  validateTag,
  transformTag,
}: TagsFieldProps<TFieldValues>) {
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const values: string[] = Array.isArray(field.value) ? field.value : [];
        const atLimit = maxTags !== undefined && values.length >= maxTags;

        function commit(raw: string) {
          const trimmed = raw.trim();
          if (!trimmed) return;
          const tag = transformTag ? transformTag(trimmed) : trimmed;
          if (!tag) return;

          if (atLimit) {
            setLocalError(`You can add at most ${maxTags} items`);
            return;
          }

          if (tag.length > maxTagLength) {
            setLocalError(`Each item must be ≤ ${maxTagLength} characters`);
            return;
          }

          if (values.includes(tag)) {
            setLocalError("Already added");
            return;
          }

          const customError = validateTag?.(tag) ?? null;
          if (customError) {
            setLocalError(customError);
            return;
          }

          field.onChange([...values, tag]);
          setDraft("");
          setLocalError(null);
        }

        function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && values.length) {
            field.onChange(values.slice(0, -1));
            setLocalError(null);
          }
        }

        return (
          <FormItem className="flex w-full flex-col">
            <div className="flex items-end justify-between gap-2">
              <FormLabel className="text-sm text-muted-foreground">{label}</FormLabel>
              {maxTags ? (
                <span className="text-xs text-muted-foreground">
                  {values.length}/{maxTags}
                </span>
              ) : null}
            </div>
            <FormControl>
              <div
                className={cn(
                  "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5",
                  disabled && "opacity-50",
                  className,
                )}
              >
                {values.map((tag) => (
                  <Badge key={tag} variant="outline" className="gap-1 bg-background/50 px-2 py-0.5">
                    <span className="max-w-56 truncate">{tag}</span>
                    <button
                      type="button"
                      className="inline-flex size-4 items-center justify-center rounded-sm hover:bg-muted"
                      disabled={disabled}
                      onClick={() => {
                        field.onChange(values.filter((v) => v !== tag));
                        setLocalError(null);
                      }}
                      aria-label={`Remove ${tag}`}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                <Input
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (localError) setLocalError(null);
                  }}
                  onKeyDown={onKeyDown}
                  onBlur={() => {
                    if (draft.trim()) commit(draft);
                  }}
                  placeholder={atLimit ? "Limit reached" : placeholder}
                  disabled={disabled || atLimit}
                  className="h-7 min-w-40 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                />
              </div>
            </FormControl>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
            {localError ? (
              <p className="text-sm font-medium text-destructive">{localError}</p>
            ) : null}
            {showErrorBadge ? <FormMessage /> : null}
          </FormItem>
        );
      }}
    />
  );
}
