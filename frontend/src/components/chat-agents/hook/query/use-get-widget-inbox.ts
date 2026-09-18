import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import Axios, { getErrorMessage } from "@/lib/axios-config";
import { QUERY_KEYS } from "@/lib/query-keys";
import type {
  InboxReviewStatus,
  InboxStats,
  InboxThreadDetail,
  InboxThreadPage,
} from "@/types/chat-agent-types";

const noRetryOnClientError = (count: number, error: unknown) => {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403 || status === 404) return false;
  return count < 2;
};

export type InboxFilters = {
  agentId?: string;
  userId?: string;
  reviewStatus?: InboxReviewStatus;
  withFeedbackOnly?: boolean;
  withMessagesOnly?: boolean;
};

/** Conversations, newest activity first, polled so new ones appear while someone is watching. */
export const useGetInboxThreads = (filters: InboxFilters) => {
  return useQuery<InboxThreadPage>({
    queryKey: [QUERY_KEYS.GET_WIDGET_INBOX_THREADS, filters],
    queryFn: async () => {
      const { data } = await Axios.get<InboxThreadPage>("/api/v1/widget-inbox", {
        params: {
          ...(filters.agentId ? { agentId: filters.agentId } : {}),
          ...(filters.userId ? { userId: filters.userId } : {}),
          ...(filters.reviewStatus ? { reviewStatus: filters.reviewStatus } : {}),
          ...(filters.withFeedbackOnly ? { withFeedbackOnly: true } : {}),
          ...(filters.withMessagesOnly ? { withMessagesOnly: true } : {}),
          limit: 100,
        },
      });
      return data;
    },
    retry: noRetryOnClientError,
    refetchInterval: 15_000,
  });
};

export const useGetInboxThread = (visitorId: string | undefined) => {
  return useQuery<InboxThreadDetail>({
    queryKey: [QUERY_KEYS.GET_WIDGET_INBOX_THREAD, visitorId],
    queryFn: async () => {
      const { data } = await Axios.get<InboxThreadDetail>(`/api/v1/widget-inbox/${visitorId}`);
      return data;
    },
    enabled: Boolean(visitorId),
    retry: noRetryOnClientError,
    refetchInterval: 15_000,
  });
};

export const useGetInboxStats = (agentId?: string) => {
  return useQuery<InboxStats>({
    queryKey: [QUERY_KEYS.GET_WIDGET_INBOX_STATS, agentId ?? "all"],
    queryFn: async () => {
      const { data } = await Axios.get<InboxStats>("/api/v1/widget-inbox/stats", {
        params: agentId ? { agentId } : undefined,
      });
      return data;
    },
    retry: noRetryOnClientError,
    refetchInterval: 30_000,
  });
};

export const useReviewThread = (visitorId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { reviewStatus?: InboxReviewStatus; reviewNote?: string | null }) => {
      const { data } = await Axios.patch(`/api/v1/widget-inbox/${visitorId}/review`, body);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [QUERY_KEYS.GET_WIDGET_INBOX_THREAD, visitorId] });
      void qc.invalidateQueries({ queryKey: [QUERY_KEYS.GET_WIDGET_INBOX_THREADS] });
      void qc.invalidateQueries({ queryKey: [QUERY_KEYS.GET_WIDGET_INBOX_STATS] });
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not save the review")),
  });
};

export const useDeleteThread = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (visitorId: string) => {
      const { data } = await Axios.delete(`/api/v1/widget-inbox/${visitorId}`);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [QUERY_KEYS.GET_WIDGET_INBOX_THREADS] });
      void qc.invalidateQueries({ queryKey: [QUERY_KEYS.GET_WIDGET_INBOX_STATS] });
      toast.success("Conversation deleted");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Could not delete the conversation")),
  });
};

/** Downloads every conversation (optionally one chatbot's) as a JSON file. */
export async function downloadInboxExport(agentId?: string) {
  const { data } = await Axios.get("/api/v1/widget-inbox/export", { params: agentId ? { agentId } : undefined });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `conversations-${agentId ?? "all"}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** A visitor has no name, so the id stands in for one. */
export function visitorLabel(visitorId: string) {
  return `Visitor ${visitorId.slice(0, 8)}`;
}
