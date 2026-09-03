import { cn } from "@/lib/utils";

/**
 * 스켈레톤 블록 — 스피너(Loader2) 대체용 (23_design-system.md §2.8).
 * 정식 shimmer 유틸(`@utility skeleton`)은 F12 토큰 이식 전이라, 그때까지는
 * 톤을 맞춘 정지 상태(`bg-gray-100` + `animate-pulse`)로 둔다. 행 높이는
 * 실제 카드와 맞춰 레이아웃 시프트가 나지 않게 호출부에서 지정한다.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-gray-100", className)} />;
}

/** 오디션 카드 자리의 스켈레톤 — AuditionCard와 동일한 패딩·행 구성 */
export function AuditionCardSkeleton() {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
        <Skeleton className="h-5 w-12 shrink-0" />
      </div>
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
  );
}

/** 커뮤니티 글 카드 자리의 스켈레톤 — PostCard와 동일한 패딩·행 구성 */
export function CommunityCardSkeleton() {
  return (
    <div className="rounded-xl bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <Skeleton className="h-4 w-16 mb-2" />
      <Skeleton className="h-5 w-4/5 mb-1" />
      <Skeleton className="h-4 w-full mb-1" />
      <Skeleton className="h-4 w-2/3 mb-3" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}
