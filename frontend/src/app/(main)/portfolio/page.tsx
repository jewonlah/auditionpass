import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, FolderOpen } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { ProfilePdf } from "@/components/profile/ProfilePdf";
import { PROFILE_TEMPLATES } from "@/lib/profile/document";
import type { Profile } from "@/types";

export const metadata = { title: "내 포트폴리오 | 오디션패스", robots: { index: false, follow: false } };

// 56 §12: reuse the versioned submission document before introducing multiple portfolios.
export default async function PortfolioPage() {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?returnTo=%2Fportfolio");

  const { data: profile, error: profileError } = await db.from("profiles")
    .select("document_version").eq("id", user.id).maybeSingle();
  const result = profile && !profileError
    ? await db.from("profile_versions").select("id,version,profile,created_at")
      .eq("user_id", user.id).eq("version", profile.document_version ?? 1).maybeSingle()
    : null;
  const version = result?.data;
  const savedProfile = version?.profile as Profile | undefined;
  const error = profileError || result?.error;
  const editorHref = "/profile?returnTo=%2Fportfolio";

  return <div className="space-y-6 pb-8">
    <header>
      <h1 className="text-3xl font-bold tracking-tight">내 포트폴리오</h1>
      <p className="mt-2 text-base leading-relaxed text-gray-600">한 번 준비하고, 여러 오디션에 보내세요.</p>
    </header>

    {error ? <section role="alert" className="rounded-2xl border border-gray-200 bg-white p-5">
      <p>포트폴리오를 불러오지 못했어요. 다시 불러와 주세요.</p>
      <Link href="/portfolio" className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary">다시 불러오기</Link>
    </section> : version && savedProfile ? <section aria-labelledby="saved-portfolio" className="app-surface space-y-5 border border-gray-200 bg-white p-4">
      <div className="portfolio-pass flex items-start gap-3">
        <FileText aria-hidden="true" className="mt-1 shrink-0 text-primary" size={28} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-500">현재 지원에 사용하는 저장본</p>
          <h2 id="saved-portfolio" className="mt-1 break-words text-xl font-bold">{savedProfile.name}의 포트폴리오</h2>
          <p className="mt-2 text-sm text-gray-600">버전 {version.version} · {PROFILE_TEMPLATES.find((template) => template.id === savedProfile.template_id)?.name ?? "알 수 없는 서식"}</p>
          <time dateTime={version.created_at} className="mt-1 block text-sm text-gray-500">{new Date(version.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })} 저장</time>
        </div>
      </div>
      <ProfilePdf versionId={version.id} />
      <Link href={editorHref} className="app-primary flex min-h-11 items-center justify-center bg-primary px-4 py-3 text-base font-semibold text-white">포트폴리오 편집하기</Link>
      <Link href="/profile/versions" className="flex min-h-11 items-center justify-center text-base font-semibold text-primary">이전 저장본 보기</Link>
    </section> : <section className="app-surface border border-gray-200 bg-white p-5">
      <FileText aria-hidden="true" size={32} className="text-primary" />
      <h2 className="mt-4 text-xl font-bold">{profile ? "제출할 저장본을 준비해 주세요" : "첫 포트폴리오를 만들어 보세요"}</h2>
      <p className="mt-2 text-base leading-relaxed text-gray-600">사진과 기본 정보, 소개를 담아 PDF로 만들어요. 작성한 소개는 AI 초안을 확인하며 다듬을 수 있어요.</p>
      <Link href={editorHref} className="app-primary mt-5 flex min-h-11 items-center justify-center bg-primary px-4 py-3 text-base font-semibold text-white">{profile ? "포트폴리오 편집하기" : "포트폴리오 만들기"}</Link>
    </section>}

    <section aria-labelledby="portfolio-materials" className="border-t border-gray-200 pt-5">
      <h2 id="portfolio-materials" className="text-lg font-bold">내 자료</h2>
      <Link href="/portfolio/materials" className="mt-2 flex min-h-11 items-center gap-3 py-3">
        <FolderOpen aria-hidden="true" size={22} className="shrink-0 text-gray-500" />
        <div><p className="text-base font-semibold">내 자료 보관함</p><p className="mt-1 text-sm leading-relaxed text-gray-600">사진·PDF·영상·음성 파일을 비공개로 보관해요.</p></div>
      </Link>
      <Link href="/my" className="inline-flex min-h-11 items-center text-base font-semibold text-primary">내 정보·계정 관리</Link>
    </section>
  </div>;
}
