import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  useCreateKnowledgeText,
  usePatchKnowledgeSource,
  useUploadKnowledgeFile,
} from "@/components/chat-agents/hook/mutation/use-knowledge-mutations";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { InputField } from "@/components/ui/form-fields/input-field";
import { TextareaField } from "@/components/ui/form-fields/textarea-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/axios-config";
import {
  formatBytes,
  KNOWLEDGE_DESCRIPTION_MIN,
  KNOWLEDGE_FILE_ACCEPT,
  KNOWLEDGE_FILE_MAX_MB,
} from "@/lib/chat-agent-constants";
import { cn } from "@/lib/utils";
import type { KnowledgeSource, KnowledgeUploadReport } from "@/types/chat-agent-types";

/* ── Text snippet ────────────────────────────────────────────────────────── */

const textSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  content: z.string().trim().min(1, "Content is required").max(500_000),
});

export function TextSnippetForm({ agentId, onDone }: { agentId: string; onDone: () => void }) {
  const create = useCreateKnowledgeText(agentId);
  const form = useForm<z.infer<typeof textSchema>>({
    resolver: zodResolver(textSchema),
    defaultValues: { name: "", content: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          try {
            await create.mutateAsync(values);
            form.reset();
            onDone();
          } catch {
            // The mutation toasts; the dialog stays open so the text isn't lost.
          }
        })}
        className="space-y-4"
      >
        <InputField
          control={form.control}
          name="name"
          label="Name"
          placeholder="Fee policy 2026-27"
          maxLength={200}
          showCharCount
          required
        />
        <TextareaField
          control={form.control}
          name="content"
          label="Content"
          placeholder="Undergraduate tuition is…"
          rows={10}
          maxLength={500_000}
          required
        />
        <FormActions
          onCancel={onDone}
          isPending={create.isPending}
          pendingLabel="Adding…"
          label="Add snippet"
        />
      </form>
    </Form>
  );
}

export function TextEditForm({
  agentId,
  source,
  onDone,
}: {
  agentId: string;
  source: KnowledgeSource;
  onDone: () => void;
}) {
  const patch = usePatchKnowledgeSource(agentId);
  const form = useForm<{ content: string }>({
    resolver: zodResolver(textSchema.pick({ content: true })),
    defaultValues: { content: source.content ?? "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          try {
            await patch.mutateAsync({ id: source.id, input: { content: values.content } });
            toast.success("Content updated — train to apply it");
            onDone();
          } catch {
            // Toasted by the mutation.
          }
        })}
        className="space-y-4"
      >
        <TextareaField
          control={form.control}
          name="content"
          label="Content"
          rows={14}
          maxLength={500_000}
        />
        <FormActions
          onCancel={onDone}
          isPending={patch.isPending}
          pendingLabel="Saving…"
          label="Save content"
        />
      </form>
    </Form>
  );
}

/* ── Rename / describe ───────────────────────────────────────────────────── */

export function RenameSourceForm({
  agentId,
  source,
  onDone,
}: {
  agentId: string;
  source: KnowledgeSource;
  onDone: () => void;
}) {
  const patch = usePatchKnowledgeSource(agentId);
  const form = useForm<{ name: string }>({
    resolver: zodResolver(textSchema.pick({ name: true })),
    defaultValues: { name: source.name },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          try {
            await patch.mutateAsync({ id: source.id, input: { name: values.name } });
            toast.success("Renamed");
            onDone();
          } catch {
            // Toasted by the mutation.
          }
        })}
        className="space-y-4"
      >
        <InputField
          control={form.control}
          name="name"
          label="Name"
          maxLength={200}
          showCharCount
          required
        />
        <FormActions
          onCancel={onDone}
          isPending={patch.isPending}
          pendingLabel="Saving…"
          label="Save name"
        />
      </form>
    </Form>
  );
}

const descriptionSchema = z.object({ description: z.string().trim().max(2000) });

/**
 * Edit what the chatbot is told a source *is*.
 *
 * The one part of an uploaded file that can be fixed without re-uploading, and
 * the part most likely to need it — a description's quality only becomes
 * apparent once the chatbot starts answering from it. Changing it changes the
 * compiled pack, so the chatbot shows as needing training afterwards.
 */
export function DescriptionForm({
  agentId,
  source,
  onDone,
}: {
  agentId: string;
  source: KnowledgeSource;
  onDone: () => void;
}) {
  const patch = usePatchKnowledgeSource(agentId);
  const form = useForm<z.infer<typeof descriptionSchema>>({
    resolver: zodResolver(descriptionSchema),
    defaultValues: { description: source.description ?? "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          try {
            await patch.mutateAsync({ id: source.id, input: { description: values.description } });
            toast.success("Description saved — train to apply it");
            onDone();
          } catch {
            // Toasted by the mutation.
          }
        })}
        className="space-y-4"
      >
        <TextareaField
          control={form.control}
          name="description"
          label="What is this source?"
          rows={5}
          maxLength={2000}
          placeholder="Annual tuition for all UG programmes, 2026-27 intake. One row per programme per year of study. Amounts are in INR and exclude hostel and mess fees."
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Sent to the chatbot above the content. For a spreadsheet, say what one row represents,
          what the units are, and what any unclear column heading means.
        </p>
        <FormActions
          onCancel={onDone}
          isPending={patch.isPending}
          pendingLabel="Saving…"
          label="Save description"
        />
      </form>
    </Form>
  );
}

/* ── File upload ─────────────────────────────────────────────────────────── */

const ACCEPT = KNOWLEDGE_FILE_ACCEPT.join(",");

/**
 * Pick one spreadsheet, by drop or by click.
 *
 * Extension and size are checked here so the obvious mistakes never cost a
 * round trip — the server checks both again, because a client check is a
 * courtesy and not a control.
 */
function DropZone({
  file,
  onSelect,
  onClear,
  disabled,
}: {
  file: File | null;
  onSelect: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(picked: File | undefined) {
    if (!picked) return;
    const ext = `.${picked.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!(KNOWLEDGE_FILE_ACCEPT as readonly string[]).includes(ext)) {
      setError(`${KNOWLEDGE_FILE_ACCEPT.join(" or ")} only — "${picked.name}" is not supported.`);
      return;
    }
    if (picked.size > KNOWLEDGE_FILE_MAX_MB * 1024 * 1024) {
      setError(
        `That file is ${formatBytes(picked.size)}. The limit is ${KNOWLEDGE_FILE_MAX_MB} MB.`,
      );
      return;
    }
    setError(null);
    onSelect(picked);
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3">
        <FileSpreadsheet className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={onClear}
          disabled={disabled}
          aria-label="Remove file"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-9 transition-colors",
          dragging
            ? "border-primary bg-primary/8"
            : "border-border hover:border-primary/50 hover:bg-muted/50",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <Upload className="size-5 text-muted-foreground" />
        <span className="text-sm font-medium">Drop a file here, or click to choose</span>
        <span className="text-xs text-muted-foreground">
          {KNOWLEDGE_FILE_ACCEPT.join(", ")} · up to {KNOWLEDGE_FILE_MAX_MB} MB
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => choose(event.target.files?.[0] ?? undefined)}
        />
      </button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * The backend's structured refusal for an oversize file. Worth rendering with
 * its numbers rather than as a one-line message: "over the limit" is not
 * actionable, "this takes you to 71,000 of 60,000" is.
 */
function readBudget(error: unknown) {
  const details = (error as { details?: Record<string, unknown> } | null)?.details;
  if (!details || details.error !== "knowledge_too_large") return null;
  return {
    current: details.currentTokens as number | undefined,
    next: details.tokenCount as number | undefined,
    limit: details.limit as number | undefined,
  };
}

export function FileUploadForm({ agentId, onDone }: { agentId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [report, setReport] = useState<KnowledgeUploadReport | null>(null);

  const upload = useUploadKnowledgeFile(agentId);
  const budget = readBudget(upload.error);
  const failed = upload.isError ? getErrorMessage(upload.error, "Could not read this file") : null;

  function reset() {
    setFile(null);
    setName("");
    setDescription("");
    setReport(null);
    upload.reset();
  }

  async function submit() {
    if (!file || description.trim().length < KNOWLEDGE_DESCRIPTION_MIN) return;
    try {
      const result = await upload.mutateAsync({ file, name, description: description.trim() });
      setReport(result.report);
      toast.success(`"${result.source.name}" added — ${result.report.rowCount} rows`);
    } catch {
      // Rendered inline below; a toast would truncate the part that matters.
    }
  }

  // Shown instead of closing on success. What the parser actually read is only
  // visible here — a skipped sheet or a dropped column cannot be seen
  // afterwards, and the author is deciding right now whether to keep this.
  if (report) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="size-4 text-success" />
          Added — check this is what you expected before training.
        </p>

        <div className="divide-y divide-border rounded-lg border border-border">
          {report.sheets.map((sheet) => (
            <div key={sheet.name} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{sheet.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {sheet.rowCount.toLocaleString()} rows
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{sheet.columns.join(" · ")}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">Knowledge size after this</span>
          <span className="font-medium tabular-nums">
            {report.tokenCount.toLocaleString()} / {report.tokenLimit.toLocaleString()} tokens
          </span>
        </div>

        {report.truncated ? (
          <p className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              This file was too large to read in full. {report.truncationReason}. The chatbot will
              only know the rows that were read.
            </span>
          </p>
        ) : null}

        {!report.durableStorage ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            The original file is kept for download only and will not survive a redeploy. The chatbot
            is unaffected — it answers from the extracted table, which is stored in the database.
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={reset}>
            Upload another
          </Button>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DropZone
        file={file}
        onSelect={(picked) => {
          setFile(picked);
          upload.reset();
          // Prefilled but editable: "fees-final-v3" is what the file is called,
          // rarely what the source should be called.
          if (!name.trim()) setName(picked.name.replace(/\.[^.]+$/, ""));
        }}
        onClear={() => {
          setFile(null);
          upload.reset();
        }}
        disabled={upload.isPending}
      />

      <div className="space-y-1.5">
        <Label htmlFor="knowledge-file-name">Name</Label>
        <Input
          id="knowledge-file-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Fee structure 2026-27"
          maxLength={200}
        />
      </div>

      {/*
        The field this feature exists for. A spreadsheet does not explain itself —
        columns headed PRG / YR / AMT are meaningless to the model, and no amount
        of parsing recovers what nobody wrote down. Required, and given more
        guidance than anything else on the form.
      */}
      <div className="space-y-1.5">
        <Label htmlFor="knowledge-file-description">
          What is this file? <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="knowledge-file-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Annual tuition for all UG programmes, 2026-27 intake. One row per programme per year of study. Amounts are in INR and exclude hostel and mess fees."
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The chatbot reads this above the table. Say what one row represents, what the units are,
          and what any unclear column heading means — a column called &ldquo;AMT&rdquo; is just a
          number until you say it is annual tuition in rupees.
        </p>
      </div>

      {failed ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          <p className="flex gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{failed}</span>
          </p>
          {budget?.limit ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <dt>This chatbot now</dt>
              <dd className="text-right tabular-nums">{budget.current?.toLocaleString()} tokens</dd>
              <dt>With this file</dt>
              <dd className="text-right tabular-nums">{budget.next?.toLocaleString()} tokens</dd>
              <dt>Limit</dt>
              <dd className="text-right tabular-nums">{budget.limit.toLocaleString()} tokens</dd>
            </dl>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={
            !file || description.trim().length < KNOWLEDGE_DESCRIPTION_MIN || upload.isPending
          }
        >
          {upload.isPending ? "Reading file…" : "Upload"}
        </Button>
      </div>
    </div>
  );
}

function FormActions({
  onCancel,
  isPending,
  label,
  pendingLabel,
}: {
  onCancel: () => void;
  isPending: boolean;
  label: string;
  pendingLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={isPending}>
        {isPending ? pendingLabel : label}
      </Button>
    </div>
  );
}
