"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PhotoUpload } from "@/components/profile/PhotoUpload";
import { ProfilePreview } from "@/components/profile/ProfilePreview";
import Link from "next/link";
import { PROFILE_TEMPLATES } from "@/lib/profile/document";
import { cn, resolveReturnTo } from "@/lib/utils";
import { getProfileCompleteness, PROFILE_GENRES } from "@/lib/profile";
import { profileFormSchema, buildPolishRequest, type ProfileFormData } from "@/lib/profile/form";
import { track } from "@/lib/analytics";
import type { Profile } from "@/types";
import {
  Save,
  Camera as InstaIcon,
  Video,
  Link as LinkIcon,
  X,
  Plus,
} from "lucide-react";

const GENDERS = ["남성", "여성", "기타"] as const;
const GENRES = PROFILE_GENRES;

interface ProfileFormProps {
  initialData: Profile | null;
}

export function ProfileForm({ initialData }: ProfileFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [photos, setPhotos] = useState<string[]>(initialData?.photo_urls ?? []);
  const [serverError, setServerError] = useState("");
  const [specialtyInput, setSpecialtyInput] = useState("");
  const isEdit = !!initialData;

  // AI 소개문 — 랜딩의 약속 "프로필은 AI가 씁니다". 초안은 AI, 확정은 본인.
  const [polishing, setPolishing] = useState(false);
  const [polishError, setPolishError] = useState("");
  const [suggestedBio, setSuggestedBio] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema) as Resolver<ProfileFormData>,
    defaultValues: {
      template_id: initialData?.template_id ?? "casting",
      name: initialData?.name ?? "",
      // 구 데이터(age만 보유)는 출생연도로 환산해 프리필 (009 마이그레이션과 동일 규칙)
      birth_year:
        initialData?.birth_year ??
        (initialData?.age
          ? new Date().getFullYear() - initialData.age
          : (undefined as unknown as number)),
      gender: initialData?.gender ?? undefined,
      height: initialData?.height ?? null,
      weight: initialData?.weight ?? null,
      bio: initialData?.bio ?? "",
      instagram_url: initialData?.instagram_url ?? "",
      youtube_url: initialData?.youtube_url ?? "",
      other_url: initialData?.other_url ?? "",
      genre: (initialData?.genre ?? []).filter((g): g is typeof PROFILE_GENRES[number] => (PROFILE_GENRES as readonly string[]).includes(g)),
      activity_field: initialData?.activity_field ?? [],
      phone: initialData?.phone ?? "",
      agency: initialData?.agency ?? "",
      specialty: initialData?.specialty ?? [],
      career: initialData?.career ?? "",
    },
  });

  const selectedGender = watch("gender");
  const selectedGenre = watch("genre");
  const specialtyList = watch("specialty");
  const bioValue = watch("bio") ?? "";
  const careerValue = watch("career") ?? "";
  const previewValues = watch();

  function toggleGenre(g: typeof PROFILE_GENRES[number]) {
    const current = selectedGenre ?? [];
    const next = current.includes(g)
      ? current.filter((v) => v !== g)
      : [...current, g];
    setValue("genre", next, { shouldValidate: true });
  }

  function addSpecialty() {
    const tag = specialtyInput.trim();
    if (!tag || specialtyList.length >= 3) return;
    if (specialtyList.includes(tag)) {
      setSpecialtyInput("");
      return;
    }
    setValue("specialty", [...specialtyList, tag], { shouldValidate: true });
    setSpecialtyInput("");
  }

  function removeSpecialty(tag: string) {
    setValue(
      "specialty",
      specialtyList.filter((t) => t !== tag),
      { shouldValidate: true }
    );
  }

  async function onSubmit(data: ProfileFormData) {
    setServerError("");

    const payload = {
      ...data,
      activity_field: data.genre,
      height: data.height || null,
      weight: data.weight || null,
      bio: data.bio || null,
      instagram_url: data.instagram_url || null,
      youtube_url: data.youtube_url || null,
      other_url: data.other_url || null,
      phone: data.phone || null,
      agency: data.agency || null,
      career: data.career || null,
      photo_urls: photos,
    };

    try {
    const res = await fetch("/api/profile", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (!res.ok) {
      setServerError(result.error || "저장에 실패했습니다.");
      return;
    }

    if (getProfileCompleteness(initialData) < 100 && getProfileCompleteness(payload) === 100) {
      track("profile_complete");
    }

    // F3: 저장 후 원래 맥락으로 복귀 (랜딩 추방 버그 A6 해소), 폴백 /my
    // 온보딩(welcome)에서 왔으면 저장 즉시 홈 피드로 — 게이트를 방금 통과했다
    const fallback = searchParams.get("welcome") === "1" ? "/home" : "/my";
    router.push(resolveReturnTo(searchParams.get("returnTo"), fallback));
    router.refresh();
    } catch {
      setServerError("연결이 끊겨 저장하지 못했습니다. 입력 내용은 유지돼요. 다시 저장해주세요.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="font-semibold">사진과 정보가 한 장의 프로필로</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">입력한 정보에 맞춰 구성을 정돈해요. 소개는 AI 초안을 확인한 뒤 선택할 수 있어요.</p>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">프로필 스타일</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">{PROFILE_TEMPLATES.map((template) => <label key={template.id} className={cn("cursor-pointer rounded-xl border p-2 text-center text-sm", previewValues.template_id === template.id ? "border-primary bg-orange-50" : "border-gray-200")}>
            <input type="radio" value={template.id} {...register("template_id")} className="mb-2 accent-primary" onClick={() => setShowPreview(true)} />
            <span className="block font-semibold">{template.name}</span><span className="mt-1 block text-xs leading-relaxed text-gray-500">{template.description}</span>
          </label>)}</div>
        </fieldset>
        <Button type="button" variant="outline" className="mt-3 w-full" aria-expanded={showPreview} onClick={() => setShowPreview((v) => !v)}>{showPreview ? "미리보기 접기" : "내 프로필 미리보기"}</Button>
        {isEdit && <Link href="/profile/versions" className="mt-3 block py-2 text-center text-sm font-semibold text-primary">저장한 프로필 보기</Link>}
      </section>
      {showPreview && <div><ProfilePreview profile={previewValues} photos={photos} /><p className="mt-2 text-xs leading-relaxed text-gray-500">현재 편집 내용의 구성 예시예요. 저장한 정보가 지원 메일에 사용되며, 메일 화면은 수신 환경에 따라 달라질 수 있어요.</p></div>}
      {serverError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      {/* 사진 업로드 */}
      <PhotoUpload photos={photos} onChange={setPhotos} onUploadingChange={setUploadingPhoto} />

      {/* 기본 정보 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
          기본 정보
        </h3>

        <Input
          label="이름 *"
          placeholder="실명을 입력해주세요"
          error={errors.name?.message}
          {...register("name")}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="출생연도 *"
            type="number"
            placeholder="2004"
            error={errors.birth_year?.message}
            {...register("birth_year")}
          />
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              성별 *
            </label>
            <div className="flex gap-2">
              {GENDERS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setValue("gender", g, { shouldValidate: true })}
                  className={cn(
                    "flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                    selectedGender === g
                      ? "border-primary bg-primary text-white"
                      : "border-gray-300 text-gray-600 hover:border-gray-400"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
            {errors.gender && (
              <p className="mt-1 text-sm text-red-500">{errors.gender.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="키 (cm)"
            type="number"
            placeholder="170"
            error={errors.height?.message}
            {...register("height")}
          />
          <Input
            label="몸무게 (kg)"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="60"
            error={errors.weight?.message}
            className="[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            {...register("weight", {
              onChange: (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, "");
              },
            })}
          />
        </div>

        <Input
          label="연락처"
          type="tel"
          placeholder="010-0000-0000"
          error={errors.phone?.message}
          {...register("phone")}
        />
      </div>

      {/* 한 줄 소개 — 사실만 넣으면 AI가 초안을 쓴다 */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">한 줄 소개</label>
          <button
            type="button"
            disabled={polishing}
            onClick={async () => {
              setPolishError("");
              setPolishing(true);
              try {
                const v = getValues();
                const res = await fetch("/api/profile/polish", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(buildPolishRequest(v)),
                });
                // 400(검증)·413(과대 입력)·429(속도 제한) 모두 서버가 한국어 메시지를 준다 — 그대로 보여준다
                const data = await res.json().catch(() => ({}));
                if (!res.ok)
                  throw new Error(data.error || "소개문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
                setSuggestedBio(data.bio);
              } catch (e) {
                setPolishError(e instanceof Error ? e.message : "소개문 생성에 실패했습니다.");
              } finally {
                setPolishing(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {polishing ? (
              <>
                <span className="size-3 animate-spin rounded-full border-[1.5px] border-primary/30 border-t-primary" />
                쓰는 중…
              </>
            ) : (
              "AI 소개 초안 만들기"
            )}
          </button>
        </div>
        <textarea
          placeholder="자신을 한 줄로 소개해주세요"
          maxLength={100}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-base transition-colors placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          {...register("bio")}
        />
        <div className="flex justify-between mt-1">
          {errors.bio && (
            <p className="text-sm text-red-500">{errors.bio.message}</p>
          )}
          {polishError && !errors.bio && (
            <p className="text-sm text-red-500">{polishError}</p>
          )}
          <p className="text-xs text-gray-400 ml-auto">{bioValue.length}/100</p>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          분야·특기·경력을 바탕으로 초안을 만들어요. 확인 후 내 소개에 반영해주세요.
        </p>
        {suggestedBio && <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-semibold text-primary">AI가 제안한 소개</p><p className="mt-2 text-sm leading-relaxed">{suggestedBio}</p><div className="mt-3 flex gap-2"><Button type="button" size="sm" onClick={() => { setValue("bio", suggestedBio, { shouldValidate: true, shouldDirty: true }); setSuggestedBio(null); }}>이 소개 사용하기</Button><Button type="button" size="sm" variant="ghost" onClick={() => setSuggestedBio(null)}>기존 소개 유지</Button></div></div>}
      </div>

      {/* 장르 선택 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-3">
          지원 분야 * <span className="font-normal text-gray-500">복수 선택 가능</span>
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {GENRES.map((g) => {
            const selected = selectedGenre?.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGenre(g)}
                aria-pressed={selected}
                className={cn(
                  "flex-1 rounded-lg border-2 py-3 text-sm font-semibold transition-colors",
                  selected
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                )}
              >
                {g}
              </button>
            );
          })}
        </div>
        {errors.genre && (
          <p className="mt-1 text-sm text-red-500">{errors.genre.message}</p>
        )}
      </div>

      {/* 소속사 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
          소속 정보
        </h3>
        <Input
          label="소속사"
          placeholder="프리랜서인 경우 '프리랜서' 입력"
          error={errors.agency?.message}
          {...register("agency")}
        />
      </div>

      {/* 특기 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-3">
          특기 (최대 3개)
        </h3>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={specialtyInput}
            onChange={(e) => setSpecialtyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSpecialty();
              }
            }}
            placeholder="예: 액션연기, 수영, 피아노"
            maxLength={20}
            disabled={specialtyList.length >= 3}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-base transition-colors placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="button"
            onClick={addSpecialty}
            disabled={!specialtyInput.trim() || specialtyList.length >= 3}
            className="shrink-0 rounded-lg border border-primary bg-primary/5 px-3 py-2.5 text-primary transition-colors hover:bg-primary/10 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <Plus size={18} />
          </button>
        </div>
        {specialtyList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {specialtyList.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeSpecialty(tag)}
                  className="rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
        {errors.specialty && (
          <p className="mt-1 text-sm text-red-500">{errors.specialty.message}</p>
        )}
      </div>

      {/* 경력 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-3">
          경력
        </h3>
        <textarea
          placeholder="출연 작품, 수상 경력, 교육 이력 등을 자유롭게 작성해주세요"
          maxLength={500}
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-base transition-colors placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          {...register("career")}
        />
        <div className="flex justify-between mt-1">
          {errors.career && (
            <p className="text-sm text-red-500">{errors.career.message}</p>
          )}
          <p className="text-xs text-gray-400 ml-auto">{careerValue.length}/500</p>
        </div>
      </div>

      {/* 외부 링크 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
          외부 링크
        </h3>

        <div className="relative">
          <Input
            label="인스타그램"
            placeholder="https://instagram.com/username"
            error={errors.instagram_url?.message}
            {...register("instagram_url")}
          />
          <InstaIcon
            size={18}
            className="absolute right-3 top-[38px] text-gray-400 pointer-events-none"
          />
        </div>

        <div className="relative">
          <Input
            label="유튜브"
            placeholder="https://youtube.com/@channel"
            error={errors.youtube_url?.message}
            {...register("youtube_url")}
          />
          <Video
            size={18}
            className="absolute right-3 top-[38px] text-gray-400 pointer-events-none"
          />
        </div>

        <div className="relative">
          <Input
            label="기타 링크"
            placeholder="https://..."
            error={errors.other_url?.message}
            {...register("other_url")}
          />
          <LinkIcon
            size={18}
            className="absolute right-3 top-[38px] text-gray-400 pointer-events-none"
          />
        </div>
      </div>

      {/* 저장 버튼 */}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting || uploadingPhoto}
      >
        {isSubmitting ? (
          "저장 중..."
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Save size={18} />
            {isEdit ? "프로필 수정" : "프로필 등록"}
          </span>
        )}
      </Button>
    </form>
  );
}
