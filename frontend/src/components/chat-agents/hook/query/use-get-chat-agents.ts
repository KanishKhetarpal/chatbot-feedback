import { useQuery } from "@tanstack/react-query";

import Axios from "@/lib/axios-config";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { ChatAgent, ChatAgentOptions } from "@/types/chat-agent-types";

/** Never retry a 401/403/404 — the answer will not change, and the retry only
 *  delays the error state the caller already knows how to render. */
const noRetryOnClientError = (count: number, error: unknown) => {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  return count < 2;
};

export const useGetChatAgents = () => {
  return useQuery<ChatAgent[]>({
    queryKey: [QUERY_KEYS.GET_CHAT_AGENTS],
    queryFn: async () => {
      const { data } = await Axios.get<{ agents: ChatAgent[] }>("/api/v1/chat-agents");
      return data.agents ?? [];
    },
    retry: noRetryOnClientError,
  });
};

export const useGetChatAgent = (agentId: string) => {
  return useQuery<ChatAgent>({
    queryKey: [QUERY_KEYS.GET_CHAT_AGENT, agentId],
    queryFn: async () => {
      const { data } = await Axios.get<{ agent: ChatAgent }>(`/api/v1/chat-agents/${agentId}`);
      return data.agent;
    },
    enabled: Boolean(agentId),
    retry: noRetryOnClientError,
  });
};

/**
 * Dropdown choices for the profile form — models, tones, effort levels.
 *
 * Comes from the API rather than a local constant on purpose: model IDs change
 * when the backend upgrades, and a hardcoded one silently pins every new agent
 * to a model that may no longer exist.
 */
export const useGetChatAgentOptions = () => {
  return useQuery<ChatAgentOptions>({
    queryKey: [QUERY_KEYS.GET_CHAT_AGENT_OPTIONS],
    queryFn: async () => {
      const { data } = await Axios.get<ChatAgentOptions>("/api/v1/chat-agents/options");
      return data;
    },
    staleTime: 5 * 60 * 1000,
    retry: noRetryOnClientError,
  });
};
