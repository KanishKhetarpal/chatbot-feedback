import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export function ChatAgentDetailSkeleton() {
  return (
    <AppShell noPadding className="h-screen overflow-hidden">
      <div className="flex h-12 items-center justify-between gap-3 px-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-4 rounded" />
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-16 rounded" />
            <Skeleton className="h-4 w-40 rounded" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-56 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 border-t">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex gap-2 border-b px-3 py-2">
            {[64, 80, 72, 56, 52].map((width, index) => (
              <Skeleton key={index} className="h-7 rounded-md" style={{ width }} />
            ))}
          </div>
          <div className="mx-auto w-full max-w-3xl space-y-5 p-4">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>
        <div className="hidden w-[360px] border-l p-4 xl:block">
          <Skeleton className="h-full w-full rounded-2xl" />
        </div>
      </div>
    </AppShell>
  );
}
