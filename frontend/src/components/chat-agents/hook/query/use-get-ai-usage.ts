import { useQuery } from "@tanstack/react-query";

import Axios from "@/lib/axios-config";
import { QUERY_KEYS } from "@/lib/query-keys";
import type { AiUsageReport } from "@/types/chat-agent-types";

export type AiUsageFilters = { agentId?: string; days: number };

/** The token ledger report behind the Usage page. Admin only. */
export const useGetAiUsage = (filters: AiUsageFilters) =>
  useQuery<AiUsageReport>({
    queryKey: [QUERY_KEYS.GET_AI_USAGE, filters],
    queryFn: async () => {
      const { data } = await Axios.get<AiUsageReport>("/api/v1/ai-usage", {
        params: { days: filters.days, ...(filters.agentId ? { agentId: filters.agentId } : {}) },
      });
      return data;
    },
    refetchInterval: 30_000,
  });
