"use client";

import { useCallback, useEffect, useState } from "react";

// 가입자 현황 — 콜 시트 언어(paper/ink/헤어라인·모노 라벨), 밀집 테이블.
// 목적: "누가·언제 가입했고, 프로필을 채웠고, 지원까지 갔는가"를 한 화면에서 본다.

interface ProfileInfo {
  name: string | null;
  gender: string | null;
  birth_year: number | null;
  genre: string[] | null;
  activity_field: string[] | null;
  photos: number;
  has_phone: boolean;
  agency: string | null;
  updated_at: string | null;
}

interface UserRow {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  provider: string | null;
  signup_source: string | null;
  profile: ProfileInfo | null;
  applications: number;
  last_application: string | null;
}

interface Summary {
  total: number;
  withProfile: number;
  signup7d: number;
  signup30d: number;
  active7d: number;
  applications: number;
  withSource: number;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "오늘";
  if (days < 30) return `${days}일 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export function UsersClient() {
  const [items, setItems] = useState<UserRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "조회 실패");
      setItems(json.items ?? []);
      setSummary(json.summary ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = summary
    ? [
        { label: "전체 가입", v: summary.total },
        { label: "프로필 작성", v: summary.withProfile },
        { label: "7일 신규", v: summary.signup7d },
        { label: "30일 신규", v: summary.signup30d },
        { label: "7일 활성", v: summary.active7d },
        { label: "누적 지원", v: summary.applications },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#FAFAF7] px-6 py-6 text-[#141414]">
      <header className="flex items-end justify-between border-b border-[#E7E5E0] pb-4">
        <div>
          <span className="font-mono text-[10.5px] font-semibold tracking-[0.12em] text-[#4F46E5] uppercase">
            Users
          </span>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-tight">가입자 현황</h1>
        </div>
        <button
          onClick={() => void load()}
          className="border border-[#E7E5E0] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#4A4A48] hover:border-[#C9C7C1]"
        >
          새로고침
        </button>
      </header>

      {summary && (
        <div className="mt-4 flex flex-wrap items-stretch divide-x divide-[#E7E5E0] border-y border-[#E7E5E0] bg-white">
          {cards.map((c) => (
            <div key={c.label} className="min-w-[112px] flex-1 px-4 py-3">
              <div className="font-mono text-[10px] tracking-[0.08em] text-[#8A8A86] uppercase">
                {c.label}
              </div>
              <div className="mt-0.5 text-[20px] font-extrabold tabular-nums">{c.v}</div>
            </div>
          ))}
        </div>
      )}

      {/* 유입 채널 수집 상태 — 값이 없으면 "0명"이 아니라 "아직 안 받는다"고 말해야 한다 */}
      {summary && summary.withSource === 0 && summary.total > 0 && (
        <div className="mt-3 border-l-2 border-[#F59E0B] bg-white px-3 py-2 text-[12.5px] text-[#4A4A48]">
          <span className="font-semibold text-[#F59E0B]">유입 채널 미수집</span> — 가입 시점에
          referrer·UTM 을 받아 적지 않아 경로를 알 수 없습니다. 아래 &lsquo;가입 수단&rsquo;은 로그인
          방식(이메일/구글)이지 유입 경로가 아닙니다. 전체 방문 기준 유입은 Vercel Analytics 에서
          확인하세요.
        </div>
      )}

      {err && (
        <div className="mt-3 border-l-2 border-[#EF4444] bg-white px-3 py-2 text-[13px] text-[#EF4444]">
          {err}
        </div>
      )}

      <div className="mt-4 overflow-x-auto border border-[#E7E5E0] bg-white">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#E7E5E0] font-mono text-[10px] tracking-[0.08em] text-[#8A8A86] uppercase">
              <th className="px-3 py-2">계정</th>
              <th className="w-28 px-2 py-2">가입일</th>
              <th className="w-32 px-2 py-2">최근 로그인</th>
              <th className="w-24 px-2 py-2">가입 수단</th>
              <th className="px-2 py-2">프로필</th>
              <th className="w-16 px-2 py-2 text-right">지원</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[#8A8A86]">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && !items.length && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-[#8A8A86]">
                  가입자가 없습니다.
                </td>
              </tr>
            )}
            {items.map((u) => {
              const isOpen = open === u.id;
              const p = u.profile;
              return (
                <>
                  <tr
                    key={u.id}
                    onClick={() => setOpen(isOpen ? null : u.id)}
                    className={`cursor-pointer border-b border-[#F0F0EE] align-top ${
                      isOpen ? "bg-[#4F46E5]/[0.04]" : "hover:bg-[#FAFAF7]"
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-semibold">{u.email ?? "(이메일 없음)"}</div>
                      <div className="mt-0.5 font-mono text-[10.5px] text-[#8A8A86]">
                        {u.id.slice(0, 8)}
                        {!u.confirmed && (
                          <span className="ml-1.5 text-[#F59E0B]">미인증</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">
                      {fmt(u.created_at)}
                      <div className="font-mono text-[10.5px] text-[#8A8A86]">
                        {ago(u.created_at)}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">
                      {fmt(u.last_sign_in_at)}
                      <div className="font-mono text-[10.5px] text-[#8A8A86]">
                        {ago(u.last_sign_in_at)}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[11.5px] text-[#4A4A48]">
                      {u.provider ?? "—"}
                    </td>
                    <td className="px-2 py-2.5">
                      {p ? (
                        <>
                          <span className="font-semibold">{p.name ?? "(이름 없음)"}</span>
                          <span className="ml-1.5 text-[#4A4A48]">
                            {[p.gender, p.birth_year ? `${p.birth_year}년생` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <div className="mt-0.5 font-mono text-[10.5px] text-[#8A8A86]">
                            {(p.genre ?? []).join("/") || "분야 미설정"} · 사진 {p.photos}장
                            {p.has_phone ? " · 전화 O" : " · 전화 X"}
                          </div>
                        </>
                      ) : (
                        <span className="text-[#F59E0B]">프로필 미작성</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono font-semibold tabular-nums">
                      {u.applications}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${u.id}-d`} className="border-b border-[#F0F0EE] bg-[#FAFAF7]">
                      <td colSpan={6} className="px-3 py-3">
                        <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[12.5px] md:grid-cols-4">
                          {[
                            ["사용자 ID", u.id],
                            ["가입 수단", u.provider ?? "—"],
                            ["유입 경로", u.signup_source ?? "미수집"],
                            ["이메일 인증", u.confirmed ? "완료" : "미완료"],
                            ["소속사", p?.agency ?? "—"],
                            ["활동 분야", (p?.activity_field ?? []).join(", ") || "—"],
                            ["프로필 수정", p?.updated_at ? fmt(p.updated_at) : "—"],
                            ["최근 지원", u.last_application ? fmt(u.last_application) : "—"],
                          ].map(([k, v]) => (
                            <div key={k as string}>
                              <dt className="font-mono text-[10px] tracking-[0.08em] text-[#8A8A86] uppercase">
                                {k}
                              </dt>
                              <dd className="mt-0.5 break-all">{v as string}</dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 font-mono text-[10.5px] text-[#8A8A86]">
        행을 클릭하면 상세 · 최대 200명 표시
      </p>
    </div>
  );
}
