import { Skeleton } from "@/components/ui/primitives";

/** Skeleton matched to the real layout so there is no shift on load (docs/10 §6). */
export default function MembersLoading() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-48" />
      </div>
      <div className="space-y-px rounded-lg border p-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
