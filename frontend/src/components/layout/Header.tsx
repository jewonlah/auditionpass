"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LogIn } from "lucide-react";

export function Header() {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  // 온보딩은 태스크형 헤더(닫기+타이틀)를 자체 렌더한다 — 12 §2.1·§2.2 "풀스크린 태스크"
  if (pathname?.startsWith("/onboarding")) return null;

  return (
    <header className="app-glass relative z-40 shrink-0 border-b border-gray-200">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
        {/* F2: 로고 = 로그인 시 앱 홈, 비로그인 시 랜딩 (앱을 나가는 문 B2 해소) */}
        <Link
          href={user ? "/home" : "/"}
          className="text-xl font-bold text-primary"
        >
          오디션패스
        </Link>

        {/* 로그아웃은 MY 페이지로 일원화 (F2) — 헤더에는 비로그인 로그인 진입만 */}
        {!loading && user && (
          <Link href="/my" className="flex min-h-11 items-center px-2 text-sm font-semibold text-primary">내 정보</Link>
        )}
        {!loading && !user && (
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover transition-colors"
          >
            <LogIn size={16} />
            <span>로그인</span>
          </Link>
        )}
      </div>
    </header>
  );
}
