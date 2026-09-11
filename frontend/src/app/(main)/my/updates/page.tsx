import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, Clock3 } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { categoryFilter } from "@/lib/audition/filters";
import { todayKST, formatDday } from "@/lib/utils";

type UpdateAudition = { id: string; title: string; deadline: string | null; category: string | null; genre: string };

export default async function UpdatesPage() {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?returnTo=%2Fmy%2Fupdates");
  const today = todayKST();
  const soon = new Date(Date.parse(today + "T00:00:00Z") + 3 * 86400000).toISOString().slice(0, 10);
  const [{ data: profile, error: profileError }, { data: bookmarks, error: bookmarkError }] = await Promise.all([
    db.from("profiles").select("genre").eq("id", user.id).maybeSingle(),
    db.from("bookmarks").select("audition:auditions!inner(id,title,deadline,category,genre)")
      .eq("user_id", user.id).eq("audition.is_active", true).gte("audition.deadline", today).lte("audition.deadline", soon)
      .order("deadline", { referencedTable: "auditions", ascending: true }).limit(20),
  ]);
  const filter = categoryFilter(profile?.genre ?? []);
  const recent = filter ? await db.from("auditions").select("id,title,deadline,category,genre")
    .eq("is_active", true).or(`deadline.gte.${today},deadline.is.null`).or(filter)
    .gte("created_at", new Date(Date.parse(today + "T00:00:00+09:00") - 6 * 86400000).toISOString())
    .order("created_at", { ascending: false }).limit(20) : null;
  const closing = (bookmarks ?? []).flatMap((b) => b.audition ? [b.audition as unknown as UpdateAudition] : []);
  const newItems = (recent?.data ?? []) as UpdateAudition[];
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-bold">맞춤 소식</h1><p className="mt-2 text-sm leading-relaxed text-gray-500">찜한 공고의 마감과 내 분야의 새 공고를 확인하세요. 이 화면을 열 때 최신 소식을 불러와요.</p></header>
    <section><h2 className="mb-3 flex items-center gap-2 font-semibold"><Clock3 size={18} />3일 안에 마감하는 찜</h2>{bookmarkError ? <LoadError /> : <UpdateList items={closing} empty="곧 마감하는 찜 공고가 없어요." />}</section>
    <section><h2 className="mb-3 flex items-center gap-2 font-semibold"><Bell size={18} />내 분야 새 공고</h2><p className="mb-3 text-xs text-gray-500">최근 7일 · 최대 20건</p>{profileError || recent?.error ? <LoadError /> : filter ? <UpdateList items={newItems} empty="최근 일주일 동안 새 공고가 없어요." /> : <Link href="/profile?returnTo=%2Fmy%2Fupdates" className="block rounded-xl bg-white p-4 text-sm text-primary">프로필에 지원 분야를 선택해주세요.</Link>}</section>
  </div>;
}
function LoadError() { return <p role="alert" className="rounded-xl bg-white p-4 text-sm text-red-600">소식을 불러오지 못했어요. 잠시 후 새로고침해주세요.</p>; }
function UpdateList({ items, empty }: { items: UpdateAudition[]; empty: string }) {
  if (!items.length) return <p className="rounded-xl bg-white p-4 text-sm text-gray-500">{empty}</p>;
  return <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white">{items.map((a) => <li key={a.id}><Link href={"/audition/" + a.id} className="block p-4"><p className="text-sm font-semibold leading-relaxed">{a.title}</p><p className="mt-1 text-xs text-gray-500">{a.category ?? a.genre} · {formatDday(a.deadline)}</p></Link></li>)}</ul>;
}
