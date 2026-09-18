import { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import {
  downloadKnowledgeFile,
  useDeleteKnowledgeSource,
  usePatchKnowledgeSource,
} from "@/components/chat-agents/hook/mutation/use-knowledge-mutations";
import { useTrainChatAgent } from "@/components/chat-agents/hook/mutation/use-chat-agent-mutations";
import {
  useGetKnowledgeSource,
  useGetKnowledgeSources,
  useGetKnowledgeSummary,
} from "@/components/chat-agents/hook/query/use-get-knowledge";
import {
  DescriptionForm,
  FileUploadForm,
  RenameSourceForm,
  TextEditForm,
  TextSnippetForm,
} from "@/components/chat-agents/knowledge-forms";
import { Badge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/axios-config";
import {
  formatBytes,
  getKnowledgeStatusTone,
  isKnowledgeIngesting,
  KNOWLEDGE_TABS,
} from "@/lib/chat-agent-constants";
import { capitalizeWords, cn, getRelativeTime } from "@/lib/utils";
import type { ChatAgent, KnowledgeSource, KnowledgeSummary } from "@/types/chat-agent-types";

type SourceTab = "text" | "file";

type KnowledgeDialog =
  | { kind: "add" }
  | { kind: "rename"; source: KnowledgeSource }
  | { kind: "description"; source: KnowledgeSource }
  | { kind: "edit"; sourceId: string }
  | null;

export function KnowledgePanel({ agent }: { agent: ChatAgent }) {
  const agentId = agent.id;
  const [tab, setTab] = useState<SourceTab>("text");
  const [dialog, setDialog] = useState<KnowledgeDialog>(null);

  const sourcesQuery = useGetKnowledgeSources(agentId, tab);
  const sources = sourcesQuery.data ?? [];
  const ingesting = sources.some((source) => isKnowledgeIngesting(source.status));
  const summaryQuery = useGetKnowledgeSummary(agentId, ingesting);
  const summary = summaryQuery.data;

  const editId = dialog?.kind === "edit" ? dialog.sourceId : null;
  const editSourceQuery = useGetKnowledgeSource(editId);

  const tabMeta = KNOWLEDGE_TABS.find((entry) => entry.type === tab);
  const quotaBlocked = summary ? summary.quota.usedBytes >= summary.quota.limitBytes : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Teach your chatbot</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            These sources are what it can answer from. Knowledge mode is{" "}
            {agent.knowledgeMode === "strict"
              ? "only your content"
              : "your content plus general knowledge"}
            .
          </p>
          <KnowledgeStatusLine summary={summary} isLoading={summaryQuery.isLoading} />
          {/* What this knowledge pack costs on every chat turn — the moment
              someone is about to paste in a large table. */}
        </div>
        <TrainButton agentId={agentId} summary={summary} />
      </div>

      {quotaBlocked ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          The knowledge quota is full. Delete a source before adding more.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elev-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
          <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
            {KNOWLEDGE_TABS.map((entry) => (
              <button
                key={entry.type}
                type="button"
                onClick={() => setTab(entry.type)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === entry.type
                    ? "bg-background text-foreground shadow-elev-1"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
                {summary ? (
                  <span className="ml-1.5 tabular-nums opacity-60">
                    {summary.byType?.[entry.type]?.count ?? 0}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {sources.length ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDialog({ kind: "add" })}
              disabled={quotaBlocked}
            >
              {tab === "file" ? (
                <>
                  <FileSpreadsheet className="size-3.5" /> Upload file
                </>
              ) : (
                <>
                  <Plus className="size-3.5" /> Add snippet
                </>
              )}
            </Button>
          ) : null}
        </div>

        <p className="border-b border-border bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">
          {tabMeta?.hint} Checkboxes control whether a source is used when answering.
        </p>

        {sourcesQuery.isLoading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : sourcesQuery.isError ? (
          <ErrorState
            title="Couldn't load sources"
            description={getErrorMessage(sourcesQuery.error, "Please try again.")}
            className="border-none bg-transparent shadow-none"
            onRetry={() => void sourcesQuery.refetch()}
            isRetrying={sourcesQuery.isFetching}
          />
        ) : sources.length === 0 ? (
          <div className="p-3">
            <EmptyAdd tab={tab} disabled={quotaBlocked} onAdd={() => setDialog({ kind: "add" })} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="w-32 px-3 py-2 font-medium">Status</th>
                  <th className="w-20 px-3 py-2 font-medium">Size</th>
                  <th className="w-20 px-3 py-2 font-medium">Chunks</th>
                  <th className="w-28 px-3 py-2 font-medium">Synced</th>
                  <th className="w-12 px-3 py-2 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <SourceRow
                    key={source.id}
                    agentId={agentId}
                    source={source}
                    onRename={(target) => setDialog({ kind: "rename", source: target })}
                    onEdit={(target) => setDialog({ kind: "edit", sourceId: target.id })}
                    onEditDescription={(target) =>
                      setDialog({ kind: "description", source: target })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "rename"
                ? "Rename source"
                : dialog?.kind === "description"
                  ? "Edit description"
                  : dialog?.kind === "edit"
                    ? "Edit source"
                    : tab === "file"
                      ? "Upload a spreadsheet"
                      : "Add a text snippet"}
            </DialogTitle>
          </DialogHeader>

          {dialog?.kind === "add" ? (
            tab === "file" ? (
              <FileUploadForm agentId={agentId} onDone={() => setDialog(null)} />
            ) : (
              <TextSnippetForm agentId={agentId} onDone={() => setDialog(null)} />
            )
          ) : null}

          {dialog?.kind === "rename" ? (
            <RenameSourceForm
              agentId={agentId}
              source={dialog.source}
              onDone={() => setDialog(null)}
            />
          ) : null}

          {dialog?.kind === "description" ? (
            <DescriptionForm
              agentId={agentId}
              source={dialog.source}
              onDone={() => setDialog(null)}
            />
          ) : null}

          {dialog?.kind === "edit" ? (
            editSourceQuery.isLoading || !editSourceQuery.data ? (
              <p className="text-sm text-muted-foreground">Loading source…</p>
            ) : editSourceQuery.data.type === "text" ? (
              <TextEditForm
                agentId={agentId}
                source={editSourceQuery.data}
                onDone={() => setDialog(null)}
              />
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                An uploaded file&apos;s contents can&apos;t be edited here — upload the new version
                and delete this one. Its description can be changed from the row&apos;s menu.
              </p>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Status line and training ────────────────────────────────────────────── */

function describeDrift(training: KnowledgeSummary["training"]): string {
  const parts: string[] = [];
  if (training.added) parts.push(`${training.added} added`);
  if (training.changed) parts.push(`${training.changed} edited`);
  if (training.removed) parts.push(`${training.removed} removed`);
  return parts.join(", ");
}

export function KnowledgeStatusLine({
  summary,
  isLoading,
}: {
  summary?: KnowledgeSummary;
  isLoading?: boolean;
}) {
  if (isLoading && !summary) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Loading…
      </p>
    );
  }
  if (!summary) return null;

  const overQuota = summary.quota.usedBytes >= summary.quota.limitBytes;
  const { training } = summary;
  const drift = describeDrift(training);
  const status = training.needed
    ? training.hasPack
      ? `Needs training${drift ? ` — ${drift}` : ""}`
      : "Not trained yet"
    : training.pack
      ? `Trained · v${training.pack.version}`
      : "Add a source, then train";

  return (
    <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
      {summary.enabled.count} enabled · {formatBytes(summary.quota.usedBytes)} /{" "}
      <span className={cn(overQuota && "text-destructive")}>
        {formatBytes(summary.quota.limitBytes)}
      </span>
      <span className="mx-1.5 text-border">·</span>
      <span className={cn(training.needed && "text-warning")}>{status}</span>
    </p>
  );
}

export function TrainButton({ agentId, summary }: { agentId: string; summary?: KnowledgeSummary }) {
  const train = useTrainChatAgent(agentId);
  const nothingToTrain = summary ? summary.enabled.count === 0 : true;

  // Hidden when the pack is current: a button that does nothing invites the
  // habit of pressing it, and every press costs a compile.
  if (!summary?.training.needed && !train.isPending) return null;

  return (
    <Button
      type="button"
      size="sm"
      onClick={() => train.mutate()}
      disabled={train.isPending || nothingToTrain}
      title={
        nothingToTrain
          ? "Enable at least one source first"
          : "Compile enabled sources into the pack this chatbot answers from"
      }
    >
      {train.isPending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" /> Training…
        </>
      ) : summary?.training.staleCount ? (
        `Train (${summary.training.staleCount})`
      ) : (
        "Train"
      )}
    </Button>
  );
}

/* ── Rows ────────────────────────────────────────────────────────────────── */

function SourceRow({
  agentId,
  source,
  onEdit,
  onRename,
  onEditDescription,
}: {
  agentId: string;
  source: KnowledgeSource;
  onEdit: (source: KnowledgeSource) => void;
  onRename: (source: KnowledgeSource) => void;
  onEditDescription: (source: KnowledgeSource) => void;
}) {
  const patch = usePatchKnowledgeSource(agentId);
  const remove = useDeleteKnowledgeSource(agentId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const ingesting = isKnowledgeIngesting(source.status);
  const isFile = source.type === "file";

  const fileMeta = isFile
    ? [
        source.fileName,
        source.rowCount != null ? `${source.rowCount.toLocaleString()} rows` : null,
        source.sheetCount != null && source.sheetCount > 1 ? `${source.sheetCount} sheets` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const status =
    ingesting || source.status === "failed"
      ? source.status
      : source.untrained
        ? "untrained"
        : "ready";

  return (
    <tr
      className={cn(
        "border-b border-border last:border-b-0 transition-colors hover:bg-muted/40",
        !source.enabled && "opacity-55",
        source.status === "failed" && "bg-destructive/5",
      )}
    >
      <td className="max-w-0 px-3 py-2.5 align-top">
        <div className="flex items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={source.enabled}
            disabled={patch.isPending}
            onChange={(event) =>
              patch.mutate({ id: source.id, input: { enabled: event.target.checked } })
            }
            aria-label={`Use ${source.name} when answering`}
            title="Use this source when answering"
          />
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            {isFile ? <FileSpreadsheet className="size-3" /> : <FileText className="size-3" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{source.name}</p>
            {ingesting ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-primary">
                <Loader2 className="size-3 animate-spin" /> Reading…
              </p>
            ) : source.status === "failed" && source.error ? (
              <p className="mt-0.5 truncate text-xs text-destructive" title={source.error}>
                {source.error}
              </p>
            ) : (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {fileMeta ?? capitalizeWords(source.type)}
              </p>
            )}
            {!ingesting && isFile ? (
              <p
                title={source.description || undefined}
                className={cn(
                  "mt-0.5 truncate text-xs",
                  source.description ? "text-muted-foreground" : "italic text-warning",
                )}
              >
                {source.description || "No description — say what the columns mean."}
              </p>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 align-top whitespace-nowrap">
        <Badge tone={getKnowledgeStatusTone(status)}>
          {status === "untrained" ? "Needs training" : capitalizeWords(status)}
        </Badge>
      </td>
      <td className="px-3 py-2.5 align-top text-xs tabular-nums whitespace-nowrap text-muted-foreground">
        {ingesting ? "—" : formatBytes(source.contentBytes)}
      </td>
      <td className="px-3 py-2.5 align-top text-xs tabular-nums whitespace-nowrap text-muted-foreground">
        {ingesting ? "—" : source.chunkCount}
      </td>
      <td className="px-3 py-2.5 align-top text-xs whitespace-nowrap text-muted-foreground">
        {getRelativeTime(source.lastSynced ?? source.embeddedAt) || "—"}
      </td>
      <td className="px-3 py-2.5 text-right align-top">
        {confirmDelete ? (
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(source.id, { onSuccess: () => setConfirmDelete(false) })
                }
              >
                Delete forever
              </Button>
            </div>
            <p className="text-[11px] text-destructive">
              Removes this source and its chunks. Not undoable.
            </p>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="ghost" className="size-8">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRename(source)}>
                <Pencil className="size-3.5" /> Rename
              </DropdownMenuItem>
              {source.type === "text" ? (
                <DropdownMenuItem onClick={() => onEdit(source)}>
                  <Pencil className="size-3.5" /> Edit content
                </DropdownMenuItem>
              ) : null}
              {isFile ? (
                <>
                  <DropdownMenuItem onClick={() => onEditDescription(source)}>
                    <Pencil className="size-3.5" /> Edit description
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void downloadKnowledgeFile(source)}>
                    <Download className="size-3.5" /> Download original
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </td>
    </tr>
  );
}

function EmptyAdd({
  tab,
  disabled,
  onAdd,
}: {
  tab: SourceTab;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-60"
    >
      {tab === "file" ? (
        <Upload className="size-5 text-muted-foreground" />
      ) : (
        <Plus className="size-5 text-muted-foreground" />
      )}
      <span className="text-sm font-medium">
        {tab === "file" ? "Upload a spreadsheet" : "Add a text snippet"}
      </span>
      <span className="text-xs text-muted-foreground">
        {tab === "file"
          ? "CSV or Excel · fees, courses, important dates"
          : "Policies, notices and short articles"}
      </span>
    </button>
  );
}
