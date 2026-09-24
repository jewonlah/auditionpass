import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { ProfilePreview } from "@/components/profile/ProfilePreview";
import { ProfilePdf } from "@/components/profile/ProfilePdf";
import { PROFILE_TEMPLATES } from "@/lib/profile/document";
import type { Profile } from "@/types";

export default async function ProfileVersionsPage({ searchParams }: {
  searchParams: Promise<{ id?: string; before?: string }>;
}) {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?returnTo=%2Fprofile%2Fversions");
  const params = await searchParams;
  let query = db.from("profile_versions").select("id,version,profile,created_at")
    .eq("user_id", user.id).order("version", { ascending: false }).limit(10);
  if (params.id) {
    if (!z.string().uuid().safeParse(params.id).success) return <p role="alert">프로필 주소를 확인해주세요.</p>;
    query = query.eq("id", params.id);
  } else if (params.before && Number.isSafeInteger(Number(params.before)) && Number(params.before) > 0) {
    query = query.lt("version", Number(params.before));
  }
  const { data: versions, error } = await query;
  return <div className="space-y-5 pb-8">
    <Link href="/profile" className="inline-block py-2 text-sm font-semibold text-primary">프로필 편집으로</Link>
    <header><h1 className="text-2xl font-bold">저장한 프로필</h1><p className="mt-2 text-sm leading-relaxed text-gray-500">저장 시점의 정보와 스타일을 확인하세요. 현재 프로필을 수정해도 이전 버전의 내용은 유지돼요.</p></header>
    {error ? <div role="alert" className="rounded-xl border p-4"><p>저장한 프로필을 불러오지 못했습니다.</p><Link href="/profile/versions" className="mt-3 inline-block text-primary">다시 불러오기</Link></div> : !versions?.length ? <p className="rounded-xl border p-5 text-sm text-gray-500">확인할 수 있는 저장 버전이 없습니다.</p> : versions.map((row) => {
      const profile = row.profile as Profile;
      return <section key={row.id} className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">버전 {row.version} · {PROFILE_TEMPLATES.find((t) => t.id === profile.template_id)?.name ?? "알 수 없는 서식"}</h2><time className="text-xs text-gray-500" dateTime={row.created_at}>{new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })}</time></div>
        <ProfilePreview profile={profile} photos={profile.photo_urls ?? []} />
        <ProfilePdf versionId={row.id} />
      </section>;
    })}
    {!error && !params.id && versions?.length === 10 && <Link href={`/profile/versions?before=${versions[9].version}`} className="block rounded-xl border p-3 text-center font-semibold">이전 버전 더 보기</Link>}
    {params.id && <Link href="/profile/versions" className="block py-3 text-center font-semibold text-primary">전체 저장 버전 보기</Link>}
  </div>;
}
