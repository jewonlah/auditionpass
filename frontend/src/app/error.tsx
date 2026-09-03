"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * 세그먼트 에러 바운더리. `error`는 하위 트리(레이아웃 제외)에서 던진
 * 예외를 잡는다. 루트 레이아웃 자체가 깨지는 경우는 `global-error.tsx`가 처리한다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <div className="mx-auto w-full max-w-sm">
        <TriangleAlert
          className="mx-auto size-10 text-red-500"
          strokeWidth={1.5}
          aria-hidden
        />
        <h1 className="mt-5 text-[20px] font-bold text-foreground">
          문제가 발생했어요
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
          화면을 불러오는 중 오류가 났어요. 다시 시도해도 계속되면 잠시 후
          다시 열어주세요.
        </p>
        <div className="mt-8 flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => reset()}
          >
            다시 시도
          </Button>
          <Link href="/" className="block">
            <Button variant="outline" size="lg" className="w-full">
              홈으로 가기
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
