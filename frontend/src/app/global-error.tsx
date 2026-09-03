"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";

/**
 * 루트 레이아웃 자체가 깨졌을 때만 뜨는 최후의 폴백. `<html>`·`<body>`를
 * 직접 그려야 하고(레이아웃을 대체하므로 상속 없음), `metadata`/`generateMetadata`는
 * 쓸 수 없다. 스타일은 globals.css를 다시 import해서 동일 토큰을 그대로 쓴다.
 */
export default function GlobalError({
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
    <html lang="ko">
      <body className="min-h-full bg-background text-foreground">
        <title>문제가 발생했어요 | 오디션패스</title>
        <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-[20px] font-bold text-foreground">
              문제가 발생했어요
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
              페이지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
            </p>
            <div className="mt-8 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex h-[52px] w-full items-center justify-center rounded-lg bg-primary px-6 text-[16px] font-semibold text-white transition-colors hover:bg-primary-hover active:scale-[0.98]"
              >
                다시 시도
              </button>
              <Link
                href="/"
                className="inline-flex h-[52px] w-full items-center justify-center rounded-lg border-2 border-primary px-6 text-[16px] font-semibold text-primary transition-colors hover:bg-primary hover:text-white active:scale-[0.98]"
              >
                홈으로 가기
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
