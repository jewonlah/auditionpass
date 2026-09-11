import Image from "next/image";
import { Camera } from "lucide-react";
import type { Profile } from "@/types";
import { buildProfileDocument } from "@/lib/profile/document";
import { photoRows } from "@/lib/profile/photos";

export type PreviewProfile = Partial<Profile>;

/** Shared normalized document, with empty sections removed and user facts preserved. */
export function ProfilePreview({ profile, photos }: { profile: PreviewProfile; photos: string[] }) {
  const document = buildProfileDocument({ ...profile, photo_urls: photos });
  const p = document.profile;
  const images = p.photo_urls ?? [];
  const careerFirst = document.template === "career";
  const photoFirst = document.template === "portfolio";
  const facts = [p.birth_year ? `${p.birth_year}년생` : p.age ? `${p.age}세` : null, p.gender, p.height ? `${p.height}cm` : null, p.weight ? `${p.weight}kg` : null].filter(Boolean);
  const links = [["인스타그램", p.instagram_url], ["유튜브", p.youtube_url], ["포트폴리오", p.other_url]].filter(([, url]) => url);
  const photo = (url: string, label: string) => <Image src={url} alt={label} fill unoptimized sizes="(max-width: 448px) 90vw, 440px" className="object-contain" />;
  const career = p.career && <section><h3 className="mb-2 text-xs font-semibold text-gray-500">활동 이력</h3><p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-700">{p.career}</p></section>;
  return <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label="프로필 구성 미리보기" data-template={document.template}>
    {photoFirst && images[0] && <div className="relative aspect-[4/5] bg-gray-100">{photo(images[0], `${p.name || "지원자"} 대표 사진`)}</div>}
    <div className={!photoFirst && images[0] ? `grid ${careerFirst ? "grid-cols-[28%_72%]" : "grid-cols-[42%_58%]"}` : ""}>
      {!photoFirst && images[0] && <div className={`relative bg-gray-100 ${careerFirst ? "min-h-40" : "min-h-60"}`}>{photo(images[0], `${p.name || "지원자"} 대표 사진`)}</div>}
      <div className="flex min-w-0 flex-col justify-center p-5">
        <p className="text-xs font-semibold tracking-widest text-primary">CASTING PROFILE</p>
        <h2 className="mt-4 break-words text-3xl font-bold leading-tight tracking-tight">{p.name || "나의 이름"}</h2>
        {!!p.genre?.length && <p className="mt-2 text-sm font-medium text-gray-600">{p.genre.join(" · ")}</p>}
        {!!facts.length && <p className="mt-4 text-xs leading-relaxed text-gray-500">{facts.join(" · ")}</p>}
        {p.agency && <p className="mt-1 text-xs text-gray-500">{p.agency}</p>}
      </div>
    </div>
    <div className="space-y-5 px-5 pb-5">
      {careerFirst && career}
      {p.bio && <p className="whitespace-pre-line break-words text-base leading-relaxed text-gray-700">{p.bio}</p>}
      {!!p.specialty?.length && <section><h3 className="mb-2 text-xs font-semibold text-gray-500">특기</h3><p className="text-sm text-gray-700">{p.specialty.join(" · ")}</p></section>}
      {!careerFirst && career}
      {!p.bio && !p.career && !p.specialty?.length && !images.length && <p className="flex items-center gap-2 text-sm text-gray-500"><Camera size={18} />사진과 소개를 추가하면 더 풍성해져요.</p>}
    </div>
    {images.length > 1 && <div className="space-y-2 px-4 pb-4">{photoRows(images.slice(1)).map((row, i) => <div key={i} className={row.length === 1 ? "" : "grid grid-cols-2 gap-2"}>{row.map((url, j) => <div key={j} className={`relative overflow-hidden rounded-lg bg-gray-100 ${row.length === 1 ? "aspect-[4/3]" : "aspect-[3/4]"}`}>{photo(url, `포트폴리오 사진 ${i * 2 + j + 2}`)}</div>)}</div>)}</div>}
    {(p.phone || links.length > 0) && <footer className="space-y-2 border-t border-gray-100 p-5 text-sm">
      {p.phone && <p className="text-gray-600">연락처 · {p.phone}</p>}
      {links.map(([label, url]) => <a key={label} href={url!} target="_blank" rel="noopener noreferrer" className="block break-all font-medium text-primary underline underline-offset-4">{label}</a>)}
    </footer>}
  </article>;
}
