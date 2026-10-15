import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="animate-in fade-in duration-300" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-48 rounded-lg" />
      <Skeleton className="mt-2 h-4 w-72 rounded-lg" />
      <div className="mt-8 grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-56 rounded-2xl lg:col-span-5" />
        <div className="grid grid-cols-2 gap-4 lg:col-span-7">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-26 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl lg:col-span-8" />
        <Skeleton className="h-80 rounded-2xl lg:col-span-4" />
      </div>
    </div>
  );
}
