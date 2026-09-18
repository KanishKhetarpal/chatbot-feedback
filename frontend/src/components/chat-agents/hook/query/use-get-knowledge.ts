import { useQuery } from "@tanstack/react-query";

import Axios from "@/lib/axios-config";
import { isKnowledgeIngesting } from "@/lib/chat-agent-constants";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { KnowledgeSource, KnowledgeSummary } from "@/types/chat-agent-types";

const noRetryOnClientError = (count: number, error: unknown) => {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  return count < 2;
};

/**
 * Sources for one agent, optionally narrowed to a type.
 *
 * Polls while anything is still being read: ingestion is asynchronous, and a
 * row stuck on "Reading…" until the user reloads reads as a broken upload.
 */
export const useGetKnowledgeSources = (agentId: string, type?: "text" | "file") => {
  return useQuery<KnowledgeSource[]>({
    queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SOURCES, agentId, type ?? "all"],
    queryFn: async () => {
      const { data } = await Axios.get<{ sources: KnowledgeSource[] }>("/api/v1/knowledge", {
        params: type ? { agentId, type } : { agentId },
      });
      return data.sources ?? [];
    },
    enabled: Boolean(agentId),
    retry: noRetryOnClientError,
    refetchInterval: (query) =>
      query.state.data?.some((source) => isKnowledgeIngesting(source.status)) ? 2000 : false,
  });
};

/**
 * Totals, quota and training staleness for one agent.
 *
 * Takes `isIngesting` from the caller rather than reading the list itself, so
 * two components asking for the summary don't each mount a second list query.
 */
export const useGetKnowledgeSummary = (agentId: string, isIngesting = false) => {
  return useQuery<KnowledgeSummary>({
    queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SUMMARY, agentId],
    queryFn: async () => {
      const { data } = await Axios.get<KnowledgeSummary>("/api/v1/knowledge/summary", {
        params: { agentId },
      });
      return data;
    },
    enabled: Boolean(agentId),
    retry: noRetryOnClientError,
    refetchInterval: isIngesting ? 2000 : false,
  });
};

/** One source including its body — the list endpoint omits `content`. */
export const useGetKnowledgeSource = (sourceId: string | null) => {
  return useQuery<KnowledgeSource>({
    queryKey: [QUERY_KEYS.GET_KNOWLEDGE_SOURCE, sourceId],
    queryFn: async () => {
      const { data } = await Axios.get<{ source: KnowledgeSource }>(
        `/api/v1/knowledge/${sourceId}`,
      );
      return data.source;
    },
    enabled: Boolean(sourceId),
    retry: noRetryOnClientError,
  });
};
