import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import Axios, { getErrorMessage, getErrorStatus } from "@/lib/axios-config";
import { QUERY_KEYS } from "@/lib/query-keys";
import type {
  CreateKnowledgeTextInput,
  KnowledgeFileDownload,
  KnowledgeSource,
  KnowledgeUploadReport,
  PatchKnowledgeSourceInput,
  UploadKnowledgeFileInput,
} from "@/types/chat-agent-types";

function invalidateKnowledge(queryClient: QueryClient, agentId: string) {
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SOURCES, agentId] });
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SUMMARY, agentId] });
  // Chatbot cards show the source count — keep them in step.
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_CHAT_AGENTS] });
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_CHAT_AGENT, agentId] });
}

export const useCreateKnowledgeText = (agentId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Omit<CreateKnowledgeTextInput, "agentId" | "type">) => {
      const { data } = await Axios.post<{ source: KnowledgeSource }>("/api/v1/knowledge", {
        ...payload,
        type: "text",
        agentId,
      });
      return data.source;
    },
    onSuccess: () => {
      invalidateKnowledge(queryClient, agentId);
      toast.success("Text snippet added");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Could not add text snippet"));
    },
  });
};

/**
 * Upload a CSV/XLSX as a knowledge source.
 *
 * Multipart, not JSON — `POST /knowledge` refuses `type: "file"` with
 * `wrong_endpoint`, because the body is a file rather than a field. No
 * Content-Type is set here on purpose: the browser writes it with the multipart
 * boundary, and forcing `application/json` makes the body unparseable
 * server-side, which surfaces as a confusing "no file was uploaded".
 *
 * The response carries a `report` beside the source — what the parser actually
 * read. No error toast: the refusals worth reading (`knowledge_too_large`,
 * `unreadable_file`) carry numbers and a course of action, and the dialog
 * renders them inline where they fit.
 */
export const useUploadKnowledgeFile = (agentId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, name, description }: Omit<UploadKnowledgeFileInput, "agentId">) => {
      const body = new FormData();
      body.append("file", file);
      body.append("agentId", agentId);
      body.append("description", description);
      if (name?.trim()) body.append("name", name.trim());

      const { data } = await Axios.post<{
        source: KnowledgeSource;
        report: KnowledgeUploadReport;
      }>("/api/v1/knowledge/upload", body);
      return data;
    },
    onSuccess: () => {
      invalidateKnowledge(queryClient, agentId);
    },
  });
};

/**
 * Rename, re-describe, edit or toggle a source.
 *
 * The enable checkbox is applied optimistically — it is a one-click toggle on a
 * row, and waiting for a round trip to redraw the tick makes the whole table
 * feel broken.
 */
export const usePatchKnowledgeSource = (agentId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: PatchKnowledgeSourceInput }) => {
      const { data } = await Axios.patch<{ source: KnowledgeSource }>(
        `/api/v1/knowledge/${id}`,
        input,
      );
      return data.source;
    },
    onMutate: async ({ id, input }) => {
      if (input.enabled === undefined) return;
      await queryClient.cancelQueries({ queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SOURCES, agentId] });
      const previous = queryClient.getQueriesData<KnowledgeSource[]>({
        queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SOURCES, agentId],
      });
      for (const [key, sources] of previous) {
        if (!sources) continue;
        queryClient.setQueryData<KnowledgeSource[]>(
          key,
          sources.map((s) => (s.id === id ? { ...s, enabled: input.enabled! } : s)),
        );
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(getErrorMessage(error, "Could not update source"));
    },
    onSuccess: (source) => {
      queryClient.setQueryData([QUERY_KEYS.GET_KNOWLEDGE_SOURCE, source.id], source);
      invalidateKnowledge(queryClient, agentId);
    },
  });
};

export const useDeleteKnowledgeSource = (agentId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await Axios.delete<{ id: string }>(`/api/v1/knowledge/${id}`);
      return data;
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SOURCE, id] });
      invalidateKnowledge(queryClient, agentId);
      toast.success("Source and its chunks removed");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Could not delete source"));
    },
  });
};

/**
 * Download the stored original.
 *
 * The endpoint answers with a short-lived presigned S3 URL rather than the file
 * itself, so this fetches the JSON (the GET needs a bearer token an `<a href>`
 * cannot carry) and then points an anchor at the URL. The S3 object carries
 * `Content-Disposition: attachment` with the uploaded name, so the browser
 * saves it correctly even though the link is cross-origin — `link.download` is
 * ignored on cross-origin hrefs and is set only as a same-origin fallback.
 *
 * A 410 is an expected answer, not a failure: sources uploaded before the move
 * to object storage have no S3 object. The extracted text is unaffected and the
 * agent keeps answering, so this says so plainly instead of reporting an error.
 */
export async function downloadKnowledgeFile(source: KnowledgeSource) {
  try {
    const { data } = await Axios.get<KnowledgeFileDownload>(`/api/v1/knowledge/${source.id}/file`);
    if (!data?.url) {
      toast.error("Could not download this file");
      return;
    }
    const link = document.createElement("a");
    link.href = data.url;
    link.download = data.fileName ?? source.fileName ?? source.name;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    if (getErrorStatus(error) === 410) {
      toast.info(
        "The original file is no longer stored. The chatbot still answers from the extracted text.",
      );
      return;
    }
    toast.error(getErrorMessage(error, "Could not download this file"));
  }
}
