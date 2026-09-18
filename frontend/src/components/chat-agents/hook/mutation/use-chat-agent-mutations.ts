import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import Axios, { getErrorMessage } from "@/lib/axios-config";
import { QUERY_KEYS } from "@/lib/query-keys";
import type {
  ChatAgent,
  CreateChatAgentInput,
  DeleteChatAgentResult,
  GuidedFlow,
  GuidedFlowIssue,
  PatchChatAgentInput,
  SaveGuidedFlowResult,
  TestChatAgentInput,
  TestChatAgentResult,
  TrainChatAgentResult,
} from "@/types/chat-agent-types";

function invalidateAgent(queryClient: QueryClient, agentId: string) {
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_CHAT_AGENT, agentId] });
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_CHAT_AGENTS] });
}

export const useCreateChatAgent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateChatAgentInput) => {
      const { data } = await Axios.post<{ agent: ChatAgent }>("/api/v1/chat-agents", payload);
      return data.agent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_CHAT_AGENTS] });
      toast.success("Chatbot created");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Could not create chatbot"));
    },
  });
};

/**
 * Save a partial change to one agent.
 *
 * Seeds the detail cache from the response before invalidating so the form can
 * reset against exactly what the server stored, rather than flashing the old
 * values while a refetch is in flight.
 *
 * No toast here: callers say what was saved ("Profile saved", "Deploy settings
 * saved"), which is more use than one generic message for every screen.
 */
export const useUpdateChatAgent = (agentId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PatchChatAgentInput) => {
      const { data } = await Axios.patch<{ agent: ChatAgent }>(
        `/api/v1/chat-agents/${agentId}`,
        payload,
      );
      return data.agent;
    },
    onSuccess: (agent) => {
      queryClient.setQueryData([QUERY_KEYS.GET_CHAT_AGENT, agentId], agent);
      invalidateAgent(queryClient, agentId);
    },
  });
};

/**
 * Delete a chatbot and everything that only existed because of it.
 *
 * The knowledge base goes too — sources, chunks, compiled packs, uploaded files
 * — along with every widget conversation. Nothing is recoverable and there is no
 * soft delete, so callers must confirm before firing this.
 *
 * The server refuses an `active` agent with 409 rather than pulling a live
 * widget off a customer's website mid-visit; `getErrorMessage` surfaces its
 * "pause it first" wording as-is.
 *
 * Removes the detail caches outright instead of invalidating them: an
 * invalidated key refetches, and a refetch of a deleted agent is a guaranteed
 * 404 that would flash an error state on the way out of the page.
 */
export const useDeleteChatAgent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agentId: string) => {
      const { data } = await Axios.delete<DeleteChatAgentResult>(`/api/v1/chat-agents/${agentId}`);
      return data;
    },
    onSuccess: (result) => {
      queryClient.removeQueries({ queryKey: [QUERY_KEYS.GET_CHAT_AGENT, result.id] });
      queryClient.removeQueries({ queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SOURCES, result.id] });
      queryClient.removeQueries({ queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SUMMARY, result.id] });
      queryClient.removeQueries({ queryKey: [QUERY_KEYS.GET_WIDGET_INBOX_THREADS, result.id] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_CHAT_AGENTS] });
      toast.success(`Deleted "${result.name || "Untitled chatbot"}"`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Could not delete this chatbot"));
    },
  });
};

/**
 * Compile the chatbot's enabled knowledge into the pack it answers from.
 *
 * Despite the name, no model is trained and no embeddings are involved — the
 * knowledge is assembled into one document and cached. Safe to call repeatedly;
 * each run produces a new version.
 */
export const useTrainChatAgent = (agentId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await Axios.post<TrainChatAgentResult>(
        `/api/v1/chat-agents/${agentId}/train`,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SUMMARY, agentId] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SOURCES, agentId] });
      // An untrained agent cannot be published, so the publish controls
      // elsewhere may now be usable.
      invalidateAgent(queryClient, agentId);
      toast.success("Training complete");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Could not train this chatbot"));
    },
  });
};

/**
 * Ask the chatbot a question from inside the CRM.
 *
 * Not the public `/widget/*` path: that one requires the chatbot to be live and
 * the caller's origin to be allowed, and it consumes the visitor rate limits.
 * This runs the identical pack and prompt while skipping all of that, which is
 * what makes it usable on a chatbot nobody has published yet.
 */
export const useTestChatAgent = (agentId: string) => {
  return useMutation({
    mutationFn: async (payload: TestChatAgentInput) => {
      const { data } = await Axios.post<TestChatAgentResult>(
        `/api/v1/chat-agents/${agentId}/test`,
        payload,
      );
      return data;
    },
  });
};

/**
 * The full issue list from a guided-flow 400, or null for any other failure.
 *
 * The server runs shape and semantic checks together and answers with every
 * problem in one round trip, so the editor can mark all of them inline rather
 * than fixing one and finding the next on the following save.
 */
export function readGuidedFlowIssues(error: unknown): GuidedFlowIssue[] | null {
  const data = (error as { response?: { status?: number; data?: unknown } } | null)?.response;
  if (data?.status !== 400 || !data.data || typeof data.data !== "object") return null;
  const body = data.data as {
    error?: string;
    issues?: { code?: string; path?: string; message?: string; where?: string }[];
    details?: unknown[];
  };
  if (body.error !== "validation_failed" && body.error !== "guided_flow_invalid") return null;
  if (Array.isArray(body.issues) && body.issues.length) {
    return body.issues.map((issue) => ({
      code: issue.code ?? "invalid",
      message: issue.message ?? "Invalid",
      where: issue.where ?? issue.path,
    }));
  }
  if (Array.isArray(body.details)) {
    return body.details
      .filter((d): d is string => typeof d === "string")
      .map((message) => ({ code: "invalid", message }));
  }
  return [];
}

/**
 * Replace the agent's guided flow wholesale — `PUT /chat-agents/:id/guided-flow`.
 *
 * All-or-nothing by design: a tree is only usable when every chip resolves, so
 * there is no partial save. `null` clears it and the widget falls back to the
 * chatbot's message presets. No toast here either; the editor says what happened
 * and, on a 400, lays the issues out next to the nodes they belong to.
 */
export const useSaveGuidedFlow = (agentId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (flow: GuidedFlow | null) => {
      const { data } = await Axios.put<SaveGuidedFlowResult>(
        `/api/v1/chat-agents/${agentId}/guided-flow`,
        flow,
      );
      return data;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<ChatAgent | undefined>(
        [QUERY_KEYS.GET_CHAT_AGENT, agentId],
        (agent) => (agent ? { ...agent, guidedFlow: result.guidedFlow } : agent),
      );
      invalidateAgent(queryClient, agentId);
    },
  });
};
