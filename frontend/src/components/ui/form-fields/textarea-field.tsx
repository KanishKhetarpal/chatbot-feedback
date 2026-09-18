import type { Control, FieldValues, Path } from 'react-hook-form'

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'

interface TextareaFieldProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>
  name: Path<TFieldValues>
  label: string
  placeholder?: string
  rows?: number
  maxLength?: number
  className?: string
  disabled?: boolean
  showError?: boolean
  required?: boolean
}

export function TextareaField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  rows = 4,
  maxLength,
  className,
  disabled = false,
  showError = true,
  required = false,
}: TextareaFieldProps<TFieldValues>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="text-sm">
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </FormLabel>
          <FormControl>
            <Textarea
              placeholder={placeholder}
              rows={rows}
              maxLength={maxLength}
              className={className}
              disabled={disabled}
              {...field}
              value={field.value ?? ''}
            />
          </FormControl>
          {maxLength && (
            <div className="text-muted-foreground text-right text-xs">
              {field.value?.length || 0} / {maxLength} characters
            </div>
          )}
          {showError && <FormMessage />}
        </FormItem>
      )}
    />
  )
}
