"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Search, Send, MessagesSquare, CircleUser } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  /** prefix 활성 판정 대상 경로들 (F2 — PRD 활성 규칙) */
  activePrefixes: string[];
  /** 완전일치로만 활성 처리할 경로 (홈 탭의 `/` 예외 규칙) */
  activeExact?: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/home",
    icon: House,
    label: "홈",
    activePrefixes: ["/home"],
    activeExact: ["/"],
  },
  {
    href: "/auditions",
    icon: Search,
    label: "탐색",
    // `/audition/[id]` 상세(단수형)에서도 탐색 탭 활성
    activePrefixes: ["/auditions", "/audition"],
  },
  {
    href: "/applications",
    icon: Send,
    label: "지원",
    activePrefixes: ["/applications"],
  },
  {
    href: "/community",
    icon: MessagesSquare,
    label: "커뮤니티",
    activePrefixes: ["/community"],
  },
  {
    href: "/my",
    icon: CircleUser,
    label: "MY",
    activePrefixes: ["/my", "/profile"],
  },
];

function isTabActive(item: NavItem, pathname: string): boolean {
  if (item.activeExact?.includes(pathname)) return true;
  return item.activePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const { href, icon: Icon, label } = item;
          const isActive = isTabActive(item, pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-[48px] flex-1 flex-col items-center gap-0.5 pt-2 pb-1 text-[11px] transition-colors",
                isActive ? "text-primary font-semibold" : "text-gray-400"
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.75} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
