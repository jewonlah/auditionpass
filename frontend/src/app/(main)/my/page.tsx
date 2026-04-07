"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  Clock,
  Bell,
  Shield,
  FileText,
  HelpCircle,
  LogOut,
  ChevronRight,
  Mail,
  Loader2,
  PenSquare,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

interface MenuItem {
  href?: string;
  icon: React.ElementType;
  label: string;
  desc?: string;
  onClick?: () => void;
  external?: boolean;
}

export default function MyPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          setProfile(data.profile ?? null);
        }
      } catch {
        // 프로필 로드 실패 시 무시
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [user, authLoading, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  const accountMenus: MenuItem[] = [
    {
      href: "/profile",
      icon: User,
      label: "프로필 관리",
      desc: profile ? "프로필 수정" : "프로필 등록하기",
    },
    {
      href: "/history",
      icon: Clock,
      label: "지원 이력",
      desc: "지원한 오디션 확인",
    },
    {
      href: "/my/posts",
      icon: PenSquare,
      label: "내가 쓴 글",
      desc: "커뮤니티 작성글 관리",
    },
    {
      href: "/my/notifications",
      icon: Bell,
      label: "알림 설정",
      desc: "마감 임박 알림 등",
    },
  ];

  const supportMenus: MenuItem[] = [
    {
      href: "/my/notice",
      icon: FileText,
      label: "공지사항",
    },
    {
      href: "/my/faq",
      icon: HelpCircle,
      label: "자주 묻는 질문",
    },
    {
      href: "mailto:support@auditionpass.co.kr",
      icon: Mail,
      label: "문의하기",
      desc: "support@auditionpass.co.kr",
      external: true,
    },
  ];

  const legalMenus: MenuItem[] = [
    {
      href: "/my/terms",
      icon: FileText,
      label: "이용약관",
    },
    {
      href: "/my/privacy",
      icon: Shield,
      label: "개인정보처리방침",
    },
  ];

  return (
    <div className="pb-4">
      {/* 프로필 헤더 */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04),0_4px_16px_rgba(99,102,241,0.06)] mb-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            {profile?.photo_urls?.[0] ? (
              <img
                src={profile.photo_urls[0]}
                alt="프로필"
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <User size={24} className="text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold truncate">
              {profile?.name || "프로필을 등록해주세요"}
            </h2>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            {profile && (
              <div className="flex items-center gap-2 mt-1">
                {profile.genre?.map((g) => (
                  <span
                    key={g}
                    className="inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-primary"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Link
            href="/profile"
            className="shrink-0 text-xs font-semibold text-primary hover:underline"
          >
            {profile ? "수정" : "등록"}
          </Link>
        </div>
      </div>

      {/* 계정 관리 */}
      <MenuSection title="계정 관리" items={accountMenus} />

      {/* 고객 지원 */}
      <MenuSection title="고객 지원" items={supportMenus} />

      {/* 약관 및 정책 */}
      <MenuSection title="약관 및 정책" items={legalMenus} />

      {/* 로그아웃 */}
      <button
        onClick={handleLogout}
        className="mt-2 flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-sm text-red-500 font-medium shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:bg-red-50 transition-colors"
      >
        <LogOut size={18} />
        로그아웃
      </button>

      {/* 앱 정보 */}
      <p className="mt-6 text-center text-[11px] text-gray-300">
        오디션패스 v1.0.0
      </p>
    </div>
  );
}

function MenuSection({
  title,
  items,
}: {
  title: string;
  items: MenuItem[];
}) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">
        {title}
      </h3>
      <div className="rounded-xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-gray-50">
        {items.map((item) => {
          const Icon = item.icon;
          const content = (
            <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors">
              <Icon size={18} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{item.label}</span>
                {item.desc && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {item.desc}
                  </p>
                )}
              </div>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </div>
          );

          if (item.onClick) {
            return (
              <button
                key={item.label}
                onClick={item.onClick}
                className="w-full text-left"
              >
                {content}
              </button>
            );
          }

          if (item.external) {
            return (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {content}
              </a>
            );
          }

          return (
            <Link key={item.label} href={item.href!}>
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
