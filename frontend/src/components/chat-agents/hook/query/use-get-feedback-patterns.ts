import { useQuery } from "@tanstack/react-query";

import Axios from "@/lib/axios-config";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { FeedbackPatterns } from "@/types/chat-agent-types";

export type FeedbackPatternsFilters = { agentId?: string; days: number };

/** The likes / dislikes analysis behind the Feedback page. Admin only. */
export const useGetFeedbackPatterns = (filters: FeedbackPatternsFilters) =>
  useQuery<FeedbackPatterns>({
    queryKey: [QUERY_KEYS.GET_FEEDBACK_PATTERNS, filters],
    queryFn: async () => {
      const { data } = await Axios.get<FeedbackPatterns>("/api/v1/widget-inbox/feedback", {
        params: { days: filters.days, ...(filters.agentId ? { agentId: filters.agentId } : {}) },
      });
      return data;
    },
    refetchInterval: 30_000,
  });
