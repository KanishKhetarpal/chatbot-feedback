"use client";

import { Check, ChevronDown } from "lucide-react";
import { Slot as SlotPrimitive } from "radix-ui";
import * as React from "react";
import { useComposedRefs, cn } from "@/lib/utils";
import { VisuallyHiddenInput } from "@/components/visually-hidden-input";
import { useAsRef } from "@/hooks/use-as-ref";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import { useLazyRef } from "@/hooks/use-lazy-ref";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type Country,
  detectCountryFromNumber,
  getCachedCountries,
  getNationalNumberLength,
  MAX_TOTAL_DIGITS,
} from "@/lib/phone-countries";

const ROOT_NAME = "PhoneInput";
const COUNTRY_SELECT_NAME = "PhoneInputCountrySelect";
const FIELD_NAME = "PhoneInputField";

import * as FlagSvgs from "country-flag-icons/react/3x2";

type FlagSvgComponent = (typeof FlagSvgs)[keyof typeof FlagSvgs];

/**
 * Bundled SVG flags — not emoji. Windows has no flag glyphs for regional
 * indicators, so 🇮🇳 renders as the letters "IN". External PNG CDNs (flagcdn)
 * also fail on locked-down Windows networks and fall back to the same letters.
 */
function CountryFlag({ code, className }: { code: string; className?: string }) {
  const iso = code.toUpperCase();
  const Flag = (FlagSvgs as Record<string, FlagSvgComponent | undefined>)[iso];

  if (!Flag) {
    return (
      <span
        className={cn("text-[10px] font-semibold leading-none text-muted-foreground", className)}
      >
        {iso}
      </span>
    );
  }

  return <Flag aria-hidden className={cn("h-3.5 w-[18px] shrink-0 rounded-[2px]", className)} />;
}

/**
 * The dial code is rendered by the country select, so the field itself only ever
 * shows — and takes — the national part of the number.
 */
function getNationalPart(value: string, dialCode: string): string {
  const national = dialCode && value.startsWith(dialCode) ? value.slice(dialCode.length) : value;
  return national.replace(/\D/g, "");
}

function formatNationalNumber(digits: string): string {
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += 3) {
    groups.push(digits.slice(i, i + 3));
  }

  // A lone trailing digit reads as a typo, so it folds into the group before it
  // — a 10-digit number groups as `987 654 3210`, not `987 654 321 0`.
  const last = groups.length > 1 ? groups[groups.length - 1] : "";
  if (last?.length === 1) {
    groups.pop();
    groups[groups.length - 1] += last;
  }

  return groups.join(" ");
}

type RootElement = React.ComponentRef<typeof PhoneInput>;

interface StoreState {
  value: string;
  country: string;
  open: boolean;
}

interface Store {
  subscribe: (callback: () => void) => () => void;
  getState: () => StoreState;
  setState: <K extends keyof StoreState>(key: K, value: StoreState[K]) => void;
  notify: () => void;
}

const StoreContext = React.createContext<Store | null>(null);

function useStoreContext(consumerName: string) {
  const context = React.useContext(StoreContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``);
  }
  return context;
}

function useStore<T>(selector: (state: StoreState) => T, ogStore?: Store | null): T {
  const contextStore = React.useContext(StoreContext);

  const store = ogStore ?? contextStore;

  if (!store) {
    throw new Error(`\`useStore\` must be used within \`${ROOT_NAME}\``);
  }

  const getSnapshot = React.useCallback(() => selector(store.getState()), [store, selector]);

  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

interface PhoneInputContextValue {
  rootId: string;
  countries: Country[];
  placeholder: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  invalid?: boolean;
  showFlag: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

const PhoneInputContext = React.createContext<PhoneInputContextValue | null>(null);

function usePhoneInputContext(consumerName: string) {
  const context = React.useContext(PhoneInputContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``);
  }
  return context;
}

interface PhoneInputProps extends React.ComponentProps<"div"> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  defaultCountry?: string;
  country?: string;
  onCountryChange?: (country: string) => void;
  countries?: Country[];
  name?: string;
  placeholder?: string;
  asChild?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  invalid?: boolean;
  showFlag?: boolean;
}

function PhoneInput(props: PhoneInputProps) {
  const {
    value: valueProp,
    defaultValue,
    defaultCountry,
    country: countryProp,
    onValueChange,
    onCountryChange,
    countries = getCachedCountries(),
    name,
    placeholder = "Enter phone number",
    asChild,
    disabled,
    required,
    readOnly,
    invalid,
    showFlag = true,
    className,
    id,
    ref,
    ...rootProps
  } = props;

  const instanceId = React.useId();
  const rootId = id ?? instanceId;

  const inputRef = React.useRef<HTMLInputElement>(null);

  const [formTrigger, setFormTrigger] = React.useState<RootElement | null>(null);
  const composedRef = useComposedRefs(ref, (node) => setFormTrigger(node));
  const isFormControl = formTrigger ? !!formTrigger.closest("form") : true;

  const listenersRef = useLazyRef(() => new Set<() => void>());
  const stateRef = useLazyRef<StoreState>(() => ({
    value: valueProp ?? defaultValue ?? "",
    country: countryProp ?? defaultCountry ?? "",
    open: false,
  }));

  const propsRef = useAsRef({
    onValueChange,
    onCountryChange,
  });

  const store = React.useMemo<Store>(() => {
    return {
      subscribe: (cb) => {
        listenersRef.current.add(cb);
        return () => listenersRef.current.delete(cb);
      },
      getState: () => stateRef.current,
      setState: (key, value) => {
        if (Object.is(stateRef.current[key], value)) return;

        if (key === "value" && typeof value === "string") {
          stateRef.current.value = value;
          propsRef.current.onValueChange?.(value);
        } else if (key === "country" && typeof value === "string") {
          stateRef.current.country = value;
          propsRef.current.onCountryChange?.(value);
        } else {
          stateRef.current[key] = value;
        }

        store.notify();
      },
      notify: () => {
        for (const cb of listenersRef.current) {
          cb();
        }
      },
    };
  }, [listenersRef, stateRef, propsRef]);

  const value = useStore((state) => state.value, store);
  const country = useStore((state) => state.country, store);

  useIsomorphicLayoutEffect(() => {
    if (valueProp !== undefined) {
      store.setState("value", valueProp);
    }
  }, [valueProp]);

  useIsomorphicLayoutEffect(() => {
    if (countryProp !== undefined) {
      store.setState("country", countryProp);
    }
  }, [countryProp]);

  // Only an international value (a leading "+" that isn't the selected country's
  // own dial code — i.e. a paste) may override the chosen country. Detecting on a
  // number the user is still typing would flip the select to whichever country
  // happens to share the prefix.
  React.useEffect(() => {
    if (!value.startsWith("+")) return;

    const selectedDialCode = countries.find((c) => c.code === country)?.dialCode;
    if (selectedDialCode && value.startsWith(selectedDialCode)) return;

    const detected = detectCountryFromNumber(value, countries);
    if (detected && detected.code !== country) {
      store.setState("country", detected.code);
    }
  }, [value, countries, country, store]);

  const contextValue = React.useMemo<PhoneInputContextValue>(
    () => ({
      rootId,
      countries,
      placeholder,
      disabled,
      readOnly,
      required,
      invalid,
      showFlag,
      inputRef,
    }),
    [rootId, countries, placeholder, disabled, required, readOnly, invalid, showFlag],
  );

  const RootPrimitive = asChild ? SlotPrimitive.Slot : "div";

  return (
    <StoreContext.Provider value={store}>
      <PhoneInputContext.Provider value={contextValue}>
        <RootPrimitive
          role="group"
          data-slot="phone-input"
          data-disabled={disabled ? "" : undefined}
          data-invalid={invalid ? "" : undefined}
          data-readonly={readOnly ? "" : undefined}
          id={rootId}
          {...rootProps}
          ref={composedRef}
          className={cn(
            "relative flex h-10 w-full items-center rounded-md border border-input bg-background transition-colors has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 has-[[data-slot][aria-invalid=true]]:ring-[3px] has-[[data-slot][aria-invalid=true]]:ring-destructive/20 data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:bg-input/30 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",
            className,
          )}
        />
        {isFormControl && (
          <VisuallyHiddenInput
            type="hidden"
            control={formTrigger}
            name={name}
            value={value}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
          />
        )}
      </PhoneInputContext.Provider>
    </StoreContext.Provider>
  );
}

interface PhoneInputCountrySelectProps
  extends
    React.ComponentProps<typeof Popover>,
    Pick<React.ComponentProps<typeof PopoverTrigger>, "disabled" | "className"> {}

function PhoneInputCountrySelect(props: PhoneInputCountrySelectProps) {
  const {
    disabled: disabledProp,
    className,
    children,
    onOpenChange: onOpenChangeProp,
    ...popoverProps
  } = props;

  const { countries, inputRef, disabled, showFlag } = usePhoneInputContext(COUNTRY_SELECT_NAME);
  const store = useStoreContext(COUNTRY_SELECT_NAME);
  const country = useStore((state) => state.country);
  const open = useStore((state) => state.open);
  const onOpenChangeRef = useAsRef(onOpenChangeProp);

  const isDisabled = disabledProp || disabled;

  const countryContext = countries.find((c) => c.code === country);

  const onOpenChange = React.useCallback(
    (open: boolean) => {
      store.setState("open", open);
      onOpenChangeRef.current?.(open);
    },
    [store, onOpenChangeRef],
  );

  return (
    // `modal` is required, not cosmetic: this input is usually rendered inside a
    // Sheet/Dialog, whose react-remove-scroll lock swallows wheel events for any
    // portaled node outside its subtree — leaving the 239-country list unscrollable.
    // A modal Popover registers its own scroll lock, which takes precedence for its
    // own content. Still overridable through `popoverProps`.
    <Popover modal open={open} onOpenChange={onOpenChange} {...popoverProps}>
      <PopoverTrigger
        data-slot="phone-input-country-select"
        disabled={isDisabled}
        className={cn(
          "flex h-full shrink-0 items-center gap-1.5 rounded-l-md border-input border-r bg-transparent px-2.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:z-10 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
          className,
        )}
      >
        {!countryContext ? (
          <div className="h-4 w-6 rounded bg-muted/50" />
        ) : (
          <>
            {showFlag && <CountryFlag code={countryContext.code} />}
            <span className="tabular-nums">{countryContext.dialCode}</span>
          </>
        )}
        <ChevronDown className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {countries.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.name} ${c.dialCode} ${c.code}`}
                  onSelect={() => {
                    // Swap the dial code but keep whatever national digits are
                    // already typed. An empty field stays empty — the new dial
                    // code shows on the trigger, not in the form value.
                    const currentValue = store.getState().value;
                    const currentDialCode = countries.find((x) => x.code === country)?.dialCode;
                    // Re-truncate to the new country's max so switching from a
                    // longer-numbered country can't leave an over-long value behind.
                    const national = getNationalPart(currentValue, currentDialCode ?? "").slice(
                      0,
                      getNationalNumberLength(c.code).max,
                    );
                    const newValue = national ? c.dialCode + national : "";

                    store.setState("country", c.code);
                    store.setState("value", newValue);
                    store.setState("open", false);
                    requestAnimationFrame(() => {
                      inputRef.current?.focus();
                    });
                  }}
                >
                  {showFlag && <CountryFlag code={c.code} />}
                  <span className="flex-1">{c.name}</span>
                  <span className="text-muted-foreground">{c.dialCode}</span>
                  <Check
                    className={cn("size-4", country === c.code ? "opacity-100" : "opacity-0")}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PhoneInputField(props: React.ComponentProps<"input">) {
  const {
    onChange: onChangeProp,
    className,
    disabled: disabledProp,
    readOnly: readOnlyProp,
    required: requiredProp,
    ref,
    ...inputProps
  } = props;

  const { inputRef, disabled, invalid, readOnly, required, placeholder, countries } =
    usePhoneInputContext(FIELD_NAME);
  const store = useStoreContext(FIELD_NAME);
  const value = useStore((state) => state.value);
  const country = useStore((state) => state.country);

  const dialCode = React.useMemo(
    () => countries.find((c) => c.code === country)?.dialCode ?? "",
    [countries, country],
  );

  const composedRef = useComposedRefs(ref, inputRef);

  const onChangeRef = useAsRef(onChangeProp);
  const dialCodeRef = useAsRef(dialCode);
  const countryRef = useAsRef(country);
  const countriesRef = useAsRef(countries);

  const isDisabled = disabledProp || disabled;
  const isReadOnly = readOnlyProp || readOnly;
  const isRequired = requiredProp || required;

  const onChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (isDisabled || isReadOnly) return;

      onChangeRef.current?.(event);
      if (event.defaultPrevented) return;

      const inputValue = event.target.value;
      let digits = inputValue.replace(/\D/g, "");

      // Truncate typing past the active country's max length so the input can
      // never hold a number the validators would reject as too long. The manually
      // picked country wins while the digits still fit its dial code; a pasted
      // international value falls back to dial-code detection.
      if (inputValue.startsWith("+")) {
        const selected = countriesRef.current.find((c) => c.code === countryRef.current);
        const active =
          selected && digits.startsWith(selected.dialCode.slice(1))
            ? selected
            : detectCountryFromNumber(`+${digits}`, countriesRef.current);
        const maxDigits = active
          ? active.dialCode.length - 1 + getNationalNumberLength(active.code).max
          : MAX_TOTAL_DIGITS;
        digits = digits.slice(0, maxDigits);
      } else {
        digits = digits.slice(0, getNationalNumberLength(countryRef.current).max);
      }

      // Typed digits are the national part, so they go behind the selected
      // country's dial code. A pasted international number keeps its own "+"
      // prefix and lets the root's detection pick the country.
      let newValue = "";
      if (digits) {
        newValue = inputValue.startsWith("+") ? `+${digits}` : `${dialCodeRef.current}${digits}`;
      }

      store.setState("value", newValue);
    },
    [store, onChangeRef, dialCodeRef, countryRef, countriesRef, isDisabled, isReadOnly],
  );

  const displayValue = React.useMemo(
    () => formatNationalNumber(getNationalPart(value, dialCode)),
    [value, dialCode],
  );

  return (
    <Input
      type="tel"
      inputMode="tel"
      aria-required={isRequired}
      aria-invalid={invalid}
      data-slot="phone-input-field"
      disabled={isDisabled}
      readOnly={isReadOnly}
      required={isRequired}
      {...inputProps}
      ref={composedRef}
      className={cn(
        "h-full flex-1 rounded-r-md rounded-l-none border-0 bg-transparent shadow-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:bg-transparent aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:bg-transparent dark:aria-invalid:ring-destructive/40 dark:disabled:bg-transparent",
        className,
      )}
      placeholder={placeholder}
      value={displayValue}
      onChange={onChange}
    />
  );
}

export {
  PhoneInput,
  PhoneInputCountrySelect,
  PhoneInputField,
  type PhoneInputProps,
  useStore as usePhoneInput,
};
