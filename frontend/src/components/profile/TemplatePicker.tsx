"use client";
import Image from "next/image";
import { COMPCARD_TEMPLATES, PROFILE_TEMPLATES, type TemplateId } from "@/lib/profile/templates";
import { cn } from "@/lib/utils";

export function TemplatePicker({ value, variant, onChange, onVariant, available }: {
  available: string[]; value: TemplateId; variant: "actor" | "model"; onChange: (id: TemplateId) => void; onVariant: (v: "actor" | "model") => void;
}) {
  return <fieldset>
    <legend className="text-lg font-semibold">어떤 프로필로 보낼까요?</legend>
    <p className="mt-2 text-base text-gray-600">같은 사진과 정보로 디자인을 바꿀 수 있어요.</p>
    <div className="mt-4 grid grid-cols-2 gap-3">
      {COMPCARD_TEMPLATES.map(t => <label key={t.id} className={cn("relative cursor-pointer overflow-hidden rounded-xl border bg-white", value === t.id ? "border-primary ring-1 ring-primary" : "border-gray-200")}>
        <div className="relative aspect-[210/297] bg-gray-100"><Image src={`/template-previews/${t.id}.png`} alt={`${t.name} 디자인 예시`} fill sizes="(max-width: 448px) 45vw, 200px" className="object-contain" /></div>
        <div className="p-3"><span className="flex items-center gap-2"><input type="radio" name="profile-template" value={t.id} disabled={!available.includes(t.id)} checked={value === t.id} onChange={() => onChange(t.id)} className="accent-primary" /><span className="font-semibold">{t.name}{!available.includes(t.id) && " · 준비 중"}</span></span><p className="mt-1 text-sm leading-relaxed text-gray-500">{t.description}</p></div>
      </label>)}
    </div>
    <p className="mt-2 text-sm text-gray-500">위 이미지는 예시입니다. 내 정보는 PDF 미리보기에서 확인하세요.</p>
    <div className="mt-4 space-y-2">
      <p className="text-base font-semibold">이전 서식</p>
      {PROFILE_TEMPLATES.filter(t => !COMPCARD_TEMPLATES.some(c => c.id === t.id)).map(t => <label key={t.id} className="flex min-h-11 items-center gap-2 text-base">
        <input type="radio" name="profile-template" value={t.id} disabled={!available.includes(t.id)} checked={value === t.id} onChange={() => onChange(t.id)} className="accent-primary" />{t.name}
      </label>)}
    </div>
    {COMPCARD_TEMPLATES.some(t => t.id === value) && !available.includes(value) && <p className="mt-3 text-base text-gray-600">현재 디자인은 유지하며 정보를 수정할 수 있어요. 다른 디자인으로 바꾸려면 사용 가능한 서식을 선택해주세요.</p>}
    {value === "classic" && <fieldset className="mt-4 flex gap-4"><legend className="mb-2 text-base font-semibold">클래식 구성</legend>{(["actor", "model"] as const).map(v => <label key={v} className="flex min-h-11 items-center gap-2"><input type="radio" name="template-variant" checked={variant === v} onChange={() => onVariant(v)} />{v === "actor" ? "배우 · 이력 중심" : "모델 · 사진 중심"}</label>)}</fieldset>}
    {!COMPCARD_TEMPLATES.some(t => t.id === value) && <p className="mt-3 text-sm text-gray-600">현재 {PROFILE_TEMPLATES.find(t => t.id === value)?.name ?? "알 수 없는 서식"}을 유지하고 있어요. 새 디자인을 선택하면 새 버전으로 저장돼요.</p>}
  </fieldset>;
}
