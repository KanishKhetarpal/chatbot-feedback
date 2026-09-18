import { useEffect, useState } from "react";
import { useFormContext, useWatch, type Control } from "react-hook-form";
import { ChevronDown, Plus } from "lucide-react";

import { Badge } from "@/components/ui-kit";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { InputField } from "@/components/ui/form-fields/input-field";
import { MultiSelectTagsField } from "@/components/ui/form-fields/multi-select-tags-field";
import { SelectField } from "@/components/ui/form-fields/select-field";
import { SwitchField } from "@/components/ui/form-fields/switch-field";
import { TagsField } from "@/components/ui/form-fields/tags-field";
import { TextareaField } from "@/components/ui/form-fields/textarea-field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CHAT_AGENT_LANGUAGES, CHAT_AGENT_LEAD_FIELD_OPTIONS } from "@/lib/chat-agent-constants";
import type { ChatAgentFormValues } from "@/zod/chat-agent-schema";
import { capitalizeWords, cn } from "@/lib/utils";
import type { ChatAgentOptions } from "@/types/chat-agent-types";

type AgentControl = Control<ChatAgentFormValues>;

/** Grouping header inside a settings tab — keeps long forms scannable. */
export function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="space-y-0.5">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * A radio option rendered as a full card.
 *
 * These choices carry consequences a one-word label cannot convey — "blended"
 * silently permits the chatbot to state things about the university that are not
 * true — so each one gets room to say what it does.
 */
function ChoiceCard({
  value,
  title,
  body,
  selected,
}: {
  value: string;
  title: string;
  body: string;
  selected: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors",
        selected ? "border-primary bg-primary/8" : "border-border hover:border-primary/40",
      )}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{body}</span>
      </span>
    </label>
  );
}

/* ── Identity ────────────────────────────────────────────────────────────── */

export function IdentitySection({ control }: { control: AgentControl }) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionHeading
          title="Internal"
          hint="How your team recognises this chatbot. Never shown to a visitor and never sent to the model."
        />
        <InputField
          control={control}
          name="name"
          label="Chatbot name"
          placeholder="Admissions Assistant"
          maxLength={120}
          showCharCount
          required
        />
        <TextareaField
          control={control}
          name="description"
          label="Description"
          placeholder="Internal note — which site it runs on, who owns it."
          rows={3}
          maxLength={2000}
        />
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <SectionHeading
          title="What visitors see"
          hint="The words on the widget itself. The preview updates as you type."
        />
        <InputField
          control={control}
          name="avatarUrl"
          label="Avatar URL"
          placeholder="https://…"
          type="url"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            control={control}
            name="heading"
            label="Heading"
            placeholder="Hi there 👋"
            maxLength={120}
            showCharCount
          />
          <InputField
            control={control}
            name="subheading"
            label="Subheading"
            placeholder="Ask us anything about admissions"
            maxLength={200}
            showCharCount
          />
        </div>
        <TextareaField
          control={control}
          name="greeting"
          label="Greeting"
          placeholder="First message visitors see when the chat opens."
          rows={3}
          maxLength={1000}
        />
        <TagsField
          control={control}
          name="messagePresets"
          label="Quick reply chips"
          placeholder="e.g. What are the fees?"
          hint="Max 4. Write them as questions a visitor would actually ask."
          maxTags={4}
          maxTagLength={120}
        />
        <InputField
          control={control}
          name="inputPlaceholder"
          label="Input placeholder"
          placeholder="Ask a question…"
          maxLength={120}
          showCharCount
        />
      </section>
    </div>
  );
}

/* ── Behaviour ───────────────────────────────────────────────────────────── */

/**
 * Starter rules for the advanced-instructions box, insertable with one click.
 *
 * Not decoration: the empty box is the hard part of this field. An author who
 * needs a rule usually cannot picture what one looks like, and these three
 * show the register — one behaviour, stated plainly, in a sentence.
 */
const INSTRUCTION_STARTERS = [
  "Always give fees in ₹ and mention they can change each academic year.",
  "If asked about scholarships, explain the criteria but never promise amounts.",
  "When a question is about hostels, mention rooms are allotted first-come, first-served.",
];

export function BehaviourSection({
  control,
  options,
}: {
  control: AgentControl;
  options?: ChatAgentOptions;
}) {
  const toneOptions = (options?.tones ?? []).map((t) => ({ value: t, label: capitalizeWords(t) }));
  const lengthOptions = (options?.responseLengths ?? []).map((t) => ({
    value: t,
    label: capitalizeWords(t),
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          control={control}
          name="tone"
          label="Tone"
          options={toneOptions}
          placeholder="Select tone"
        />
        <SelectField
          control={control}
          name="responseLength"
          label="Response length"
          options={lengthOptions}
          placeholder="Select length"
        />
      </div>

      <SelectField
        control={control}
        name="language"
        label="Language"
        options={CHAT_AGENT_LANGUAGES}
        placeholder="Select language"
      />

      <SwitchField
        control={control}
        name="useEmoji"
        label="Use emoji"
        description="Allow occasional emoji in replies when it fits the tone."
      />

      <SwitchField
        control={control}
        name="qualificationEnabled"
        label="Ask qualifying questions"
        description="When on, the chatbot asks about programme, year, level and city while answering. Off = pure Q&A."
      />

      <FormField
        control={control}
        name="knowledgeMode"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormLabel className="text-sm text-muted-foreground">Knowledge mode</FormLabel>
            <FormControl>
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3">
                <ChoiceCard
                  value="strict"
                  selected={field.value === "strict"}
                  title="Only our content (recommended)"
                  body="Answers come only from the sources you have added. If the answer isn't there, it says so instead of guessing."
                />
                <ChoiceCard
                  value="blended"
                  selected={field.value === "blended"}
                  title="Our content plus general knowledge"
                  body="It may fall back on what the model already knows. Faster to feel useful, but it can state things about the university that aren't true."
                />
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <TextareaField
        control={control}
        name="fallbackMessage"
        label="Fallback message"
        placeholder="I don't have that detail — call admissions on 080-…"
        rows={3}
        maxLength={1000}
      />

      <TagsField
        control={control}
        name="restrictedTopics"
        label="Restricted topics"
        placeholder="Never discuss…"
        hint="Subjects the chatbot must refuse, however it is asked."
        maxTags={20}
        maxTagLength={120}
      />

      <AdvancedInstructions control={control} />
    </div>
  );
}

/**
 * The free-text escape hatch, dressed so it never looks like a dead row.
 *
 * The old version was a bare title with a chevron: collapsed, a chatbot with
 * two thousand characters of custom rules was indistinguishable from one with
 * none, and opening it revealed a naked textarea with no hint of what a rule
 * should look like. Now the closed row carries the state (an "In use" badge
 * and the character count), it opens itself for a chatbot that already has
 * rules, and the empty state offers starter rules to insert instead of a
 * blank box.
 */
function AdvancedInstructions({ control }: { control: AgentControl }) {
  const { setValue } = useFormContext<ChatAgentFormValues>();
  const instructions = useWatch({ control, name: "instructions" }) ?? "";
  const hasInstructions = instructions.trim().length > 0;

  const [open, setOpen] = useState(false);
  // Chatbot data lands via a form reset after mount, so "already has rules"
  // is only knowable here: pop the drawer open the moment it becomes true.
  // Closing it again sticks — this fires only on the false → true edge.
  useEffect(() => {
    if (hasInstructions) setOpen(true);
  }, [hasInstructions]);

  const insertStarter = (rule: string) =>
    setValue(
      "instructions",
      hasInstructions ? `${instructions.replace(/\s+$/, "")}\n${rule}` : rule,
      { shouldDirty: true },
    );
  const unusedStarters = INSTRUCTION_STARTERS.filter((s) => !instructions.includes(s));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-left hover:bg-muted/60">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-medium">
            Advanced instructions
            {hasInstructions ? <Badge tone="info-light">In use</Badge> : null}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {hasInstructions
              ? `${instructions.length.toLocaleString()} characters, sent with every reply.`
              : "Extra rules in your own words, layered on the settings above. Most teams never need them."}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-4">
        <TextareaField
          control={control}
          name="instructions"
          label="Extra rules in your own words"
          placeholder={
            "One rule per line, written as a plain sentence.\nKeep facts in Knowledge — this is for how the chatbot behaves, not what it knows."
          }
          rows={8}
          maxLength={20_000}
        />
        <div className="flex justify-end">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {instructions.length.toLocaleString()} / 20,000
          </span>
        </div>
        {/* Full-width rows, not chips: a rule is a sentence, and a sentence
            folded into a pill cannot be read before deciding to add it. */}
        {unusedStarters.length > 0 ? (
          <div className="rounded-lg border border-border/70 bg-muted/30 p-1.5">
            <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium text-muted-foreground">
              Need a starting point? Click a rule to add it.
            </p>
            {unusedStarters.map((rule) => (
              <button
                key={rule}
                type="button"
                onClick={() => insertStarter(rule)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs leading-relaxed text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                {rule}
              </button>
            ))}
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ── Model ───────────────────────────────────────────────────────────────── */

export function ModelSection({
  control,
  options,
}: {
  control: AgentControl;
  options?: ChatAgentOptions;
}) {
  // Tier first, then the model it currently resolves to: an author picks by
  // tier, but "Standard" alone does not say what is being paid for. Falls back
  // to the bare tier label when an older API build sends no `modelName`.
  const modelOptions = (options?.models ?? []).map((m) => ({
    value: m.id,
    label: m.modelName ? `${m.label} · ${m.modelName}` : m.label,
  }));

  const effortOptions = (options?.effortLevels ?? []).map((e) => ({
    value: e.value,
    label: e.label,
  }));

  const modelId = useWatch({ control, name: "model" });
  const selected = options?.models.find((m) => m.id === modelId);

  return (
    <div className="space-y-6">
      <SelectField
        control={control}
        name="model"
        label="Model"
        options={modelOptions}
        placeholder="Select model"
      />
      {selected ? (
        <p className="-mt-3 text-xs leading-relaxed text-muted-foreground">
          {selected.description}
          {selected.contextWindow
            ? ` · ${selected.contextWindow.toLocaleString()} token context window`
            : ""}
        </p>
      ) : null}

      <SelectField
        control={control}
        name="effort"
        label="Effort"
        options={effortOptions}
        placeholder="Select effort"
      />

      <FormField
        control={control}
        name="maxTokens"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm text-muted-foreground">Max reply tokens</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={128}
                max={8192}
                className="h-9 max-w-40"
                value={field.value}
                onChange={(event) => field.onChange(Number(event.target.value))}
              />
            </FormControl>
            <p className="text-xs text-muted-foreground">
              128–8192. Caps how long a single reply can run.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

/* ── Leads and handoff ───────────────────────────────────────────────────── */

export function LeadsSection({ control }: { control: AgentControl }) {
  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="leadCapture"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormLabel className="text-sm text-muted-foreground">Lead capture</FormLabel>
            <FormControl>
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3">
                <ChoiceCard
                  value="never"
                  selected={field.value === "never"}
                  title="Never"
                  body="Don't ask for contact details in chat."
                />
                <ChoiceCard
                  value="before_chat"
                  selected={field.value === "before_chat"}
                  title="Before chat"
                  body="Gate the conversation behind a form. Captures more details, but starts far fewer conversations."
                />
                <ChoiceCard
                  value="after_first_reply"
                  selected={field.value === "after_first_reply"}
                  title="After first reply (recommended)"
                  body="Prove value, then ask. The best default for admissions follow-up."
                />
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <MultiSelectTagsField
        control={control}
        name="leadFields"
        label="Lead fields"
        placeholder="Select fields…"
        options={CHAT_AGENT_LEAD_FIELD_OPTIONS}
        maxSelect={3}
        info="Phone first — counsellors follow up on WhatsApp."
      />

      <div className="space-y-4 border-t border-border pt-6">
        <SectionHeading
          title="Handoff"
          hint="When the chatbot should stop trying and put a person in front of the visitor."
        />
        <TagsField
          control={control}
          name="handoffTriggers"
          label="Trigger phrases"
          placeholder="talk to a human"
          hint="If a visitor's message contains one of these, escalate."
          maxTags={20}
          maxTagLength={120}
        />
        <TextareaField
          control={control}
          name="handoffMessage"
          label="Handoff message"
          placeholder="I'm connecting you with our admissions team…"
          rows={3}
          maxLength={1000}
        />
        <FormField
          control={control}
          name="handoffOnFallback"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm text-muted-foreground">
                Escalate after failed answers
              </FormLabel>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Escalate after</span>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    className="h-9 w-16"
                    value={field.value}
                    onChange={(event) => field.onChange(Number(event.target.value))}
                  />
                </FormControl>
                <span>answers in a row it couldn&apos;t help with. 0 disables it.</span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
