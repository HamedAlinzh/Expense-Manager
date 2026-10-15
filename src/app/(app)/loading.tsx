import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="animate-in fade-in duration-300" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="mt-2 h-4 w-72 rounded-lg" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-72 rounded-2xl" />
    </div>
  );
}
