import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { MaterialLibrary } from "@/components/profile/MaterialLibrary";
import { MATERIAL_COLUMNS, type Material } from "@/lib/materials/files";

export const metadata = { title: "내 자료 보관함 | 오디션패스", robots: { index: false, follow: false } };

export default async function MaterialsPage() {
  const db = await createServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?returnTo=%2Fportfolio%2Fmaterials");
  const { data, error } = await db.from("materials").select(MATERIAL_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
  return <div className="space-y-6 pb-8">
    <header>
      <Link href="/portfolio" className="inline-flex min-h-11 items-center font-semibold text-primary">포트폴리오로 돌아가기</Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">내 자료 보관함</h1>
      <p className="mt-2 leading-relaxed text-gray-600">사진과 파일을 한곳에 보관하세요. 보관한 자료는 나만 볼 수 있어요.</p>
    </header>
    <MaterialLibrary initialMaterials={(data ?? []) as Material[]} initialError={Boolean(error)} />
    <p className="text-sm leading-relaxed text-gray-600">지원 확인 화면에서 보관한 파일을 최대 3개 선택해 메일에 첨부할 수 있어요. 기본 프로필 PDF는 <Link href="/profile?returnTo=%2Fportfolio%2Fmaterials" className="font-semibold text-primary underline underline-offset-4">포트폴리오 편집기</Link>에서 관리해 주세요.</p>
  </div>;
}
