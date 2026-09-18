import { useQuery } from "@tanstack/react-query";

import Axios from "@/lib/axios-config";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { WidgetTheme } from "@/types/chat-agent-types";

/** An active chatbot as the gallery shows it to any signed-in account. */
export type AvailableChatAgent = {
  id: string;
  name: string;
  heading: string | null;
  subheading: string | null;
  greeting: string | null;
  avatarUrl: string | null;
  publicKey: string;
  theme: WidgetTheme;
  model: string;
  updatedAt: string;
  conversationCount: number;
  /** The signed-in account's own conversation with this chatbot, if they have started one. */
  myThread: {
    visitorId: string;
    lastSeenAt: string;
    messageCount: number;
    rating: number | null;
    lastMessage: { role: "user" | "assistant"; preview: string; at: string } | null;
  } | null;
};

export const useGetAvailableChatAgents = () =>
  useQuery<AvailableChatAgent[]>({
    queryKey: [QUERY_KEYS.GET_AVAILABLE_CHAT_AGENTS],
    queryFn: async () => {
      const { data } = await Axios.get<{ agents: AvailableChatAgent[] }>("/api/v1/chat-agents/available");
      return data.agents;
    },
  });
